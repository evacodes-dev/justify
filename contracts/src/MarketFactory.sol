// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Market} from "./Market.sol";

/// @title MarketFactory — registers verified creators and deploys binary FPMM markets.
/// @notice `registerCreator` is called by the backend (verifier) AFTER a World ID 4.0 check.
/// Markets accept any ERC-20 collateral (USDC on Base).
contract MarketFactory is Ownable {
    using SafeERC20 for IERC20;

    address public verifier; // backend address — registers creators after World ID
    address public resolver; // Resolver contract — passed to every Market
    uint16 public defaultFeeBps = 200; // 2%

    mapping(address => bool) public isCreator;
    mapping(uint256 => address) public markets;
    uint256 public marketCount;

    event CreatorRegistered(address indexed user);
    event MarketCreated(
        uint256 indexed id, address market, address indexed creator, string question, uint64 closeTime
    );
    event VerifierSet(address indexed verifier);
    event ResolverSet(address indexed resolver);
    event DefaultFeeSet(uint16 bps);

    modifier onlyVerifier() {
        require(msg.sender == verifier, "verifier");
        _;
    }

    constructor() Ownable(msg.sender) {}

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

    function setDefaultFee(uint16 bps) external onlyOwner {
        require(bps <= 1000, "fee");
        defaultFeeBps = bps;
        emit DefaultFeeSet(bps);
    }

    // ───────────────────────── creators ─────────────────────────
    /// @notice Mark an address as a verified creator. Called by the backend after World ID.
    function registerCreator(address user) external onlyVerifier {
        isCreator[user] = true;
        emit CreatorRegistered(user);
    }

    // ───────────────────────── markets ─────────────────────────
    /// @notice Deploy a market. Caller must be a verified creator and must `approve` this factory
    /// for `initialLiquidity` collateral first (the factory funds the new market).
    function createMarket(
        IERC20 collateral,
        string calldata question,
        string calldata metadataURI,
        uint64 closeTime,
        uint256 initialLiquidity
    ) external returns (uint256 id, address market) {
        require(isCreator[msg.sender], "notCreator");
        require(resolver != address(0), "noResolver");

        Market m = new Market(
            msg.sender, resolver, collateral, question, metadataURI, closeTime, defaultFeeBps, initialLiquidity
        );
        // fund the freshly-deployed market with the creator's initial liquidity
        collateral.safeTransferFrom(msg.sender, address(m), initialLiquidity);

        id = marketCount++;
        markets[id] = address(m);
        market = address(m);
        emit MarketCreated(id, market, msg.sender, question, closeTime);
    }
}
