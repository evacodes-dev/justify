import { createPublicClient, createWalletClient, http, defineChain, parseAbi, pad, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

// Multi-chain CCTP V2 (testnet sandbox). Used for the 2-hop deposit:
//   ETH Sepolia --(CCTP)--> Base Sepolia --(CCTP)--> Arc
// CCTP V2 contracts are the SAME deterministic address on every chain (verified on-chain).

const TM = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as `0x${string}`; // TokenMessengerV2
const MT = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as `0x${string}`; // MessageTransmitterV2
export const IRIS = process.env.IRIS_URL ?? "https://iris-api-sandbox.circle.com";

export type CctpChain = { key: string; domain: number; chainId: number; rpc: string; usdc: `0x${string}` };

export const CHAINS: Record<"sepolia" | "baseSepolia" | "arc", CctpChain> = {
  sepolia: {
    key: "sepolia", domain: 0, chainId: 11155111,
    rpc: process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  baseSepolia: {
    key: "baseSepolia", domain: 6, chainId: 84532,
    rpc: process.env.BASE_RPC ?? "https://sepolia.base.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  arc: {
    key: "arc", domain: 26, chainId: config.chainId,
    rpc: config.arcRpc, usdc: config.usdc,
  },
};

export const tokenMessengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)",
]);
export const messageTransmitterAbi = parseAbi(["function receiveMessage(bytes message, bytes attestation) returns (bool)"]);
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const ZERO32 = ("0x" + "0".repeat(64)) as Hex;
const FINALITY_FAST = 1000; // soft finality (Fast Transfer) — ~1-2 min vs ~13 min for hard
export const toBytes32 = (addr: string): Hex => pad(getAddress(addr) as Hex, { size: 32 });

function viemChain(c: CctpChain) {
  return defineChain({ id: c.chainId, name: c.key, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } });
}
function clients(c: CctpChain) {
  const chain = viemChain(c);
  const account = privateKeyToAccount(config.backendPk);
  return {
    chain, account,
    pub: createPublicClient({ chain, transport: http(c.rpc) }),
    wallet: createWalletClient({ account, chain, transport: http(c.rpc) }),
  };
}

// Poll Circle Iris for the attestation of a burn tx on `sourceDomain`.
export async function fetchAttestation(sourceDomain: number, txHash: string): Promise<{ status: string; message?: Hex; attestation?: Hex }> {
  const r = await fetch(`${IRIS}/v2/messages/${sourceDomain}?transactionHash=${txHash}`, { headers: { accept: "application/json" } });
  if (r.status === 404) return { status: "pending" };
  if (!r.ok) return { status: `error_${r.status}` };
  const b: any = await r.json().catch(() => ({}));
  const m = b?.messages?.[0];
  if (!m) return { status: "pending" };
  return { status: m.status ?? "pending", message: m.message, attestation: m.attestation };
}

export async function waitAttestation(sourceDomain: number, txHash: string, tries = 150): Promise<{ message: Hex; attestation: Hex }> {
  for (let i = 0; i < tries; i++) {
    const a = await fetchAttestation(sourceDomain, txHash);
    if (a.status === "complete" && a.message && a.attestation) return { message: a.message, attestation: a.attestation };
    await new Promise((r) => setTimeout(r, 6000));
  }
  throw new Error("attestation timeout");
}

const MAX_UINT = (2n ** 256n - 1n);

// Backend burns its own USDC on `from` → mints to `mintRecipient` on `to`.
export async function backendBurn(from: CctpChain, to: CctpChain, amount: bigint, mintRecipient: string): Promise<string> {
  const { pub, wallet, account, chain } = clients(from);
  const readAllowance = async () =>
    (await pub.readContract({ address: from.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, TM] })) as bigint;
  if ((await readAllowance()) < amount) {
    const ah = await wallet.writeContract({ address: from.usdc, abi: erc20Abi, functionName: "approve", args: [TM, MAX_UINT], account, chain });
    await pub.waitForTransactionReceipt({ hash: ah });
    // public RPCs can lag — wait until the allowance actually reflects before burning
    for (let i = 0; i < 12; i++) {
      if ((await readAllowance()) >= amount) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  const maxFee = amount / 100n > 0n ? amount / 100n : 1n; // cap 1%; Circle takes the actual (smaller) fee
  const tx = await wallet.writeContract({
    address: TM, abi: tokenMessengerAbi, functionName: "depositForBurn",
    args: [amount, to.domain, toBytes32(mintRecipient), from.usdc, ZERO32, maxFee, FINALITY_FAST],
    account, chain,
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  return tx;
}

// Relay receiveMessage on the destination chain (mints the bridged USDC).
export async function backendRelay(to: CctpChain, message: Hex, attestation: Hex): Promise<string> {
  const { pub, wallet, account, chain } = clients(to);
  const tx = await wallet.writeContract({ address: MT, abi: messageTransmitterAbi, functionName: "receiveMessage", args: [message, attestation], account, chain });
  await pub.waitForTransactionReceipt({ hash: tx });
  return tx;
}

export async function usdcBalance(c: CctpChain, addr: string): Promise<bigint> {
  return (await clients(c).pub.readContract({ address: c.usdc, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(addr)] })) as bigint;
}

export const backendAddress = () => privateKeyToAccount(config.backendPk).address;
