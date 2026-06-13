import { createPublicClient, createWalletClient, defineChain, http, parseAbi, pad, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NET, type ChainCfg } from "./networks";

// CCTP V2 burn-and-mint bridge. Identical logic for testnet/mainnet — all params
// come from NET (lib/networks.ts). Flow:
//   1. (client) approve USDC → TokenMessengerV2.depositForBurn on the SOURCE chain
//   2. (server) poll Circle Iris for the attestation of that burn tx
//   3. (server) MessageTransmitterV2.receiveMessage on the DEST chain → USDC minted

export const usdcAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
export const tokenMessengerV2Abi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64 nonce)",
]);
export const messageTransmitterV2Abi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
]);

// Standard (hard-finality) transfer: maxFee 0, threshold 2000. Fast would be 1000 + a fee.
export const FINALITY_STANDARD = 2000;

export const ZERO_BYTES32 = ("0x" + "0".repeat(64)) as Hex;
export const addrToBytes32 = (addr: string): Hex => pad(addr as Hex, { size: 32 });

export function viemChain(c: ChainCfg) {
  return defineChain({
    id: c.chainId, name: c.name,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [c.rpc] } },
    blockExplorers: { default: { name: "explorer", url: c.explorer } },
  });
}

export const usdc6 = (human: number) => BigInt(Math.round(human * 1e6));

// --- step 2: poll Iris for the attestation of a burn tx (server-side) ---------
export type Attestation = { status: string; message?: Hex; attestation?: Hex };
export async function fetchAttestation(sourceDomain: number, txHash: string): Promise<Attestation> {
  const url = `${NET.iris}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (r.status === 404) return { status: "pending" }; // not indexed yet
  if (!r.ok) return { status: `error_${r.status}` };
  const body = await r.json().catch(() => ({}));
  const m = body?.messages?.[0];
  if (!m) return { status: "pending" };
  // status "complete" → attestation present and ready to mint
  return { status: m.status ?? "pending", message: m.message, attestation: m.attestation };
}

// --- step 3: relay receiveMessage on the destination chain (server pays gas) ---
export async function relayReceive(dest: ChainCfg, message: Hex, attestation: Hex, relayPk: `0x${string}`): Promise<string> {
  const chain = viemChain(dest);
  const account = privateKeyToAccount(relayPk);
  const pub = createPublicClient({ chain, transport: http(dest.rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(dest.rpc) });
  const hash = await wallet.writeContract({
    address: dest.messageTransmitterV2, abi: messageTransmitterV2Abi,
    functionName: "receiveMessage", args: [message, attestation],
    chain, account,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
