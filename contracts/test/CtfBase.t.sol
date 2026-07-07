// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {CtfResolver} from "../src/CtfResolver.sol";
import {OptimisticSettler} from "../src/OptimisticSettler.sol";
import {CREResolverModule} from "../src/CREResolverModule.sol";
import {ICtf, IFpmm} from "../src/interfaces/ICtf.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockOOv3} from "./mocks/MockOOv3.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

/// Shared fixture for the product stack: the REAL audited Gnosis contracts (vendored
/// solc-0.5.16 artifacts deployed verbatim via deployCode) + our thin layer wired the same
/// way DeployCtf.s.sol does it. Every suite extends this — one setup, zero duplication.
abstract contract CtfBase is Test {
    ICtf ctf;
    address fpmmFactory;
    MarketRegistry registry;
    CtfResolver resolver;
    OptimisticSettler settler;
    CREResolverModule cre;
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
    int256 constant THRESHOLD = 5_000e8; // $5,000 @ 8 decimals
    uint64 constant MAX_STALE = 3600;

    // outcome slots: index 0 = NO (indexSet 0b01 = 1), index 1 = YES (indexSet 0b10 = 2)
    uint256 constant IX_NO = 1;
    uint256 constant IX_YES = 2;

    function setUp() public virtual {
        // audited Gnosis stack, byte-for-byte
        ctf = ICtf(deployCode("vendor/out/ConditionalTokens.sol/ConditionalTokens.json"));
        fpmmFactory = deployCode("vendor/out/FPMMDeterministicFactory.sol/FPMMDeterministicFactory.json");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        oov3 = new MockOOv3();
        feed = new MockAggregator(THRESHOLD, 8, block.timestamp);

        registry = new MarketRegistry(address(ctf), fpmmFactory);
        resolver = new CtfResolver(address(ctf), address(registry));
        registry.setResolver(address(resolver));
        registry.setVerifier(address(this)); // test acts as backend verifier
        registry.setCollateralAllowed(address(usdc), true);
        registry.registerCreator(creator);
        resolver.setOracle(address(this)); // break-glass path in tests
        resolver.setFeedAllowed(address(feed), true);

        settler = new OptimisticSettler(
            address(resolver), address(registry), address(oov3), IERC20(address(usdc)), WINDOW, WINDOW
        );
        cre = new CREResolverModule(address(settler), address(this)); // test acts as DON forwarder
        resolver.setGlobalModule(address(settler), true);
        settler.setProposer(address(this), true); // test acts as the AI backend
        settler.setProposer(address(cre), true);

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

    function _newClosedMarket() internal returns (uint256 id, IFpmm fpmm, bytes32 conditionId) {
        (id, fpmm, conditionId) = _newMarket();
        vm.warp(closeTime + 1);
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
}
