// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {ICtf} from "./interfaces/ICtf.sol";

interface IRegistryLike {
    function exists(uint256 id) external view returns (bool);
    function closeTimeOf(uint256 id) external view returns (uint64);
    function questionIdOf(uint256 id) external view returns (bytes32);
    function isResolved(uint256 id) external view returns (bool);
}

/// @title CtfResolver — resolution router reporting to the AUDITED Gnosis ConditionalTokens.
/// @notice Same routing as Resolver (price path on-chain via Chainlink; external path via the
/// OptimisticSettler / modules; oracle break-glass for the beta) — but settlement is a payout
/// report to Gnosis CTF, which holds all collateral and pays winners. Outcome slots: [NO, YES];
/// INVALID reports [1,1] (50/50 refund). Same `resolve(marketId, outcome, reason)` ABI as
/// Resolver, so the settler and backend are unchanged.
contract CtfResolver is Ownable {
    enum Comparator {
        Below,
        Above
    }

    struct PriceFeed {
        address feed;
        int256 threshold; // in feed decimals
        Comparator comparator;
        uint64 maxStale; // freshness bound AND post-close trigger window
        bool set;
    }

    /// If nothing resolves a market, anyone may force INVALID after this grace past closeTime.
    uint64 public constant RESOLVE_GRACE = 30 days;

    ICtf public immutable ctf;
    IRegistryLike public immutable registry;
    address public oracle; // backend AI key — break-glass direct path (disable for mainnet)

    mapping(uint256 => PriceFeed) public priceFeeds;
    mapping(uint256 => address) public resolverModule; // per-market extra settler
    mapping(address => bool) public globalModules; // OptimisticSettler, future modules
    mapping(address => bool) public allowedFeeds; // owner-curated Chainlink aggregators

    event OracleSet(address indexed oracle);
    event FeedAllowed(address indexed feed, bool allowed);
    event GlobalModuleSet(address indexed module, bool allowed);
    event ResolverModuleSet(uint256 indexed marketId, address module);
    event PriceFeedSet(uint256 indexed marketId, address feed, int256 threshold, Comparator comparator, uint64 maxStale);
    event Resolved(uint256 indexed marketId, uint8 outcome, string reason);
    event PriceResolved(uint256 indexed marketId, address feed, int256 answer, int256 threshold, uint8 outcome);

    constructor(address _ctf, address _registry) Ownable(msg.sender) {
        require(_ctf != address(0) && _registry != address(0), "zero");
        ctf = ICtf(_ctf);
        registry = IRegistryLike(_registry);
    }

    // ───────────────────────── admin ─────────────────────────

    function setOracle(address o) external onlyOwner {
        require(o != address(0), "zero");
        oracle = o;
        emit OracleSet(o);
    }

    function setFeedAllowed(address feed, bool allowed) external onlyOwner {
        require(feed != address(0), "zero");
        allowedFeeds[feed] = allowed;
        emit FeedAllowed(feed, allowed);
    }

    function setGlobalModule(address module, bool allowed) external onlyOwner {
        require(module != address(0), "zero");
        globalModules[module] = allowed;
        emit GlobalModuleSet(module, allowed);
    }

    function setResolverModule(uint256 marketId, address module) external onlyOwner {
        resolverModule[marketId] = module;
        emit ResolverModuleSet(marketId, module);
    }

    // ───────────────────────── PRICE path (on-chain, trustless) ─────────────────────────

    function setPriceFeed(uint256 marketId, address feed, int256 threshold, Comparator comparator, uint64 maxStale)
        external
    {
        require(msg.sender == oracle, "onlyOracle");
        require(allowedFeeds[feed], "feedNotAllowed");
        require(registry.exists(marketId), "noMarket");
        require(!priceFeeds[marketId].set, "alreadySet");
        require(threshold > 0, "threshold");
        require(maxStale >= 60 && maxStale <= 7 days, "staleBounds");
        priceFeeds[marketId] = PriceFeed(feed, threshold, comparator, maxStale, true);
        emit PriceFeedSet(marketId, feed, threshold, comparator, maxStale);
    }

    /// Anyone can trigger within maxStale of close; outcome computed from the on-chain price.
    function resolveByPrice(uint256 marketId) external {
        PriceFeed memory pf = priceFeeds[marketId];
        require(pf.set, "noFeed");
        uint256 close = registry.closeTimeOf(marketId);
        require(block.timestamp >= close, "tooEarly");
        require(block.timestamp - close <= pf.maxStale, "window");

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            IAggregatorV3(pf.feed).latestRoundData();
        require(answer > 0, "badPrice");
        require(updatedAt != 0 && answeredInRound >= roundId, "round");
        require(block.timestamp - updatedAt <= pf.maxStale, "stale");

        bool yes = pf.comparator == Comparator.Above ? answer > pf.threshold : answer < pf.threshold;
        uint8 outcome = yes ? 1 : 0;
        _report(marketId, outcome, "Resolved on-chain via Chainlink Data Feed");
        emit PriceResolved(marketId, pf.feed, answer, pf.threshold, outcome);
    }

    // ───────────────────────── EXTERNAL path (settler / modules / break-glass) ─────────────────────────

    function resolve(uint256 marketId, uint8 outcome, string calldata reason) external {
        require(
            globalModules[msg.sender] || msg.sender == resolverModule[marketId] || msg.sender == oracle,
            "onlySettler"
        );
        require(block.timestamp >= registry.closeTimeOf(marketId), "tooEarly");
        _report(marketId, outcome, reason);
    }

    /// Ultimate backstop: if nothing has resolved the market long past close, anyone forces
    /// INVALID (50/50 refund) — funds in the CTF escrow can never be stranded.
    function forceResolveInvalid(uint256 marketId) external {
        uint256 close = registry.closeTimeOf(marketId);
        require(close != 0, "noMarket");
        require(block.timestamp >= close + RESOLVE_GRACE, "grace");
        _report(marketId, 2, "auto-invalid: nothing resolved within the grace period");
    }

    // ───────────────────────── internals ─────────────────────────

    function _report(uint256 marketId, uint8 outcome, string memory reason) internal {
        require(outcome <= 2, "outcome");
        require(registry.exists(marketId), "noMarket");
        require(!registry.isResolved(marketId), "resolved");
        // slots [NO, YES]: NO → [1,0], YES → [0,1], INVALID → [1,1]
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = outcome == 1 ? 0 : 1;
        payouts[1] = outcome == 0 ? 0 : 1;
        ctf.reportPayouts(registry.questionIdOf(marketId), payouts);
        emit Resolved(marketId, outcome, reason);
    }
}
