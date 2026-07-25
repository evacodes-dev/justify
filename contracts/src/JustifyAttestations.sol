// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title JustifyAttestations — on-chain anchor for verifiable AI resolutions, on 0G Chain.
/// @notice Justify's markets settle on Base Sepolia, but the reasoning behind each resolution
/// is produced and stored on 0G: the verdict comes out of a TEE-hosted model on 0G Compute and
/// the full justification bundle (question, indexed market data the agent read, prompt, model
/// reply, enclave signature) is uploaded to 0G Storage, which addresses it by Merkle root.
/// This contract writes that root — plus the enclave signer that produced the verdict — to 0G
/// Chain, so the evidence trail has a permanent, timestamped, publicly queryable index.
///
/// @dev This is a notary, not an oracle. It cannot see the market it describes (that lives on
/// another chain) and it never pays anyone out; the audited settlement path on Base Sepolia is
/// untouched. What it does guarantee is that an attestation, once written, cannot be rewritten:
/// history is append-only, and since `bundleRoot` IS the content hash of the bundle, no bundle
/// can be swapped after the fact without breaking the anchor.
contract JustifyAttestations is Ownable {
    struct Attestation {
        uint256 marketId; // market id in the MarketRegistry on the settlement chain
        bytes32 bundleRoot; // 0G Storage Merkle root of the justification bundle
        uint8 outcome; // 0 = NO, 1 = YES, 2 = INVALID
        bool teeVerified; // enclave signature over the model reply checked out
        address teeSigner; // TEE signer address of the 0G Compute provider
        uint64 timestamp;
        address attester;
        string model; // model that produced the verdict
    }

    /// Append-only history per market: a re-resolution adds an entry, it never edits one.
    mapping(uint256 => Attestation[]) private _history;
    uint256[] private _marketIds;
    mapping(uint256 => bool) private _known;
    uint256 public attestationCount;

    /// Truth sources allowed to anchor (the resolution agent's 0G wallet).
    mapping(address => bool) public attesters;

    event AttesterSet(address indexed attester, bool allowed);
    event Attested(
        uint256 indexed marketId,
        bytes32 indexed bundleRoot,
        uint8 outcome,
        bool teeVerified,
        address teeSigner,
        address indexed attester,
        string model
    );

    constructor() Ownable(msg.sender) {
        attesters[msg.sender] = true;
        emit AttesterSet(msg.sender, true);
    }

    function setAttester(address who, bool allowed) external onlyOwner {
        require(who != address(0), "zero");
        attesters[who] = allowed;
        emit AttesterSet(who, allowed);
    }

    /// @notice Anchor one AI resolution. `teeVerified` records the enclave-signature check as
    /// the agent observed it — an unverified verdict is still worth anchoring, precisely so the
    /// gap is visible rather than quietly dropped.
    function attest(
        uint256 marketId,
        bytes32 bundleRoot,
        uint8 outcome,
        bool teeVerified,
        address teeSigner,
        string calldata model
    ) external {
        require(attesters[msg.sender], "onlyAttester");
        require(bundleRoot != bytes32(0), "root");
        require(outcome <= 2, "outcome");

        _history[marketId].push(
            Attestation({
                marketId: marketId,
                bundleRoot: bundleRoot,
                outcome: outcome,
                teeVerified: teeVerified,
                teeSigner: teeSigner,
                timestamp: uint64(block.timestamp),
                attester: msg.sender,
                model: model
            })
        );
        if (!_known[marketId]) {
            _known[marketId] = true;
            _marketIds.push(marketId);
        }
        attestationCount++;

        emit Attested(marketId, bundleRoot, outcome, teeVerified, teeSigner, msg.sender, model);
    }

    // ───────────────────────── views ─────────────────────────

    function latest(uint256 marketId) external view returns (Attestation memory) {
        Attestation[] storage h = _history[marketId];
        require(h.length > 0, "none");
        return h[h.length - 1];
    }

    function historyOf(uint256 marketId) external view returns (Attestation[] memory) {
        return _history[marketId];
    }

    function countOf(uint256 marketId) external view returns (uint256) {
        return _history[marketId].length;
    }

    function attestedMarkets() external view returns (uint256[] memory) {
        return _marketIds;
    }
}