// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CtfBase} from "./CtfBase.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFpmm} from "../src/interfaces/ICtf.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// End-to-end integration on the REAL audited Gnosis bytecode: create -> trade -> resolve
/// -> redeem, plus native sell, INVALID refunds and LP exit.
contract CtfStackTest is CtfBase {
    function test_CreateMarket_DeploysFundedFpmm() public {
        (uint256 id, IFpmm fpmm, bytes32 conditionId) = _newMarket();
        assertEq(usdc.balanceOf(address(fpmm)), 0, "collateral sits in CTF, not FPMM");
        assertEq(usdc.balanceOf(address(ctf)), L, "escrow = audited ConditionalTokens");
        assertGt(fpmm.balanceOf(creator), 0, "creator got LP tokens");
        assertFalse(registry.isResolved(id));
        assertEq(ctf.payoutDenominator(conditionId), 0);
    }

    function test_BuyResolveRedeem_YES() public {
        (uint256 id, IFpmm fpmm, bytes32 conditionId) = _newMarket();
        uint256 got = _buy(fpmm, alice, 1, 100e6); // YES
        assertGt(got, 0);
        assertEq(ctf.balanceOf(alice, _posId(conditionId, IX_YES)), got, "ERC-1155 position held");

        vm.warp(closeTime + 1);
        resolver.resolve(id, 1, "YES per source"); // break-glass path
        assertTrue(registry.isResolved(id));

        uint256 before = usdc.balanceOf(alice);
        uint256[] memory sets = new uint256[](1);
        sets[0] = IX_YES;
        vm.prank(alice);
        ctf.redeemPositions(address(usdc), bytes32(0), conditionId, sets);
        assertEq(usdc.balanceOf(alice) - before, got, "1 winning share = 1 USDC on audited CTF");
    }

    function test_Sell_ExitsPositionBeforeClose() public {
        (, IFpmm fpmm, bytes32 conditionId) = _newMarket();
        uint256 got = _buy(fpmm, alice, 1, 100e6);
        uint256 before = usdc.balanceOf(alice);
        vm.startPrank(alice);
        ctf.setApprovalForAll(address(fpmm), true);
        uint256 ret = 40e6; // sell back for 40 USDC
        uint256 maxSell = fpmm.calcSellAmount(ret, 1);
        assertLe(maxSell, got, "sane sell quote");
        fpmm.sell(ret, 1, maxSell);
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice) - before, ret, "native sell() works");
        assertEq(ctf.balanceOf(alice, _posId(conditionId, IX_YES)), got - maxSell);
    }

    function test_Invalid_RefundsBothSides() public {
        (uint256 id, IFpmm fpmm, bytes32 conditionId) = _newMarket();
        uint256 gotYes = _buy(fpmm, alice, 1, 200e6);
        uint256 gotNo = _buy(fpmm, bob, 0, 200e6);

        vm.warp(closeTime + resolver.RESOLVE_GRACE());
        vm.prank(stranger);
        resolver.forceResolveInvalid(id); // ultimate backstop, anyone

        uint256[] memory setsY = new uint256[](1);
        setsY[0] = IX_YES;
        uint256 aBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        ctf.redeemPositions(address(usdc), bytes32(0), conditionId, setsY);
        assertEq(usdc.balanceOf(alice) - aBefore, gotYes / 2, "INVALID = 50% per YES share");

        uint256[] memory setsN = new uint256[](1);
        setsN[0] = IX_NO;
        uint256 bBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        ctf.redeemPositions(address(usdc), bytes32(0), conditionId, setsN);
        assertEq(usdc.balanceOf(bob) - bBefore, gotNo / 2, "INVALID = 50% per NO share");
    }

    function test_LP_RemoveFundingAndRedeem_AfterResolve() public {
        (uint256 id, IFpmm fpmm, bytes32 conditionId) = _newMarket();
        _buy(fpmm, alice, 1, 300e6);
        vm.warp(closeTime + 1);
        resolver.resolve(id, 0, "NO"); // alice's YES loses -> pool keeps value

        vm.startPrank(creator);
        fpmm.removeFunding(fpmm.balanceOf(creator)); // returns pooled outcome tokens + fees
        uint256[] memory both = new uint256[](2);
        both[0] = IX_NO;
        both[1] = IX_YES;
        uint256 before = usdc.balanceOf(creator);
        ctf.redeemPositions(address(usdc), bytes32(0), conditionId, both);
        vm.stopPrank();
        assertGt(usdc.balanceOf(creator) - before, 0, "LP recovers collateral via audited redeem");
    }

    function test_Revert_CreateMarket_NotCreator() public {
        vm.startPrank(stranger);
        usdc.approve(address(registry), L);
        vm.expectRevert(bytes("notCreator"));
        registry.createMarket(IERC20(address(usdc)), "q", "m", closeTime, L);
        vm.stopPrank();
    }

    function test_Revert_CreateMarket_CollateralNotAllowed() public {
        MockERC20 evil = new MockERC20("Evil", "EVL", 6); // not allowlisted
        evil.mint(creator, L);
        vm.startPrank(creator);
        evil.approve(address(registry), L);
        vm.expectRevert(bytes("collateral"));
        registry.createMarket(IERC20(address(evil)), "q", "m", closeTime, L);
        vm.stopPrank();
    }
}
