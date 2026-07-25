// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {JustifyAttestations} from "../src/JustifyAttestations.sol";

/// Deploys the resolution anchor to 0G Chain (Galileo testnet, chain id 16602).
///
///   forge script script/DeployAttestations.s.sol --rpc-url $ZG_RPC --broadcast
///
/// Env:
///   DEPLOYER_PK — deployer key, funded from https://faucet.0g.ai
///   ZG_ATTESTER — optional: the resolution agent's 0G wallet, allowlisted on deploy
contract DeployAttestations is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address attester = vm.envOr("ZG_ATTESTER", address(0));

        vm.startBroadcast(pk);
        JustifyAttestations attestations = new JustifyAttestations();
        if (attester != address(0) && attester != vm.addr(pk)) {
            attestations.setAttester(attester, true);
        }
        vm.stopBroadcast();

        console2.log("JustifyAttestations:", address(attestations));
        console2.log("owner:", vm.addr(pk));
        console2.log("attester:", attester == address(0) ? vm.addr(pk) : attester);
    }
}