import { ethers } from "ethers";
import { config } from "./config.js";
import type { TeeAttestation } from "./zg-compute.js";

// Anchors a resolution on 0G Chain: which bundle root backed which verdict, produced by which
// provider, and whether a per-response signature could actually be checked. Markets settle on
// Base Sepolia — this is the evidence index, not the settlement path.

const ABI = [
  "function attest(uint256 marketId, bytes32 bundleRoot, uint8 outcome, bool teeVerified, address teeSigner, string model) external",
  "function attestationCount() view returns (uint256)",
  "function attestedMarkets() view returns (uint256[])",
  "function latest(uint256 marketId) view returns (tuple(uint256 marketId, bytes32 bundleRoot, uint8 outcome, bool teeVerified, address teeSigner, uint64 timestamp, address attester, string model))",
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

export type AnchorSummary = {
  contract: string;
  chainId: number;
  explorer: string;
  count: number;
  latest: {
    marketId: number;
    bundleRoot: string;
    outcome: number;
    teeVerified: boolean;
    teeSigner: string;
    model: string;
    timestamp: number;
  } | null;
};

/// Read the anchor state straight off 0G Chain — the point of the proof page is that these
/// numbers come from the chain, not from our database.
export async function readAnchors(): Promise<AnchorSummary | null> {
  const c = get();
  if (c === null) return null;
  try {
    const count = Number(await c.attestationCount());
    let latest: AnchorSummary["latest"] = null;
    if (count > 0) {
      const ids: bigint[] = await c.attestedMarkets();
      const last = ids[ids.length - 1];
      const a = await c.latest(last);
      latest = {
        marketId: Number(a.marketId),
        bundleRoot: a.bundleRoot,
        outcome: Number(a.outcome),
        teeVerified: Boolean(a.teeVerified),
        teeSigner: a.teeSigner,
        model: a.model,
        timestamp: Number(a.timestamp),
      };
    }
    return {
      contract: config.zg.attestations!,
      chainId: config.zg.chainId,
      explorer: config.zg.explorer,
      count,
      latest,
    };
  } catch (e) {
    console.error("[0g] readAnchors failed:", (e as Error).message);
    return null;
  }
}