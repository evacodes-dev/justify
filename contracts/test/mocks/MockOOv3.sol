// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAssertionCallback {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
    function assertionDisputedCallback(bytes32 assertionId) external;
}

/// @notice Minimal UMA Optimistic Oracle V3 mock: pulls the bond, hands out assertion ids,
/// and lets tests drive the dispute/settlement callbacks explicitly.
contract MockOOv3 {
    using SafeERC20 for IERC20;

    struct A {
        address recipient;
        address asserter;
        IERC20 currency;
        uint256 bond;
        bool disputed;
    }

    mapping(bytes32 => A) public a;
    uint256 public nonce;
    uint256 public minBond = 100e6; // 100 USDC

    function setMinBond(uint256 b) external {
        minBond = b;
    }

    function getMinimumBond(address) external view returns (uint256) {
        return minBond;
    }

    function defaultIdentifier() external pure returns (bytes32) {
        return "ASSERT_TRUTH";
    }

    function assertTruth(
        bytes memory,
        address asserter,
        address callbackRecipient,
        address,
        uint64,
        IERC20 currency,
        uint256 bond,
        bytes32,
        bytes32
    ) external returns (bytes32 id) {
        id = keccak256(abi.encode(nonce++));
        currency.safeTransferFrom(msg.sender, address(this), bond);
        a[id] = A(callbackRecipient, asserter, currency, bond, false);
    }

    /// permissionless settle (undisputed → truthful), like the real thing post-liveness
    function settleAssertion(bytes32 id) external {
        require(!a[id].disputed, "disputed:useSettleWith");
        _settle(id, true);
    }

    // ── test drivers ──
    function dispute(bytes32 id) external {
        a[id].disputed = true;
        IAssertionCallback(a[id].recipient).assertionDisputedCallback(id);
    }

    function settleWith(bytes32 id, bool truthful) external {
        _settle(id, truthful);
    }

    function _settle(bytes32 id, bool truthful) internal {
        A memory x = a[id];
        if (truthful) x.currency.safeTransfer(x.asserter, x.bond); // winner gets the bond back
        IAssertionCallback(x.recipient).assertionResolvedCallback(id, truthful);
    }
}
