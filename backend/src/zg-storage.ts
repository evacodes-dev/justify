import { ethers } from "ethers";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { config } from "./config.js";

// 0G Storage — content-addressed by Merkle root. Justification bundles (and market metadata)
// live here instead of as an inline blob on-chain: the chain carries only `0g://<root>`, and
// because the root IS the content hash, a bundle cannot be swapped out after the fact. Anyone
// can pull it back down and re-check the verdict the AI published.
//
// Node-only: the SDK reaches for `fs` during download, so uploads/downloads run on the backend
// and the SPA reads bundles through our own endpoint.

let indexer: Indexer | null = null;
let signer: ethers.Wallet | null = null;

function client(): { indexer: Indexer; signer: ethers.Wallet } {
  if (!config.zg.pk) throw new Error("ZG_AGENT_PK not set");
  if (indexer === null || signer === null) {
    const provider = new ethers.JsonRpcProvider(config.zg.rpc);
    signer = new ethers.Wallet(config.zg.pk, provider);
    indexer = new Indexer(config.zg.indexer);
  }
  return { indexer, signer };
}

export type UploadResult = {
  rootHash: string;
  txHash: string;
  uri: string;
  explorerUrl: string;
};

/// Upload a JSON document and return its Merkle root — the content id that goes on-chain.
export async function uploadJson(value: unknown): Promise<UploadResult> {
  const { indexer, signer } = client();
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  const file = new MemData(bytes);

  const [tree, treeErr] = await file.merkleTree();
  if (treeErr !== null || tree === null) {
    throw new Error(`0g merkle tree failed: ${treeErr?.message ?? "unknown"}`);
  }
  const rootHash = tree.rootHash();
  if (rootHash === null) throw new Error("0g merkle root missing");

  // Same ESM/CommonJS ethers typing split as in zg-compute.ts — identical runtime class.
  const [result, uploadErr] = await indexer.upload(file, config.zg.rpc, signer as never);
  if (uploadErr !== null) {
    // A root that is already stored is a success for our purposes: the bundle is retrievable
    // and the hash still commits to exactly these bytes.
    if (!/already exists|Duplicate/i.test(uploadErr.message)) {
      throw new Error(`0g upload failed: ${uploadErr.message}`);
    }
  }
  const txHash =
    result !== null && typeof result === "object" && "txHash" in result
      ? (result as { txHash: string }).txHash
      : "";

  return {
    rootHash,
    txHash,
    uri: `0g://${rootHash}`,
    // The indexer's public gateway serves the bytes by root — mainnet has no storage
    // explorer UI yet (storagescan.0g.ai proxies to chainscan, which knows nothing of roots).
    explorerUrl: `${config.zg.indexer}/file?root=${rootHash}`,
  };
}

/// Fetch a bundle back by root hash. `uri` accepts either `0g://<root>` or a bare root.
export async function downloadJson<T = unknown>(uri: string): Promise<T> {
  const { indexer } = client();
  const rootHash = uri.startsWith("0g://") ? uri.slice("0g://".length) : uri;

  const [blob, err] = await indexer.downloadToBlob(rootHash);
  if (err !== null) throw new Error(`0g download failed: ${err.message}`);
  return JSON.parse(await blob.text()) as T;
}

export const isZgUri = (value: string | undefined | null): boolean =>
  typeof value === "string" && value.startsWith("0g://");