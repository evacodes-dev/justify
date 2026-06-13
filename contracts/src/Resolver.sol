// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Market} from "./Market.sol";

interface IFactory {
    function markets(uint256) external view returns (address);
}

/// @title Resolver — single oracle entry point that resolves markets on Arc.
/// @notice oracle = backend address. CRE only *simulates* resolution logic (it can't write to Arc);
/// the backend writes the actual outcome + reason here. `reason` is mandatory (on-chain justification).
contract Resolver {
    address public owner;
    address public oracle; // backend
    IFactory public factory;

    event OracleSet(address oracle);
    event FactorySet(address factory);
    event Resolved(uint256 indexed marketId, uint8 outcome, string reason);

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

    /// @notice Resolve `marketId` to `outcome` (0=NO,1=YES,2=INVALID) with an on-chain `reason`.
    function resolve(uint256 marketId, uint8 outcome, string calldata reason) external {
        require(msg.sender == oracle, "onlyOracle");
        address m = factory.markets(marketId);
        require(m != address(0), "noMarket");
        Market(m).resolve(outcome, reason);
        emit Resolved(marketId, outcome, reason);
    }
}
