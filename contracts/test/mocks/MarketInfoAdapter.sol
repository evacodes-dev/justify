// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MarketFactory} from "../../src/MarketFactory.sol";
import {Market} from "../../src/Market.sol";

/// @notice Thin IMarketInfo adapter over the legacy Market/MarketFactory stack, so the
/// OptimisticSettler can be tested (or deployed) against it. The CTF-stack MarketRegistry
/// implements the same views natively.
contract MarketInfoAdapter {
    MarketFactory public immutable factory;

    constructor(MarketFactory _factory) {
        factory = _factory;
    }

    function exists(uint256 id) external view returns (bool) {
        return factory.markets(id) != address(0);
    }

    function closeTimeOf(uint256 id) external view returns (uint64) {
        return Market(factory.markets(id)).closeTime();
    }

    function isResolved(uint256 id) external view returns (bool) {
        return Market(factory.markets(id)).resolved();
    }

    function questionOf(uint256 id) external view returns (string memory) {
        return Market(factory.markets(id)).question();
    }
}
