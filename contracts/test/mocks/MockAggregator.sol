// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Chainlink AggregatorV3 mock for tests. Set price + updatedAt.
contract MockAggregator {
    int256 public answer;
    uint8 public decimals;
    uint256 public updatedAt;

    constructor(int256 _answer, uint8 _decimals, uint256 _updatedAt) {
        answer = _answer;
        decimals = _decimals;
        updatedAt = _updatedAt;
    }

    function set(int256 _answer, uint256 _updatedAt) external {
        answer = _answer;
        updatedAt = _updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}
