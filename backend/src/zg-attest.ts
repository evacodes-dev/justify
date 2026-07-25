import { ethers } from "ethers";
import { config } from "./config.js";
import type { TeeAttestation } from "./zg-compute.js";

// Anchors a resolution on 0G Chain: which bundle root backed which verdict, produced by which
// provider, and whether a per-response signature could actually be checked. Markets settle on
// Base Sepolia — this is the evidence index, not the settlement path.

const ABI = [
  "function attest(uint256 marketId, bytes32 bundleRoot, uint8 outcome, bool teeVerified, address teeSigner, string model) external",
  "function attestationCount() view returns (uint256)",
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

let contract: ethers.Contract | null = null;

function get(): ethers.Contract | null {
  if (!config.zg.attestations || !config.zg.pk) return null;
  if (contract === null) {
    const provider = new ethers.JsonRpcProvider(config.zg.rpc);
    const wallet = new ethers.Wallet(config.zg.pk, provider);
    contract = new ethers.Contract(config.zg.attestations, ABI, wallet);
  }
  return contract;
}

export type AnchorResult = { txHash: string; explorerUrl: string };

/// Best-effort: a failed anchor must never block a resolution that already settled correctly
/// on the settlement chain. Returns null instead of throwing.
export async function anchorAttestation(opts: {
  marketId: number;
  bundleRoot: string;
  outcome: "YES" | "NO" | "INVALID";
  tee: TeeAttestation;
}): Promise<AnchorResult | null> {
  const c = get();
  if (c === null) return null;

  const outcomeNum = opts.outcome === "YES" ? 1 : opts.outcome === "NO" ? 0 : 2;
  const signer = ethers.isAddress(opts.tee.teeSignerAddress) ? opts.tee.teeSignerAddress : ZERO_ADDRESS;

  try {
    const tx = await c.attest(
      BigInt(opts.marketId),
      opts.bundleRoot,
      outcomeNum,
      // Only ever true when a signature was actually checked — never asserted optimistically.
      opts.tee.verified === true,
      signer,
      opts.tee.model,
      // 0G rejects transactions below a 2 gwei tip.
      { gasPrice: 5_000_000_000n },
    );
    const receipt = await tx.wait();
    const txHash = receipt?.hash ?? tx.hash;
    return { txHash, explorerUrl: `${config.zg.explorer}/tx/${txHash}` };
  } catch (e) {
    console.error("[0g] anchor failed:", (e as Error).message);
    return null;
  }
}