// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Market} from "./Market.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

interface IFactory {
    function markets(uint256) external view returns (address);
}

/// @title Resolver — resolution router for Justify markets.
/// @notice Two resolution paths, chosen per market:
///   1. PRICE (on-chain, trustless): a Chainlink Data Feed config is registered for the market;
///      `resolveByPrice` reads the feed IN THIS CONTRACT, compares to the threshold and resolves.
///      Anyone can trigger it after close — the outcome is computed from the on-chain price, not
///      supplied by a backend, so it is independently verifiable.
///   2. EXTERNAL (off-chain): `resolve` is called by an authorized settler. Today that is the
///      backend `oracle` (AI oracle layer). The per-market `resolverModule` seam lets us later
///      swap in a UMA optimistic-oracle adapter (AI oracle layer + UMA) WITHOUT touching Market
///      or this core — just point the market's module at the adapter.
contract Resolver {
    enum Comparator {
        Below, // YES if price <  threshold
        Above // YES if price >  threshold
    }

    struct PriceFeed {
        address feed; // Chainlink AggregatorV3
        int256 threshold; // in feed decimals
        Comparator comparator;
        uint64 maxStale; // max seconds since the feed's updatedAt (reject stale prices)
        bool set;
    }

    address public owner;
    address public oracle; // backend / AI oracle layer — default settler for EXTERNAL markets
    IFactory public factory;

    mapping(uint256 => PriceFeed) public priceFeeds; // marketId => on-chain price config
    mapping(uint256 => address) public resolverModule; // marketId => extra authorized settler (e.g. UMA adapter)

    event OracleSet(address oracle);
    event FactorySet(address factory);
    event PriceFeedSet(uint256 indexed marketId, address feed, int256 threshold, Comparator comparator, uint64 maxStale);
    event ResolverModuleSet(uint256 indexed marketId, address module);
    event Resolved(uint256 indexed marketId, uint8 outcome, string reason);
    event PriceResolved(uint256 indexed marketId, address feed, int256 answer, int256 threshold, uint8 outcome);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setOracle(address o) external onlyOwner {
        oracle = o;
        emit OracleSet(o);
    }

    function setFactory(address f) external onlyOwner {
        factory = IFactory(f);
        emit FactorySet(f);
    }

    /// @notice Register the on-chain price config for a market. Set-once (immutable thereafter) so
    /// the resolution rule can't be changed after the fact — that is what makes `resolveByPrice`
    /// trustless. Callable by the oracle when it classifies a market as price-based.
    function setPriceFeed(uint256 marketId, address feed, int256 threshold, Comparator comparator, uint64 maxStale)
        external
    {
        require(msg.sender == oracle, "onlyOracle");
        require(feed != address(0), "feed");
        require(!priceFeeds[marketId].set, "alreadySet");
        priceFeeds[marketId] = PriceFeed(feed, threshold, comparator, maxStale, true);
        emit PriceFeedSet(marketId, feed, threshold, comparator, maxStale);
    }

    /// @notice UMA / AI-oracle seam: authorize an extra settler for a market (e.g. a UMA OOv3
    /// adapter). Owner-gated. The adapter then calls `resolve` once its optimistic flow settles.
    function setResolverModule(uint256 marketId, address module) external onlyOwner {
        resolverModule[marketId] = module;
        emit ResolverModuleSet(marketId, module);
    }

    // ───────────────────────── PRICE path (on-chain, trustless) ─────────────────────────

    /// @notice Resolve a price market by reading its Chainlink feed on-chain. Callable by ANYONE
    /// after closeTime — the outcome is derived from the live on-chain price, not from a backend.
    function resolveByPrice(uint256 marketId) external {
        PriceFeed memory pf = priceFeeds[marketId];
        require(pf.set, "noFeed");
        address m = factory.markets(marketId);
        require(m != address(0), "noMarket");
        require(block.timestamp >= Market(m).closeTime(), "tooEarly");

        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(pf.feed).latestRoundData();
        require(answer > 0, "badPrice");
        require(block.timestamp - updatedAt <= pf.maxStale, "stale");

        uint8 outcome = _priceOutcome(answer, pf.threshold, pf.comparator);
        Market(m).resolve(outcome, "Resolved on-chain via Chainlink Data Feed");
        emit PriceResolved(marketId, pf.feed, answer, pf.threshold, outcome);
        emit Resolved(marketId, outcome, "Resolved on-chain via Chainlink Data Feed");
    }

    function _priceOutcome(int256 answer, int256 threshold, Comparator c) internal pure returns (uint8) {
        bool yes = c == Comparator.Above ? answer > threshold : answer < threshold;
        return yes ? 1 : 0;
    }

    // ───────────────────────── EXTERNAL path (off-chain settler) ─────────────────────────

    /// @notice Resolve `marketId` to `outcome` (0=NO,1=YES,2=INVALID) with an on-chain `reason`.
    /// Caller must be the backend `oracle` OR the market's authorized `resolverModule` (UMA adapter).
    function resolve(uint256 marketId, uint8 outcome, string calldata reason) external {
        require(msg.sender == oracle || msg.sender == resolverModule[marketId], "onlySettler");
        address m = factory.markets(marketId);
        require(m != address(0), "noMarket");
        Market(m).resolve(outcome, reason);
        emit Resolved(marketId, outcome, reason);
    }
}
