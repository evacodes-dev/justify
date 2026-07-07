// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {Resolver} from "../src/Resolver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

contract ResolverTest is Test {
    MarketFactory factory;
    Resolver resolver;
    MockERC20 usdc;
    MockAggregator feed;

    address creator = address(0xC0);
    address stranger = address(0x5E);
    address umaAdapter = address(0x111A);

    uint64 closeTime;
    uint256 constant L = 1_000e6;
    int256 constant THRESHOLD = 5_000e8; // $5,000 @ 8 decimals (Chainlink USD feeds)
    uint64 constant MAX_STALE = 3600;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        resolver = new Resolver();
        factory = new MarketFactory();
        factory.setResolver(address(resolver));
        factory.setVerifier(address(this));
        resolver.setFactory(address(factory));
        resolver.setOracle(address(this)); // test acts as backend oracle
        factory.registerCreator(creator);
        closeTime = uint64(block.timestamp + 7 days);
        usdc.mint(creator, 10_000e6);
        feed = new MockAggregator(THRESHOLD, 8, block.timestamp);
    }

    function _newMarket() internal returns (Market m, uint256 id) {
        vm.startPrank(creator);
        usdc.approve(address(factory), L);
        (id, ) = factory.createMarket(IERC20(address(usdc)), "Will ETH > $5k?", "ipfs://m", closeTime, L);
        vm.stopPrank();
        m = Market(factory.markets(id));
    }

    // ───────────────────────── on-chain price resolution ─────────────────────────
    function test_ResolveByPrice_Above_YES() public {
        (Market m, uint256 id) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(5_200e8, block.timestamp); // $5,200 > $5,000 -> YES
        vm.prank(stranger); // ANYONE can trigger
        resolver.resolveByPrice(id);
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 1, "above threshold -> YES");
    }

    function test_ResolveByPrice_Above_NO() public {
        (Market m, uint256 id) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(4_800e8, block.timestamp); // $4,800 < $5,000 -> NO
        resolver.resolveByPrice(id);
        assertEq(m.winningOutcome(), 0, "below threshold -> NO");
    }

    function test_ResolveByPrice_Below_YES() public {
        (Market m, uint256 id) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Below, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(4_800e8, block.timestamp); // 4800 < 5000, comparator Below -> YES
        resolver.resolveByPrice(id);
        assertEq(m.winningOutcome(), 1, "below threshold (Below) -> YES");
    }

    function test_Revert_ResolveByPrice_BeforeClose() public {
        (, uint256 id) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
        vm.expectRevert(bytes("tooEarly"));
        resolver.resolveByPrice(id);
    }

    function test_Revert_ResolveByPrice_Stale() public {
        (, uint256 id) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(5_200e8, block.timestamp - MAX_STALE - 1); // older than maxStale
        vm.expectRevert(bytes("stale"));
        resolver.resolveByPrice(id);
    }

    function test_Revert_ResolveByPrice_NoFeed() public {
        (, uint256 id) = _newMarket();
        vm.warp(closeTime + 1);
        vm.expectRevert(bytes("noFeed"));
        resolver.resolveByPrice(id);
    }

    function test_Revert_SetPriceFeed_NotOracle() public {
        (, uint256 id) = _newMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("onlyOracle"));
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
    }

    function test_Revert_SetPriceFeed_Twice() public {
        (, uint256 id) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
        vm.expectRevert(bytes("alreadySet"));
        resolver.setPriceFeed(id, address(feed), THRESHOLD, Resolver.Comparator.Above, MAX_STALE);
    }

    // ───────────────────────── UMA / AI-oracle seam ─────────────────────────
    function test_ResolverModule_CanSettle() public {
        (Market m, uint256 id) = _newMarket();
        resolver.setResolverModule(id, umaAdapter);
        vm.warp(closeTime + 1);
        vm.prank(umaAdapter); // the UMA adapter settles the subjective market
        resolver.resolve(id, 1, "UMA optimistic assertion settled YES");
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 1);
    }

    function test_Revert_Resolve_UnauthorizedSettler() public {
        (, uint256 id) = _newMarket();
        vm.warp(closeTime + 1);
        vm.prank(stranger);
        vm.expectRevert(bytes("onlySettler"));
        resolver.resolve(id, 1, "x");
    }

    function test_OracleStillSettles_ExternalPath() public {
        (Market m, uint256 id) = _newMarket();
        vm.warp(closeTime + 1);
        resolver.resolve(id, 0, "AI oracle: subjective verdict NO"); // oracle = address(this)
        assertEq(m.winningOutcome(), 0);
    }
}
