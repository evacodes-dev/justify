pragma solidity ^0.5.1;
// Build entries only: pull the audited contracts (and their import closure) into compilation.
// No logic here — sources under vendor/ are verbatim audited snapshots.
import { ConditionalTokens } from "../conditional-tokens-contracts/contracts/ConditionalTokens.sol";
import { FPMMDeterministicFactory } from "../conditional-tokens-market-makers/contracts/FPMMDeterministicFactory.sol";
