// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Resolver} from "../src/Resolver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Factory + Resolver, wires verifier/oracle = backend, optionally seeds markets.
///
/// Env:
///   DEPLOYER_PK     broadcasting key (owner of Factory + Resolver)
///   BACKEND_ADDR    backend address used as verifier (registerCreator) + oracle (resolve)
///   USDC_ADDRESS    collateral (Arc native USDC ERC-20 iface 0x3600..0000)
///   EURC_ADDRESS    optional second collateral (for the multi-currency demo market)
///   SEED            "1" to seed 3 demo markets (deployer must hold USDC/EURC)
///
/// Run (Arc testnet):
///   forge script script/Deploy.s.sol --rpc-url $ARC_RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        address backend = vm.envOr("BACKEND_ADDR", deployer);
        address usdc = vm.envAddress("USDC_ADDRESS");
        address eurc = vm.envOr("EURC_ADDRESS", address(0));
        bool seed = vm.envOr("SEED", false);

        vm.startBroadcast(pk);

        Resolver resolver = new Resolver();
        MarketFactory factory = new MarketFactory();

        factory.setResolver(address(resolver));
        resolver.setFactory(address(factory));
        resolver.setOracle(backend);

        // security: only curated collateral can back markets
        factory.setCollateralAllowed(usdc, true);
        if (eurc != address(0)) factory.setCollateralAllowed(eurc, true);

        // security: only canonical Chainlink aggregators may back the on-chain price path.
        // Pass the network's feed addresses via env (FEED_ETH/FEED_BTC/FEED_LINK, docs.chain.link).
        address feedEth = vm.envOr("FEED_ETH", address(0));
        address feedBtc = vm.envOr("FEED_BTC", address(0));
        address feedLink = vm.envOr("FEED_LINK", address(0));
        if (feedEth != address(0)) resolver.setFeedAllowed(feedEth, true);
        if (feedBtc != address(0)) resolver.setFeedAllowed(feedBtc, true);
        if (feedLink != address(0)) resolver.setFeedAllowed(feedLink, true);

        if (seed) {
            // temporarily let the deployer create the seed markets, then hand verifier to backend
            factory.setVerifier(deployer);
            factory.registerCreator(deployer);

            uint64 t = uint64(block.timestamp);
            uint256 L = 5e6; // 5 USDC initial liquidity per seed market

            IERC20(usdc).approve(address(factory), L * 3);
            factory.createMarket(
                IERC20(usdc), "Will ETH close above $5,000 on 2026-07-01?", "ipfs://eth-price", t + 14 days, L
            );
            factory.createMarket(
                IERC20(usdc), "Will the Fed cut rates at the July 2026 meeting?", "ipfs://fed", t + 21 days, L
            );
            if (eurc != address(0)) {
                IERC20(eurc).approve(address(factory), L);
                factory.createMarket(
                    IERC20(eurc), "Will EUR/USD be above 1.10 on 2026-08-01?", "ipfs://eurusd", t + 30 days, L
                );
            }
        }

        // hand verifier control to the backend (final state)
        factory.setVerifier(backend);

        vm.stopBroadcast();

        console2.log("FACTORY_ADDRESS=", address(factory));
        console2.log("RESOLVER_ADDRESS=", address(resolver));
        console2.log("VERIFIER/ORACLE=", backend);
        console2.log("USDC_ADDRESS=", usdc);
        console2.log("marketCount=", factory.marketCount());
    }
}
