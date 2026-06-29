// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Chainlink AggregatorV3 interface for on-chain price reads.
/// Native Chainlink Data Feeds on Base expose this; we read the price IN the contract
/// so price-market resolution is trustless and independently verifiable.
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}
