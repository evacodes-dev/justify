// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {CtfResolver} from "../src/CtfResolver.sol";
import {OptimisticSettler} from "../src/OptimisticSettler.sol";
import {CREResolverModule} from "../src/CREResolverModule.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Path-B deployment: the audited Gnosis stack (vendored bytecode) + our thin layer.
///
/// Env:
///   DEPLOYER_PK        owner of registry/resolver/settler
///   BACKEND_ADDR       verifier + AI proposer + break-glass oracle
///   USDC_ADDRESS       collateral / UMA bond currency
///   OOV3_ADDRESS       UMA Optimistic Oracle V3 (docs.uma.xyz)
///   CTF_ADDRESS        optional — reuse an existing ConditionalTokens deployment
///   FPMM_FACTORY       optional — reuse an existing FPMMDeterministicFactory
///   FEED_ETH/BTC/LINK  optional — Chainlink aggregators to allowlist
///   CRE_FORWARDER      optional
///   CHALLENGE_WINDOW / DISPUTE_LIVENESS  seconds, default 48h / 24h (beta posture)
///
/// If CTF_ADDRESS/FPMM_FACTORY are unset, the VENDORED AUDITED bytecode is deployed verbatim
/// (vendor/out artifacts — build with `cd vendor && forge build` first).
contract DeployCtf is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address backend = vm.envAddress("BACKEND_ADDR");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address oov3 = vm.envAddress("OOV3_ADDRESS");
        address ctf = vm.envOr("CTF_ADDRESS", address(0));
        address fpmmFactory = vm.envOr("FPMM_FACTORY", address(0));
        uint64 window = uint64(vm.envOr("CHALLENGE_WINDOW", uint256(172800)));
        uint64 liveness = uint64(vm.envOr("DISPUTE_LIVENESS", uint256(86400)));

        vm.startBroadcast(pk);

        // 1) audited Gnosis stack — deploy vendored bytecode unless reusing existing instances
        if (ctf == address(0)) ctf = _deployArtifact("vendor/out/ConditionalTokens.sol/ConditionalTokens.json");
        if (fpmmFactory == address(0)) {
            fpmmFactory = _deployArtifact("vendor/out/FPMMDeterministicFactory.sol/FPMMDeterministicFactory.json");
        }

        // 2) our thin layer
        MarketRegistry registry = new MarketRegistry(ctf, fpmmFactory);
        CtfResolver resolver = new CtfResolver(ctf, address(registry));
        OptimisticSettler settler =
            new OptimisticSettler(address(resolver), address(registry), oov3, IERC20(usdc), window, liveness);
        CREResolverModule cre = new CREResolverModule(address(settler), vm.envOr("CRE_FORWARDER", address(0)));

        // 3) wiring
        registry.setResolver(address(resolver));
        registry.setVerifier(backend);
        registry.setCollateralAllowed(usdc, true);
        // the backend is the on-chain market creator (creates on users' behalf). When the
        // deployer IS the backend key we can self-register here; otherwise do it post-deploy
        // from the backend key: registry.registerCreator(backend).
        if (vm.addr(pk) == backend) registry.registerCreator(backend);
        resolver.setOracle(backend); // break-glass for beta; point at multisig for mainnet
        resolver.setGlobalModule(address(settler), true);
        settler.setProposer(backend, true);
        settler.setProposer(address(cre), true);

        address feedEth = vm.envOr("FEED_ETH", address(0));
        address feedBtc = vm.envOr("FEED_BTC", address(0));
        address feedLink = vm.envOr("FEED_LINK", address(0));
        if (feedEth != address(0)) resolver.setFeedAllowed(feedEth, true);
        if (feedBtc != address(0)) resolver.setFeedAllowed(feedBtc, true);
        if (feedLink != address(0)) resolver.setFeedAllowed(feedLink, true);

        vm.stopBroadcast();

        console2.log("CTF_ADDRESS=", ctf);
        console2.log("FPMM_FACTORY=", fpmmFactory);
        console2.log("REGISTRY_ADDRESS=", address(registry));
        console2.log("RESOLVER_ADDRESS=", address(resolver));
        console2.log("SETTLER_ADDRESS=", address(settler));
        console2.log("CRE_MODULE_ADDRESS=", address(cre));
    }

    function _deployArtifact(string memory path) internal returns (address addr) {
        bytes memory code = vm.getCode(path);
        assembly {
            addr := create(0, add(code, 0x20), mload(code))
        }
        require(addr != address(0), "deploy failed");
    }
}
