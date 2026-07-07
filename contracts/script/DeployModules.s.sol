// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Resolver} from "../src/Resolver.sol";
import {OptimisticSettler} from "../src/OptimisticSettler.sol";
import {CREResolverModule} from "../src/CREResolverModule.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys the optimistic-settlement layer on top of an existing Resolver/Factory:
/// OptimisticSettler (AI/CRE proposals + UMA dispute escalation) and the CRE receiver.
///
/// Env:
///   DEPLOYER_PK        must be the Resolver owner
///   RESOLVER_ADDRESS   existing Resolver
///   FACTORY_ADDRESS    existing MarketFactory
///   OOV3_ADDRESS       UMA Optimistic Oracle V3 on this chain (docs.uma.xyz)
///   USDC_ADDRESS       bond currency (must be OOv3-whitelisted)
///   BACKEND_ADDR       AI oracle layer proposer
///   CRE_FORWARDER      optional — Chainlink forwarder once the CRE workflow is live
///   CHALLENGE_WINDOW   seconds, default 7200 (2h)
///   DISPUTE_LIVENESS   seconds, default 7200 (2h)
///
/// Run:
///   forge script script/DeployModules.s.sol --rpc-url $RPC --broadcast
contract DeployModules is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address oov3 = vm.envAddress("OOV3_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address backend = vm.envAddress("BACKEND_ADDR");
        address creForwarder = vm.envOr("CRE_FORWARDER", address(0));
        uint64 window = uint64(vm.envOr("CHALLENGE_WINDOW", uint256(7200)));
        uint64 liveness = uint64(vm.envOr("DISPUTE_LIVENESS", uint256(7200)));

        vm.startBroadcast(pk);

        OptimisticSettler settler =
            new OptimisticSettler(resolverAddr, factoryAddr, oov3, IERC20(usdc), window, liveness);
        CREResolverModule cre = new CREResolverModule(address(settler), creForwarder);

        settler.setProposer(backend, true); // AI oracle layer
        settler.setProposer(address(cre), true); // CRE event receiver
        Resolver(resolverAddr).setGlobalModule(address(settler), true);

        vm.stopBroadcast();

        console2.log("SETTLER_ADDRESS=", address(settler));
        console2.log("CRE_MODULE_ADDRESS=", address(cre));
        console2.log("challengeWindow/disputeLiveness=", window, liveness);
    }
}
