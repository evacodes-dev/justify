// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ISettlerLike {
    function propose(uint256 marketId, uint8 outcome, string calldata reason) external;
}

/// @title CREResolverModule — receiver for Chainlink CRE (DON) event-resolution reports.
/// @notice Truth source for OBJECTIVE non-price markets (sports scores, election results,
/// official statistics): a CRE workflow fetches the source APIs across multiple DON nodes,
/// reaches consensus, and delivers the report on-chain through Chainlink's forwarder. This
/// receiver turns that report into a PROPOSAL on the OptimisticSettler — like every off-chain
/// source it proposes, it does not finalize. The public challenge window (and UMA on dispute)
/// applies uniformly.
contract CREResolverModule is Ownable {
    ISettlerLike public immutable settler;
    /// Chainlink forwarder that delivers DON consensus reports. Only it may call onReport.
    address public forwarder;

    event ForwarderSet(address indexed forwarder);
    event ReportProposed(uint256 indexed marketId, uint8 outcome);

    constructor(address _settler, address _forwarder) Ownable(msg.sender) {
        require(_settler != address(0), "zero");
        settler = ISettlerLike(_settler);
        forwarder = _forwarder; // may be 0 until the CRE workflow is deployed
        emit ForwarderSet(_forwarder);
    }

    function setForwarder(address f) external onlyOwner {
        forwarder = f;
        emit ForwarderSet(f);
    }

    /// @notice Keystone-style receiver entrypoint. `report` is the workflow's consensus
    /// payload: abi.encode(uint256 marketId, uint8 outcome, string reason).
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        require(msg.sender == forwarder && forwarder != address(0), "forwarder");
        (uint256 marketId, uint8 outcome, string memory reason) = abi.decode(report, (uint256, uint8, string));
        require(outcome <= 2, "outcome");
        settler.propose(marketId, outcome, string.concat("Chainlink CRE (DON consensus): ", reason));
        emit ReportProposed(marketId, outcome);
    }
}
