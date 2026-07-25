import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  toHex,
} from "viem";
import { mainnet, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ERC-8004 (Trustless Agents) — the neutral registry our reputation layer reports into.
//
// Identity Registry mints agentId as an ERC-721 on register(agentURI); Reputation Registry
// accumulates third-party feedback per agentId. Both are CREATE2 deployments with the same
// address on Ethereum and Base mainnet (probed 2026-07-25; NOT present on Base Sepolia, which
// is why this module talks to a mainnet while the markets stay on the testnet).
//
// Two hard rules inherited from the registry:
//   • registration is an EXPLICIT action, never called inside a loop — each one mints an NFT
//     with real gas;
//   • the registry blocks self-feedback, so feedback is signed by a DISTINCT funded client
//     key (REPUTATION_CLIENT_PK), not by the agent or its owner.

const CHAINS = { mainnet, base } as const;
type ChainKey = keyof typeof CHAINS;

const CHAIN_KEY = (process.env.ERC8004_CHAIN as ChainKey) ?? "mainnet";
export const erc8004Chain = CHAINS[CHAIN_KEY] ?? mainnet;
const RPC =
  CHAIN_KEY === "base"
    ? (process.env.BASE_RPC ?? "https://mainnet.base.org")
    : (process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com");

export const IDENTITY_REGISTRY = (process.env.ERC8004_IDENTITY ??
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432") as `0x${string}`;
export const REPUTATION_REGISTRY = (process.env.ERC8004_REPUTATION ??
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63") as `0x${string}`;

export const identityAbi = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export const reputationAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
]);

const pub = () => createPublicClient({ chain: erc8004Chain, transport: http(RPC) });
const wallet = (pk: `0x${string}`) =>
  createWalletClient({ account: privateKeyToAccount(pk), chain: erc8004Chain, transport: http(RPC) });

const normalizePk = (pk: string): `0x${string}` =>
  (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;

export const erc8004Enabled = (): boolean =>
  Boolean(process.env.ENS_OWNER_PK || process.env.REPUTATION_CLIENT_PK);

export function explorerTx(hash: string): string {
  return `${erc8004Chain.id === 8453 ? "https://basescan.org" : "https://etherscan.io"}/tx/${hash}`;
}
export function explorerToken(agentId: string | bigint): string {
  return `${erc8004Chain.id === 8453 ? "https://basescan.org" : "https://etherscan.io"}/token/${IDENTITY_REGISTRY}?a=${agentId}`;
}

/// Mint the agent's on-chain identity. agentURI must resolve to the registration JSON —
/// we serve it at /api/agent-card/<address>, which also advertises the x402 scoring endpoint.
export async function registerAgent(agentURI: string): Promise<{ agentId: string; tx: string; chainId: number }> {
  const pk = process.env.ENS_OWNER_PK;
  if (!pk) throw new Error("ENS_OWNER_PK not set");
  const w = wallet(normalizePk(pk));
  const hash = await w.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityAbi,
    functionName: "register",
    args: [agentURI],
    chain: erc8004Chain,
    account: w.account!,
  });
  const receipt = await pub().waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: receipt.logs });
  const agentId = logs[0]?.args?.agentId;
  if (agentId === undefined) throw new Error("Registered event not found in receipt");
  return { agentId: String(agentId), tx: hash, chainId: erc8004Chain.id };
}

/// Report a paid reputation read into the registry. value is the 0-100 score at 2 decimals
/// (e.g. 68 → 6800). tag2="x402" marks the feedback as economically backed — the feedbackURI
/// resolves to the full report, which embeds the pointer to the payment context.
export async function reportScore(opts: {
  erc8004Id: string;
  score: number;
  feedbackURI: string;
  tag2?: string;
}): Promise<{ tx: string }> {
  const pk = process.env.REPUTATION_CLIENT_PK ?? process.env.AGENT_PK;
  if (!pk) throw new Error("REPUTATION_CLIENT_PK not set");
  const w = wallet(normalizePk(pk));
  const feedbackHash = opts.feedbackURI
    ? keccak256(toHex(opts.feedbackURI))
    : (("0x" + "0".repeat(64)) as `0x${string}`);
  const hash = await w.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationAbi,
    functionName: "giveFeedback",
    args: [
      BigInt(opts.erc8004Id),
      BigInt(Math.round(opts.score * 100)),
      2,
      "trading",
      opts.tag2 ?? "x402",
      "/api/reputation",
      opts.feedbackURI,
      feedbackHash,
    ],
    chain: erc8004Chain,
    account: w.account!,
  });
  await pub().waitForTransactionReceipt({ hash });
  return { tx: hash };
}

export async function readSummary(erc8004Id: string, clients: `0x${string}`[]) {
  const [count, value, decimals] = (await pub().readContract({
    address: REPUTATION_REGISTRY,
    abi: reputationAbi,
    functionName: "getSummary",
    args: [BigInt(erc8004Id), clients, "trading", ""],
  })) as [bigint, bigint, number];
  return { count: Number(count), value: Number(value) / 10 ** Number(decimals) };
}