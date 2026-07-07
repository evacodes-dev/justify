// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOptimisticOracleV3} from "./interfaces/IOptimisticOracleV3.sol";
import {Market} from "./Market.sol";

interface IResolverLike {
    function resolve(uint256 marketId, uint8 outcome, string calldata reason) external;
}

interface IFactoryLike {
    function markets(uint256) external view returns (address);
}

/// @title OptimisticSettler — optimistic finality layer shared by all off-chain truth sources.
/// @notice Architecture: truth sources (the AI oracle layer, the CRE event receiver) are
/// PROPOSERS, never finalizers. A proposal sits in a public challenge window, bond-free:
///   • unchallenged → anyone finalizes → Market resolves (free happy path);
///   • challenged   → the challenger posts a real bond and the counter-claim escalates to
///     UMA's Optimistic Oracle V3 (its own liveness, then DVM token-holder vote on dispute).
/// This contract never adjudicates content — it only routes: unchallenged proposals stand,
/// challenges are decided by UMA. Deterministic price markets bypass this entirely
/// (Resolver.resolveByPrice finalizes instantly from the committed Chainlink rule).
contract OptimisticSettler is Ownable {
    using SafeERC20 for IERC20;

    IResolverLike public immutable resolver;
    IFactoryLike public immutable factory;
    IOptimisticOracleV3 public immutable oov3;
    IERC20 public immutable bondCurrency;

    uint64 public challengeWindow; // public, bond-free review period for proposals
    uint64 public disputeLiveness; // UMA liveness for an escalated challenge

    /// Allowlisted truth sources (backend AI key, CRE receiver contract, …).
    mapping(address => bool) public proposers;

    enum Status {
        None,
        Proposed,
        Challenged,
        Settled
    }

    struct Proposal {
        uint8 outcome; // proposed outcome (0=NO,1=YES,2=INVALID)
        uint8 counterOutcome; // challenger's claim (when challenged)
        Status status;
        uint64 proposedAt;
        address proposer;
        address challenger;
        bytes32 assertionId; // UMA assertion for the counter-claim
        string reason; // proposer's evidence — public, what challengers evaluate
    }

    mapping(uint256 => Proposal) public proposals; // marketId => proposal
    mapping(bytes32 => uint256) private _assertionMarket; // assertionId => marketId + 1

    event ProposerSet(address indexed proposer, bool allowed);
    event WindowsSet(uint64 challengeWindow, uint64 disputeLiveness);
    event Proposed(uint256 indexed marketId, uint8 outcome, address indexed proposer, string reason);
    event Challenged(uint256 indexed marketId, uint8 counterOutcome, address indexed challenger, bytes32 assertionId, uint256 bond);
    event Finalized(uint256 indexed marketId, uint8 outcome, bool viaChallenge);
    event ChallengeDisputed(uint256 indexed marketId, bytes32 assertionId);
    event ResolveFailed(uint256 indexed marketId, uint8 outcome);

    constructor(
        address _resolver,
        address _factory,
        address _oov3,
        IERC20 _bondCurrency,
        uint64 _challengeWindow,
        uint64 _disputeLiveness
    ) Ownable(msg.sender) {
        require(_resolver != address(0) && _factory != address(0) && _oov3 != address(0), "zero");
        resolver = IResolverLike(_resolver);
        factory = IFactoryLike(_factory);
        oov3 = IOptimisticOracleV3(_oov3);
        bondCurrency = _bondCurrency;
        _setWindows(_challengeWindow, _disputeLiveness);
    }

    // ───────────────────────── admin ─────────────────────────

    function setProposer(address p, bool allowed) external onlyOwner {
        require(p != address(0), "zero");
        proposers[p] = allowed;
        emit ProposerSet(p, allowed);
    }

    function setWindows(uint64 _challengeWindow, uint64 _disputeLiveness) external onlyOwner {
        _setWindows(_challengeWindow, _disputeLiveness);
    }

    function _setWindows(uint64 w, uint64 l) internal {
        require(w >= 10 minutes && w <= 7 days, "window");
        require(l >= 10 minutes && l <= 7 days, "liveness");
        challengeWindow = w;
        disputeLiveness = l;
        emit WindowsSet(w, l);
    }

    // ───────────────────────── propose (AI layer / CRE) ─────────────────────────

    /// @notice Open a public, bond-free resolution proposal for a closed market.
    function propose(uint256 marketId, uint8 outcome, string calldata reason) external {
        require(proposers[msg.sender], "onlyProposer");
        require(outcome <= 2, "outcome");
        address m = factory.markets(marketId);
        require(m != address(0), "noMarket");
        require(block.timestamp >= Market(m).closeTime(), "tooEarly");
        require(!Market(m).resolved(), "resolved");
        require(proposals[marketId].status == Status.None, "exists");

        Proposal storage p = proposals[marketId];
        p.outcome = outcome;
        p.status = Status.Proposed;
        p.proposedAt = uint64(block.timestamp);
        p.proposer = msg.sender;
        p.reason = reason;
        emit Proposed(marketId, outcome, msg.sender, reason);
    }

    /// @notice Finalize an unchallenged proposal after the window. Permissionless.
    function finalize(uint256 marketId) external {
        Proposal storage p = proposals[marketId];
        require(p.status == Status.Proposed, "state");
        require(block.timestamp >= p.proposedAt + challengeWindow, "window");
        p.status = Status.Settled;
        _resolve(marketId, p.outcome, string.concat("Optimistic settlement (unchallenged): ", p.reason), false);
    }

    function canFinalize(uint256 marketId) external view returns (bool) {
        Proposal storage p = proposals[marketId];
        return p.status == Status.Proposed && block.timestamp >= p.proposedAt + challengeWindow;
    }

    // ───────────────────────── challenge → UMA escalation ─────────────────────────

    /// @notice Dispute a live proposal with your own claimed outcome. Posts the UMA minimum
    /// bond and escalates: the counter-claim is asserted on UMA — if nobody disputes it there
    /// within `disputeLiveness`, the challenger wins; if disputed, UMA's DVM vote decides.
    function challenge(uint256 marketId, uint8 counterOutcome, string calldata evidence)
        external
        returns (bytes32 assertionId)
    {
        Proposal storage p = proposals[marketId];
        require(p.status == Status.Proposed, "state");
        require(block.timestamp < p.proposedAt + challengeWindow, "windowOver");
        require(counterOutcome <= 2 && counterOutcome != p.outcome, "counter");

        uint256 bond = oov3.getMinimumBond(address(bondCurrency));
        bondCurrency.safeTransferFrom(msg.sender, address(this), bond);
        bondCurrency.forceApprove(address(oov3), bond);

        address m = factory.markets(marketId);
        bytes memory claim = abi.encodePacked(
            "Justify prediction market #",
            _toString(marketId),
            " (\"",
            Market(m).question(),
            "\") resolves ",
            _outcomeStr(counterOutcome),
            ", contrary to the open proposal of ",
            _outcomeStr(p.outcome),
            ". Challenger evidence: ",
            evidence
        );
        assertionId = oov3.assertTruth(
            claim, msg.sender, address(this), address(0), disputeLiveness, bondCurrency, bond, oov3.defaultIdentifier(), bytes32(0)
        );

        p.status = Status.Challenged;
        p.counterOutcome = counterOutcome;
        p.challenger = msg.sender;
        p.assertionId = assertionId;
        _assertionMarket[assertionId] = marketId + 1;
        emit Challenged(marketId, counterOutcome, msg.sender, assertionId, bond);
    }

    /// @notice Settle the escalated challenge on UMA once its liveness passed (permissionless
    /// keeper helper; UMA then calls our callback with the verdict).
    function settleChallenge(uint256 marketId) external {
        Proposal storage p = proposals[marketId];
        require(p.status == Status.Challenged, "state");
        oov3.settleAssertion(p.assertionId);
    }

    // ───────────────────────── UMA callbacks ─────────────────────────

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        require(msg.sender == address(oov3), "oov3");
        uint256 stored = _assertionMarket[assertionId];
        if (stored == 0) return; // unknown/stale
        uint256 marketId = stored - 1;
        Proposal storage p = proposals[marketId];
        if (p.status != Status.Challenged || p.assertionId != assertionId) return;
        p.status = Status.Settled;

        if (assertedTruthfully) {
            // challenger's counter-claim stood (unchallenged on UMA, or upheld by DVM)
            _resolve(marketId, p.counterOutcome, "Optimistic settlement: challenge upheld via UMA", true);
        } else {
            // challenge falsified — the original proposal stood through window + UMA dispute
            _resolve(marketId, p.outcome, string.concat("Optimistic settlement (challenge failed on UMA): ", p.reason), true);
        }
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        require(msg.sender == address(oov3), "oov3");
        uint256 stored = _assertionMarket[assertionId];
        if (stored == 0) return;
        emit ChallengeDisputed(stored - 1, assertionId); // DVM vote underway
    }

    // ───────────────────────── internals ─────────────────────────

    /// @dev Never revert back into UMA's settlement pipeline: if the market already settled
    /// another way, bonds must still settle — log and move on.
    function _resolve(uint256 marketId, uint8 outcome, string memory reason, bool viaChallenge) internal {
        try resolver.resolve(marketId, outcome, reason) {
            emit Finalized(marketId, outcome, viaChallenge);
        } catch {
            emit ResolveFailed(marketId, outcome);
        }
    }

    function _outcomeStr(uint8 o) internal pure returns (string memory) {
        return o == 1 ? "YES" : o == 0 ? "NO" : "INVALID";
    }

    /// @dev Minimal uint→decimal string (avoids OZ Strings, which needs Cancun's mcopy —
    /// we pin evm_version=paris for Arc compatibility).
    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 len;
        while (t != 0) {
            len++;
            t /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }
}
