// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICtf, IFpmm, IFpmmFactory} from "./interfaces/ICtf.sol";

/// @title MarketRegistry — thin registry over the AUDITED Gnosis CTF/FPMM stack.
/// @notice Custody-free by design: collateral lives in Gnosis ConditionalTokens (ERC-1155
/// escrow) and trading happens on the audited FixedProductMarketMaker. This contract only
/// (1) gates creation behind World ID-verified creators, (2) prepares the condition with our
/// Resolver as oracle, (3) deploys+funds the FPMM via Gnosis' deterministic factory, and
/// (4) keeps the marketId → (fpmm, conditionId, questionId, closeTime) mapping the rest of
/// the system (Resolver, OptimisticSettler, backend) reads. Collateral passes through only
/// transiently inside createMarket.
contract MarketRegistry is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant OUTCOME_SLOTS = 2; // binary: index 0 = NO, index 1 = YES

    ICtf public immutable ctf;
    IFpmmFactory public immutable fpmmFactory;
    address public resolver; // condition oracle (reports payouts)
    address public verifier; // backend — registers creators after World ID
    uint256 public defaultFee = 2e16; // FPMM fee, fraction of 1e18 (2%)

    struct MarketInfo {
        address fpmm;
        bytes32 conditionId;
        bytes32 questionId;
        address creator;
        address collateral;
        uint64 closeTime;
        string question;
        string metadataURI;
    }

    mapping(uint256 => MarketInfo) public markets;
    uint256 public marketCount;
    mapping(address => bool) public isCreator;
    mapping(address => bool) public allowedCollateral;

    event CreatorRegistered(address indexed user);
    event MarketCreated(
        uint256 indexed id,
        address fpmm,
        bytes32 conditionId,
        address indexed creator,
        string question,
        uint64 closeTime
    );
    event VerifierSet(address indexed verifier);
    event ResolverSet(address indexed resolver);
    event DefaultFeeSet(uint256 fee);
    event CollateralAllowed(address indexed token, bool allowed);

    constructor(address _ctf, address _fpmmFactory) Ownable(msg.sender) {
        require(_ctf != address(0) && _fpmmFactory != address(0), "zero");
        ctf = ICtf(_ctf);
        fpmmFactory = IFpmmFactory(_fpmmFactory);
    }

    // ───────────────────────── admin ─────────────────────────

    function setVerifier(address v) external onlyOwner {
        require(v != address(0), "zero");
        verifier = v;
        emit VerifierSet(v);
    }

    function setResolver(address r) external onlyOwner {
        require(r != address(0), "zero");
        resolver = r;
        emit ResolverSet(r);
    }

    function setDefaultFee(uint256 fee) external onlyOwner {
        require(fee <= 1e17, "fee"); // ≤10%
        defaultFee = fee;
        emit DefaultFeeSet(fee);
    }

    function setCollateralAllowed(address token, bool allowed) external onlyOwner {
        require(token != address(0), "zero");
        allowedCollateral[token] = allowed;
        emit CollateralAllowed(token, allowed);
    }

    function registerCreator(address user) external {
        require(msg.sender == verifier, "verifier");
        isCreator[user] = true;
        emit CreatorRegistered(user);
    }

    // ───────────────────────── markets ─────────────────────────

    /// @notice Prepare the condition (oracle = Resolver), deploy the audited FPMM via Gnosis'
    /// factory and fund it with the creator's initial liquidity (approve this registry first).
    /// LP tokens minted for the initial funding are forwarded to the creator.
    function createMarket(
        IERC20 collateral,
        string calldata question,
        string calldata metadataURI,
        uint64 closeTime,
        uint256 initialLiquidity
    ) external returns (uint256 id, address fpmm) {
        require(isCreator[msg.sender], "notCreator");
        require(resolver != address(0), "noResolver");
        require(allowedCollateral[address(collateral)], "collateral");
        require(closeTime > block.timestamp, "closeTime");
        require(initialLiquidity > 0, "L=0");

        id = marketCount++;
        bytes32 questionId = keccak256(abi.encode(address(this), id, question));
        ctf.prepareCondition(resolver, questionId, OUTCOME_SLOTS);
        bytes32 conditionId = ctf.getConditionId(resolver, questionId, OUTCOME_SLOTS);

        // fund transiently: creator → registry → Gnosis factory (which funds the FPMM)
        collateral.safeTransferFrom(msg.sender, address(this), initialLiquidity);
        collateral.forceApprove(address(fpmmFactory), initialLiquidity);
        bytes32[] memory conditionIds = new bytes32[](1);
        conditionIds[0] = conditionId;
        fpmm = fpmmFactory.create2FixedProductMarketMaker(
            uint256(questionId), // salt — unique per market
            address(ctf),
            address(collateral),
            conditionIds,
            defaultFee,
            initialLiquidity,
            new uint256[](0) // no hint → balanced 50/50 start
        );
        // forward the LP tokens the factory returned to us
        IFpmm(fpmm).transfer(msg.sender, IFpmm(fpmm).balanceOf(address(this)));
        // forward any leftover outcome tokens the funding returned (zero for balanced funding)
        for (uint256 ix = 1; ix <= 2; ix++) {
            uint256 posId = ctf.getPositionId(address(collateral), ctf.getCollectionId(bytes32(0), conditionId, ix));
            uint256 bal = ctf.balanceOf(address(this), posId);
            if (bal > 0) ctf.safeTransferFrom(address(this), msg.sender, posId, bal, "");
        }

        markets[id] = MarketInfo(
            fpmm, conditionId, questionId, msg.sender, address(collateral), closeTime, question, metadataURI
        );
        emit MarketCreated(id, fpmm, conditionId, msg.sender, question, closeTime);
    }

    // ───────────────────────── views (read by Resolver / Settler / backend) ─────────────────────────

    function closeTimeOf(uint256 id) external view returns (uint64) {
        return markets[id].closeTime;
    }

    function questionIdOf(uint256 id) external view returns (bytes32) {
        return markets[id].questionId;
    }

    function fpmmOf(uint256 id) external view returns (address) {
        return markets[id].fpmm;
    }

    function questionOf(uint256 id) external view returns (string memory) {
        return markets[id].question;
    }

    /// resolved = payouts reported on the condition
    function isResolved(uint256 id) external view returns (bool) {
        MarketInfo storage m = markets[id];
        if (m.fpmm == address(0)) return false;
        return ctf.payoutDenominator(m.conditionId) != 0;
    }

    function exists(uint256 id) external view returns (bool) {
        return markets[id].fpmm != address(0);
    }

    // ───────────────────────── ERC-1155 receiver hooks ─────────────────────────
    // The FPMM funding flow safe-transfers (possibly zero) leftover outcome tokens back to
    // the funder (this registry) — accept them; createMarket forwards any real balance on.

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
