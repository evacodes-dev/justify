// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CtfBase} from "./CtfBase.t.sol";
import {OptimisticSettler} from "../src/OptimisticSettler.sol";
import {IFpmm} from "../src/interfaces/ICtf.sol";

/// Optimistic settlement flows on the product (CTF) stack: bond-free proposals from the
/// AI layer / CRE receiver, public challenge window, UMA escalation on dispute.
contract OptimisticSettlerTest is CtfBase {
    // ───────────────────────── happy path: propose -> window -> finalize ─────────────────────────
    function test_ProposeFinalize_Unchallenged() public {
        (uint256 id,, bytes32 conditionId) = _newClosedMarket();
        settler.propose(id, 1, "AI verdict: X won per official tally");
        assertFalse(settler.canFinalize(id), "window still open");
        vm.warp(block.timestamp + WINDOW);
        assertTrue(settler.canFinalize(id));
        vm.prank(stranger); // finalize is permissionless
        settler.finalize(id);
        assertTrue(registry.isResolved(id));
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "YES slot pays");
    }

    function test_Revert_Finalize_TooEarly() public {
        (uint256 id,,) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.expectRevert(bytes("window"));
        settler.finalize(id);
    }

    function test_Revert_Propose_NotAllowlisted() public {
        (uint256 id,,) = _newClosedMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("onlyProposer"));
        settler.propose(id, 1, "r");
    }

    function test_Revert_Propose_BeforeClose() public {
        (uint256 id,,) = _newMarket(); // not closed
        vm.expectRevert(bytes("tooEarly"));
        settler.propose(id, 1, "r");
    }

    function test_Revert_DoubleProposal() public {
        (uint256 id,,) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.expectRevert(bytes("exists"));
        settler.propose(id, 0, "r2");
    }

    // ───────────────────────── challenge -> UMA ─────────────────────────
    function test_Challenge_Upheld_ReversesOutcome() public {
        (uint256 id,, bytes32 conditionId) = _newClosedMarket();
        settler.propose(id, 1, "AI says YES");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        bytes32 aid = settler.challenge(id, 0, "official recount says NO");
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(oov3)), 100e6, "bond escrowed on UMA");
        oov3.settleAssertion(aid); // nobody disputes bob on UMA
        assertTrue(registry.isResolved(id));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1, "challenger outcome (NO) wins");
        assertEq(usdc.balanceOf(bob), 10_000e6, "bond returned to challenger");
    }

    function test_Challenge_Falsified_OriginalStands() public {
        (uint256 id,, bytes32 conditionId) = _newClosedMarket();
        settler.propose(id, 1, "AI says YES");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        bytes32 aid = settler.challenge(id, 0, "bogus");
        vm.stopPrank();
        oov3.dispute(aid);
        oov3.settleWith(aid, false); // DVM votes the challenge FALSE
        assertTrue(registry.isResolved(id));
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "original proposal stands");
    }

    function test_Revert_Challenge_AfterWindow() public {
        (uint256 id,,) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.warp(block.timestamp + WINDOW);
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        vm.expectRevert(bytes("windowOver"));
        settler.challenge(id, 0, "late");
        vm.stopPrank();
    }

    function test_Revert_Challenge_SameOutcome() public {
        (uint256 id,,) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        vm.expectRevert(bytes("counter"));
        settler.challenge(id, 1, "agrees actually");
        vm.stopPrank();
    }

    function test_Revert_Finalize_WhenChallenged() public {
        (uint256 id,,) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        settler.challenge(id, 0, "c");
        vm.stopPrank();
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(bytes("state"));
        settler.finalize(id);
    }

    function test_Callback_OnlyOOv3() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("oov3"));
        settler.assertionResolvedCallback(bytes32(uint256(1)), true);
    }

    /// already-settled market: UMA settlement must not revert (bonds must clear).
    function test_Callback_ResolveFailed_DoesNotRevert() public {
        (uint256 id,, bytes32 conditionId) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        bytes32 aid = settler.challenge(id, 0, "c");
        vm.stopPrank();
        resolver.resolve(id, 2, "break-glass oracle settles first"); // oracle races ahead
        oov3.settleAssertion(aid); // callback fires, inner resolve fails, no revert
        assertEq(ctf.payoutNumerators(conditionId, 0), 1, "INVALID payouts kept (1,1)");
        assertEq(ctf.payoutNumerators(conditionId, 1), 1);
    }

    // ───────────────────────── CRE receiver -> proposal ─────────────────────────
    function test_CRE_Report_Proposes_ThenFinalizes() public {
        (uint256 id,, bytes32 conditionId) = _newClosedMarket();
        cre.onReport("", abi.encode(id, uint8(0), "ESPN+AP consensus: team lost"));
        (,, OptimisticSettler.Status st,,,,,) = settler.proposals(id);
        assertEq(uint8(st), uint8(OptimisticSettler.Status.Proposed));
        vm.warp(block.timestamp + WINDOW);
        settler.finalize(id);
        assertTrue(registry.isResolved(id));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1);
    }

    function test_Revert_CRE_NotForwarder() public {
        (uint256 id,,) = _newClosedMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("forwarder"));
        cre.onReport("", abi.encode(id, uint8(1), "spoof"));
    }
}
