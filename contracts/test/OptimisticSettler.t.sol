// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {Resolver} from "../src/Resolver.sol";
import {OptimisticSettler} from "../src/OptimisticSettler.sol";
import {CREResolverModule} from "../src/CREResolverModule.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockOOv3} from "./mocks/MockOOv3.sol";

contract OptimisticSettlerTest is Test {
    MarketFactory factory;
    Resolver resolver;
    OptimisticSettler settler;
    CREResolverModule cre;
    MockERC20 usdc;
    MockOOv3 oov3;

    address creator = address(0xC0);
    address alice = address(0xA1);
    address bob = address(0xB0); // challenger
    address stranger = address(0x5E);

    uint64 closeTime;
    uint256 constant L = 1_000e6;
    uint64 constant WINDOW = 2 hours;
    uint64 constant LIVENESS = 2 hours;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        oov3 = new MockOOv3();
        resolver = new Resolver();
        factory = new MarketFactory();
        factory.setResolver(address(resolver));
        factory.setVerifier(address(this));
        factory.setCollateralAllowed(address(usdc), true);
        resolver.setFactory(address(factory));
        resolver.setOracle(address(this));
        factory.registerCreator(creator);

        settler = new OptimisticSettler(
            address(resolver), address(factory), address(oov3), IERC20(address(usdc)), WINDOW, LIVENESS
        );
        cre = new CREResolverModule(address(settler), address(this)); // test acts as DON forwarder
        resolver.setGlobalModule(address(settler), true);
        settler.setProposer(address(this), true); // test acts as the AI backend
        settler.setProposer(address(cre), true);

        closeTime = uint64(block.timestamp + 7 days);
        usdc.mint(creator, 10_000e6);
        usdc.mint(bob, 10_000e6);
    }

    function _newClosedMarket() internal returns (Market m, uint256 id) {
        vm.startPrank(creator);
        usdc.approve(address(factory), L);
        (id,) = factory.createMarket(IERC20(address(usdc)), "Will X win the election?", "ipfs://m", closeTime, L);
        vm.stopPrank();
        m = Market(factory.markets(id));
        vm.warp(closeTime + 1);
    }

    // ───────────────────────── happy path: propose → window → finalize ─────────────────────────
    function test_ProposeFinalize_Unchallenged() public {
        (Market m, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "AI verdict: X won per official tally");
        assertFalse(settler.canFinalize(id), "window still open");
        vm.warp(block.timestamp + WINDOW);
        assertTrue(settler.canFinalize(id));
        vm.prank(stranger); // finalize is permissionless
        settler.finalize(id);
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 1);
    }

    function test_Revert_Finalize_TooEarly() public {
        (, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.expectRevert(bytes("window"));
        settler.finalize(id);
    }

    function test_Revert_Propose_NotAllowlisted() public {
        (, uint256 id) = _newClosedMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("onlyProposer"));
        settler.propose(id, 1, "r");
    }

    function test_Revert_Propose_BeforeClose() public {
        vm.startPrank(creator);
        usdc.approve(address(factory), L);
        (uint256 id,) = factory.createMarket(IERC20(address(usdc)), "q", "m", closeTime, L);
        vm.stopPrank();
        vm.expectRevert(bytes("tooEarly"));
        settler.propose(id, 1, "r");
    }

    function test_Revert_DoubleProposal() public {
        (, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.expectRevert(bytes("exists"));
        settler.propose(id, 0, "r2");
    }

    // ───────────────────────── challenge → UMA ─────────────────────────
    function test_Challenge_Upheld_ReversesOutcome() public {
        (Market m, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "AI says YES");
        // bob disagrees, bonds up and escalates to UMA
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        bytes32 aid = settler.challenge(id, 0, "official recount says NO");
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(oov3)), 100e6, "bond escrowed on UMA");
        // nobody disputes bob on UMA → his counter-claim stands
        oov3.settleAssertion(aid);
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 0, "challenger outcome wins");
        assertEq(usdc.balanceOf(bob), 10_000e6, "bond returned to challenger");
    }

    function test_Challenge_Falsified_OriginalStands() public {
        (Market m, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "AI says YES");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        bytes32 aid = settler.challenge(id, 0, "bogus");
        vm.stopPrank();
        // bob's counter-claim is disputed on UMA and the DVM votes it FALSE
        oov3.dispute(aid);
        oov3.settleWith(aid, false);
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 1, "original proposal stands");
    }

    function test_Revert_Challenge_AfterWindow() public {
        (, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.warp(block.timestamp + WINDOW);
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        vm.expectRevert(bytes("windowOver"));
        settler.challenge(id, 0, "late");
        vm.stopPrank();
    }

    function test_Revert_Challenge_SameOutcome() public {
        (, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        vm.expectRevert(bytes("counter"));
        settler.challenge(id, 1, "agrees actually");
        vm.stopPrank();
    }

    function test_Revert_Finalize_WhenChallenged() public {
        (, uint256 id) = _newClosedMarket();
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

    /// already-settled market: UMA settlement must not revert (bonds must clear) — logged instead.
    function test_Callback_ResolveFailed_DoesNotRevert() public {
        (Market m, uint256 id) = _newClosedMarket();
        settler.propose(id, 1, "r");
        vm.startPrank(bob);
        usdc.approve(address(settler), 100e6);
        bytes32 aid = settler.challenge(id, 0, "c");
        vm.stopPrank();
        resolver.resolve(id, 2, "break-glass oracle settles first"); // oracle races ahead
        oov3.settleAssertion(aid); // callback fires, resolve fails inside, no revert
        assertEq(m.winningOutcome(), 2, "oracle outcome kept");
    }

    // ───────────────────────── CRE receiver → proposal ─────────────────────────
    function test_CRE_Report_Proposes_ThenFinalizes() public {
        (Market m, uint256 id) = _newClosedMarket();
        // test contract is the forwarder: deliver a DON consensus report
        cre.onReport("", abi.encode(id, uint8(0), "ESPN+AP consensus: team lost"));
        (, , OptimisticSettler.Status st,,,,,) = settler.proposals(id);
        assertEq(uint8(st), uint8(OptimisticSettler.Status.Proposed));
        vm.warp(block.timestamp + WINDOW);
        settler.finalize(id);
        assertTrue(m.resolved());
        assertEq(m.winningOutcome(), 0);
    }

    function test_Revert_CRE_NotForwarder() public {
        (, uint256 id) = _newClosedMarket();
        vm.prank(stranger);
        vm.expectRevert(bytes("forwarder"));
        cre.onReport("", abi.encode(id, uint8(1), "spoof"));
    }
}
