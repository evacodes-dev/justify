// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {Resolver} from "../src/Resolver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MarketTest is Test {
    MarketFactory factory;
    Resolver resolver;
    MockERC20 usdc;

    address creator = address(0xC0);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address stranger = address(0x5E);

    uint64 closeTime;
    uint256 constant L = 1_000e6; // 1000 USDC initial liquidity
    uint256 constant UNIT = 1e6;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        resolver = new Resolver();
        factory = new MarketFactory();
        // wiring (test contract is owner of both)
        factory.setResolver(address(resolver));
        factory.setVerifier(address(this)); // test acts as backend verifier
        resolver.setFactory(address(factory));
        resolver.setOracle(address(this)); // test acts as backend oracle
        factory.registerCreator(creator);

        closeTime = uint64(block.timestamp + 7 days);

        for (uint160 i = 1; i <= 3; i++) {
            address u = [creator, alice, bob][i - 1];
            usdc.mint(u, 10_000e6);
        }
    }

    function _newMarket() internal returns (Market m) {
        vm.startPrank(creator);
        usdc.approve(address(factory), L);
        (, address mAddr) =
            factory.createMarket(IERC20(address(usdc)), "Will ETH > $5k by July?", "ipfs://meta", closeTime, L);
        vm.stopPrank();
        m = Market(mAddr);
    }

    function _buy(Market m, address who, uint8 outcome, uint256 amount) internal returns (uint256 out) {
        vm.startPrank(who);
        usdc.approve(address(m), amount);
        out = m.buy(outcome, amount);
        vm.stopPrank();
    }

    // ───────────────────────── happy path ─────────────────────────
    function test_HappyPath_CreateBuyResolveRedeem() public {
        Market m = _newMarket();
        assertEq(m.priceYes(), 5e17, "starts 50/50");
        assertEq(usdc.balanceOf(address(m)), L, "market funded with L");

        uint256 aliceYes = _buy(m, alice, 1, 100e6); // alice buys YES
        uint256 bobNo = _buy(m, bob, 0, 100e6); // bob buys NO
        assertGt(aliceYes, 0);
        assertGt(bobNo, 0);

        vm.warp(closeTime + 1);
        resolver.resolve(0, 1, "ETH closed at $5,200 vs $5,000 target"); // YES wins (marketId 0)
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 1);

        // alice (YES) redeems, bob (NO) gets nothing
        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 payout = m.redeem();
        assertEq(payout, aliceYes, "1 winning share = 1 USDC unit");
        assertEq(usdc.balanceOf(alice) - balBefore, payout);

        vm.prank(bob);
        vm.expectRevert(bytes("nothing"));
        m.redeem();
    }

    function test_PriceMovesWithBuys() public {
        Market m = _newMarket();
        uint256 p0 = m.priceYes();
        _buy(m, alice, 1, 200e6); // buy YES → YES price up
        uint256 p1 = m.priceYes();
        assertGt(p1, p0, "buying YES raises YES price");
        _buy(m, bob, 0, 400e6); // buy NO → YES price down
        assertLt(m.priceYes(), p1, "buying NO lowers YES price");
    }

    // ───────────────────────── reverts ─────────────────────────
    function test_Revert_BuyAfterClose() public {
        Market m = _newMarket();
        vm.warp(closeTime + 1);
        vm.startPrank(alice);
        usdc.approve(address(m), 100e6);
        vm.expectRevert(bytes("closed"));
        m.buy(1, 100e6);
        vm.stopPrank();
    }

    function test_Revert_NonCreatorCreate() public {
        vm.startPrank(stranger);
        usdc.approve(address(factory), L);
        vm.expectRevert(bytes("notCreator"));
        factory.createMarket(IERC20(address(usdc)), "q", "m", closeTime, L);
        vm.stopPrank();
    }

    function test_Revert_DoubleResolve() public {
        _newMarket();
        vm.warp(closeTime + 1);
        resolver.resolve(0, 1, "first");
        vm.expectRevert(bytes("resolved"));
        resolver.resolve(0, 0, "second");
    }

    function test_Revert_RegisterByNonVerifier() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("verifier"));
        factory.registerCreator(stranger);
    }

    function test_Revert_RedeemBeforeResolve() public {
        Market m = _newMarket();
        _buy(m, alice, 1, 100e6);
        vm.prank(alice);
        vm.expectRevert(bytes("!resolved"));
        m.redeem();
    }

    function test_Revert_ResolveByNonOracle() public {
        _newMarket();
        vm.warp(closeTime + 1);
        vm.prank(stranger);
        vm.expectRevert(bytes("onlySettler"));
        resolver.resolve(0, 1, "x");
    }

    function test_Revert_DirectResolveBypassingResolver() public {
        Market m = _newMarket();
        vm.warp(closeTime + 1);
        vm.prank(stranger);
        vm.expectRevert(bytes("onlyResolver"));
        m.resolve(1, "x");
    }

    function test_Revert_ResolveBeforeClose() public {
        _newMarket();
        vm.expectRevert(bytes("tooEarly"));
        resolver.resolve(0, 1, "early");
    }

    // ───────────────────────── invariants ─────────────────────────
    /// constant-product k must not decrease on a buy (fees are taken outside the curve)
    function testFuzz_KNonDecreasingOnBuy(uint256 amount, bool yes) public {
        Market m = _newMarket();
        amount = bound(amount, 1e6, 5_000e6);
        usdc.mint(alice, amount);
        (uint256 ry0, uint256 rn0) = m.reserves();
        uint256 k0 = ry0 * rn0;
        _buy(m, alice, yes ? 1 : 0, amount);
        (uint256 ry1, uint256 rn1) = m.reserves();
        assertGe(ry1 * rn1, k0, "k must not decrease");
    }

    /// no value leak: after resolution, all winner payouts + LP withdrawal <= collateral in market
    function test_Solvency_NoLeak() public {
        Market m = _newMarket();
        _buy(m, alice, 1, 300e6);
        _buy(m, bob, 0, 150e6);
        _buy(m, alice, 1, 120e6);
        uint256 funded = usdc.balanceOf(address(m));

        vm.warp(closeTime + 1);
        resolver.resolve(0, 1, "YES");

        uint256 paid;
        vm.prank(alice);
        paid += m.redeem();
        // bob lost, nothing to redeem
        vm.prank(creator);
        paid += m.removeLiquidity(); // LP pulls residual + fees
        assertLe(paid, funded, "total released <= collateral locked");
        // dust may remain; never exceeds what was locked
    }

    function test_InvalidRefund() public {
        Market m = _newMarket();
        uint256 aliceYes = _buy(m, alice, 1, 200e6);
        uint256 bobNo = _buy(m, bob, 0, 200e6);
        vm.warp(closeTime + 1);
        resolver.resolve(0, 2, "ambiguous source"); // INVALID

        vm.prank(alice);
        uint256 ap = m.redeem();
        assertEq(ap, aliceYes / 2, "INVALID refunds YES at 0.5");
        vm.prank(bob);
        uint256 bp = m.redeem();
        assertEq(bp, bobNo / 2, "INVALID refunds NO at 0.5");
    }

    // ───────────────────────── emergency resolution (oracle-down safety) ─────────────────────────
    function test_ForceInvalid_AfterGrace_UnlocksFunds() public {
        Market m = _newMarket();
        uint256 aliceYes = _buy(m, alice, 1, 200e6);
        // oracle never resolves; before grace it must revert
        vm.warp(closeTime + 1);
        vm.expectRevert(bytes("grace"));
        m.forceResolveInvalid();
        // after grace anyone (stranger) can force INVALID
        vm.warp(closeTime + m.RESOLVE_GRACE());
        vm.prank(stranger);
        m.forceResolveInvalid();
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 2, "forced INVALID");
        // alice recovers her stake at 0.5
        vm.prank(alice);
        assertEq(m.redeem(), aliceYes / 2, "INVALID refund after force");
    }

    function test_Revert_ForceInvalid_WhenAlreadyResolved() public {
        Market m = _newMarket();
        vm.warp(closeTime + 1);
        resolver.resolve(0, 1, "YES");
        vm.warp(closeTime + m.RESOLVE_GRACE());
        vm.expectRevert(bytes("resolved"));
        m.forceResolveInvalid();
    }

    // ───────────────────────── second LP ─────────────────────────
    function test_SecondLP_AddRemoveLiquidity() public {
        Market m = _newMarket();
        _buy(m, alice, 1, 200e6);
        // bob adds liquidity at the current (moved) price
        vm.startPrank(bob);
        usdc.approve(address(m), 500e6);
        uint256 lpShares = m.addLiquidity(500e6);
        vm.stopPrank();
        assertGt(lpShares, 0, "LP shares minted");

        vm.warp(closeTime + 1);
        resolver.resolve(0, 0, "NO"); // alice's YES loses → more residual for LPs
        uint256 funded = usdc.balanceOf(address(m));
        uint256 paid;
        vm.prank(creator);
        paid += m.removeLiquidity();
        vm.prank(bob);
        paid += m.removeLiquidity();
        assertLe(paid, funded, "LP withdrawals <= collateral locked");
    }

    // ───────────────────────── multi-collateral (EURC) ─────────────────────────
    function test_EURC_Market() public {
        MockERC20 eurc = new MockERC20("Euro Coin", "EURC", 6);
        eurc.mint(creator, 5_000e6);
        eurc.mint(alice, 5_000e6);

        vm.startPrank(creator);
        eurc.approve(address(factory), L);
        (, address mAddr) =
            factory.createMarket(IERC20(address(eurc)), "EUR market?", "ipfs://eur", closeTime, L);
        vm.stopPrank();
        Market m = Market(mAddr);
        assertEq(address(m.collateral()), address(eurc));

        vm.startPrank(alice);
        eurc.approve(address(m), 100e6);
        uint256 out = m.buy(1, 100e6);
        vm.stopPrank();
        assertGt(out, 0);
        assertEq(eurc.balanceOf(address(m)), L + 100e6);
    }
}
