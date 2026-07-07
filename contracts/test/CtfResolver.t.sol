// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CtfBase} from "./CtfBase.t.sol";
import {CtfResolver} from "../src/CtfResolver.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

/// Resolution-router hardening on the product stack: the on-chain price path (feed
/// allowlist, set-once config, trigger window, staleness) and settler/module authorization.
contract CtfResolverTest is CtfBase {
    // ───────────────────────── on-chain price resolution ─────────────────────────
    function test_ResolveByPrice_Above_YES() public {
        (uint256 id,, bytes32 conditionId) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(5_200e8, block.timestamp); // $5,200 > $5,000 -> YES
        vm.prank(stranger); // ANYONE can trigger
        resolver.resolveByPrice(id);
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "above threshold -> YES");
        assertEq(ctf.payoutNumerators(conditionId, 0), 0);
    }

    function test_ResolveByPrice_Below_YES() public {
        (uint256 id,, bytes32 conditionId) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Below, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(4_800e8, block.timestamp);
        resolver.resolveByPrice(id);
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "below threshold (Below) -> YES");
    }

    function test_Revert_ResolveByPrice_BeforeClose() public {
        (uint256 id,,) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
        vm.expectRevert(bytes("tooEarly"));
        resolver.resolveByPrice(id);
    }

    /// H1 guard: no trigger-timing optionality — resolve near close or not at all.
    function test_Revert_ResolveByPrice_AfterWindow() public {
        (uint256 id,,) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
        vm.warp(closeTime + MAX_STALE + 1);
        feed.set(5_200e8, block.timestamp);
        vm.expectRevert(bytes("window"));
        resolver.resolveByPrice(id);
        // not stuck: the external path still settles it
        resolver.resolve(id, 1, "settled via oracle after missed window");
        assertTrue(registry.isResolved(id));
    }

    function test_Revert_ResolveByPrice_Stale() public {
        (uint256 id,,) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
        vm.warp(closeTime + 1);
        feed.set(5_200e8, block.timestamp - MAX_STALE - 1);
        vm.expectRevert(bytes("stale"));
        resolver.resolveByPrice(id);
    }

    function test_Revert_ResolveByPrice_NoFeed() public {
        (uint256 id,,) = _newMarket();
        vm.warp(closeTime + 1);
        vm.expectRevert(bytes("noFeed"));
        resolver.resolveByPrice(id);
    }

    // ───────────────────────── setPriceFeed hardening ─────────────────────────
    /// H2 guard: the oracle key cannot point the price path at an arbitrary contract.
    function test_Revert_SetPriceFeed_FeedNotAllowed() public {
        (uint256 id,,) = _newMarket();
        MockAggregator fake = new MockAggregator(1e8, 8, block.timestamp); // NOT allowlisted
        vm.expectRevert(bytes("feedNotAllowed"));
        resolver.setPriceFeed(id, address(fake), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
    }

    function test_Revert_SetPriceFeed_NotOracle() public {
        (uint256 id,,) = _newMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("onlyOracle"));
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
    }

    function test_Revert_SetPriceFeed_Twice() public {
        (uint256 id,,) = _newMarket();
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
        vm.expectRevert(bytes("alreadySet"));
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
    }

    function test_Revert_SetPriceFeed_NoMarket() public {
        vm.expectRevert(bytes("noMarket"));
        resolver.setPriceFeed(999, address(feed), THRESHOLD, CtfResolver.Comparator.Above, MAX_STALE);
    }

    function test_Revert_SetPriceFeed_StaleBounds() public {
        (uint256 id,,) = _newMarket();
        vm.expectRevert(bytes("staleBounds"));
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, 59);
        vm.expectRevert(bytes("staleBounds"));
        resolver.setPriceFeed(id, address(feed), THRESHOLD, CtfResolver.Comparator.Above, 8 days);
    }

    // ───────────────────────── settler / module authorization ─────────────────────────
    function test_Revert_Resolve_UnauthorizedSettler() public {
        (uint256 id,,) = _newClosedMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("onlySettler"));
        resolver.resolve(id, 1, "x");
    }

    function test_PerMarketModule_CanSettle() public {
        (uint256 id,,) = _newClosedMarket();
        address module = address(0x111A);
        resolver.setResolverModule(id, module);
        vm.prank(module);
        resolver.resolve(id, 1, "per-market module settles");
        assertTrue(registry.isResolved(id));
    }

    function test_Revert_DoubleResolve() public {
        (uint256 id,,) = _newClosedMarket();
        resolver.resolve(id, 1, "first");
        vm.expectRevert(bytes("resolved"));
        resolver.resolve(id, 0, "second");
    }

    function test_Revert_SetFeedAllowed_NotOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        resolver.setFeedAllowed(address(feed), true);
    }
}
