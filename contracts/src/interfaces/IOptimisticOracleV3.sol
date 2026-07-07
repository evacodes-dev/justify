// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal UMA Optimistic Oracle V3 interface (assert-truth flow).
/// An assertion posts a bond and opens a challenge window (`liveness`). If undisputed,
/// settling calls back `assertionResolvedCallback(id, true)`. If disputed, UMA's DVM votes
/// and the callback fires with the DVM verdict once settled.
interface IOptimisticOracleV3 {
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId);

    function settleAssertion(bytes32 assertionId) external;

    function getMinimumBond(address currency) external view returns (uint256);

    function defaultIdentifier() external view returns (bytes32);
}
