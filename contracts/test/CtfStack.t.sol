// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {CtfResolver} from "../src/CtfResolver.sol";
import {OptimisticSettler} from "../src/OptimisticSettler.sol";
import {ICtf, IFpmm} from "../src/interfaces/ICtf.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockOOv3} from "./mocks/MockOOv3.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

/// Integration tests against the REAL audited Gnosis contracts: the vendored solc-0.5.16
/// artifacts (ConditionalTokens + FPMMDeterministicFactory) are deployed verbatim via
/// deployCode — exactly the bytecode that goes to Base.
contract CtfStackTest is Test {
    ICtf ctf;
    address fpmmFactory;
    MarketRegistry registry;
    CtfResolver resolver;
    OptimisticSettler settler;
    MockERC20 usdc;
    MockOOv3 oov3;
    MockAggregator feed;

    address creator = address(0xC0);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address stranger = address(0x5E);

    uint64 closeTime;
    uint256 constant L = 1_000e6;
    uint64 constant WINDOW = 2 hours;

    // outcome slots: index 0 = NO (indexSet 0b01 = 1), index 1 = YES (indexSet 0b10 = 2)
    uint256 constant IX_NO = 1;
    uint256 constant IX_YES = 2;

    function setUp() public {
        // the audited Gnosis stack, byte-for-byte
        ctf = ICtf(deployCode("vendor/out/ConditionalTokens.sol/ConditionalTokens.json"));
        fpmmFactory = deployCode("vendor/out/FPMMDeterministicFactory.sol/FPMMDeterministicFactory.json");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        oov3 = new MockOOv3();
        feed = new MockAggregator(5_000e8, 8, block.timestamp);

        registry = new MarketRegistry(address(ctf), fpmmFactory);
        resolver = new CtfResolver(address(ctf), address(registry));
        registry.setResolver(address(resolver));
        registry.setVerifier(address(this));
        registry.setCollateralAllowed(address(usdc), true);
        registry.registerCreator(creator);
        resolver.setOracle(address(this)); // break-glass path in tests
        resolver.setFeedAllowed(address(feed), true);

        settler = new OptimisticSettler(
            address(resolver), address(registry), address(oov3), IERC20(address(usdc)), WINDOW, WINDOW
        );
        resolver.setGlobalModule(address(settler), true);
        settler.setProposer(address(this), true);

        closeTime = uint64(block.timestamp + 7 days);
        usdc.mint(creator, 100_000e6);
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);
    }

    function _newMarket() internal returns (uint256 id, IFpmm fpmm, bytes32 conditionId) {
        vm.startPrank(creator);
        usdc.approve(address(registry), L);
        (id,) = registry.createMarket(IERC20(address(usdc)), "Will ETH close above $5k?", "ipfs://m", closeTime, L);
        vm.stopPrank();
        (address fpmmAddr, bytes32 cid,,,,,,) = registry.markets(id);
        fpmm = IFpmm(fpmmAddr);
        conditionId = cid;
    }

    function _posId(bytes32 conditionId, uint256 indexSet) internal view returns (uint256) {
        return ctf.getPositionId(address(usdc), ctf.getCollectionId(bytes32(0), conditionId, indexSet));
    }

    function _buy(IFpmm fpmm, address who, uint256 outcomeIndex, uint256 amount) internal returns (uint256 out) {
        vm.startPrank(who);
        usdc.approve(address(fpmm), amount);
        out = fpmm.calcBuyAmount(amount, outcomeIndex);
        fpmm.buy(amount, outcomeIndex, out);
        vm.stopPrank();
    }

    // ───────────────────────── core flow on audited contracts ─────────────────────────

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
        assertEq(usdc.balanceOf(alice) - before, ret, "native sell() works - UX gap closed");
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
        resolver.resolve(id, 0, "NO"); // alice's YES loses → pool keeps value

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

    // ───────────────────────── resolution paths on CTF ─────────────────────────

    function test_ResolveByPrice_OnCtf() public {
        (uint256 id,, bytes32 conditionId) = _newMarket();
        resolver.setPriceFeed(id, address(feed), 5_000e8, CtfResolver.Comparator.Above, 3600);
        vm.warp(closeTime + 1);
        feed.set(5_200e8, block.timestamp);
        vm.prank(stranger); // anyone, trustless
        resolver.resolveByPrice(id);
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "YES slot pays");
        assertEq(ctf.payoutNumerators(conditionId, 0), 0);
    }

    function test_Settler_ProposeFinalize_OnCtf() public {
        (uint256 id,, bytes32 conditionId) = _newMarket();
        vm.warp(closeTime + 1);
        settler.propose(id, 0, "AI verdict: NO");
        vm.warp(block.timestamp + WINDOW);
        vm.prank(stranger);
        settler.finalize(id);
        assertTrue(registry.isResolved(id));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1, "NO slot pays");
    }

    function test_Revert_DoubleResolve_OnCtf() public {
        (uint256 id,,) = _newMarket();
        vm.warp(closeTime + 1);
        resolver.resolve(id, 1, "first");
        vm.expectRevert(bytes("resolved"));
        resolver.resolve(id, 0, "second");
    }

    function test_Revert_CreateMarket_NotCreator() public {
        vm.startPrank(stranger);
        usdc.approve(address(registry), L);
        vm.expectRevert(bytes("notCreator"));
        registry.createMarket(IERC20(address(usdc)), "q", "m", closeTime, L);
        vm.stopPrank();
    }
}
