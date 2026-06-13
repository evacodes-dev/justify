import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs, keccak256, toHex } from "viem";
import { mainnet, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ERC-8004 (Trustless Agents) — on-chain agent identity + reputation.
// Identity Registry is an ERC-721; agentId = tokenId, minted on register().
// Deployed via CREATE2 → SAME address on every mainnet (Ethereum, Base, ...).
// We register by EXPLICIT action (a button), never inside a loop — each call is
// a real on-chain tx that costs gas. Default chain = Ethereum mainnet (where our
// ENS_OWNER_PK is already funded); switch to Base via ERC8004_CHAIN=base (pennies).

const CHAINS = { mainnet, base } as const;
type ChainKey = keyof typeof CHAINS;

const CHAIN_KEY = (process.env.ERC8004_CHAIN as ChainKey) ?? "mainnet";
export const erc8004Chain = CHAINS[CHAIN_KEY] ?? mainnet;
const RPC = CHAIN_KEY === "base"
  ? (process.env.BASE_RPC ?? "https://mainnet.base.org")
  : (process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com");

// CREATE2 addresses — identical across mainnets (see ERC8004_NOTES.md). Env-overridable.
export const IDENTITY_REGISTRY = (process.env.ERC8004_IDENTITY ??
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432") as `0x${string}`;
export const REPUTATION_REGISTRY = (process.env.ERC8004_REPUTATION ??
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63") as `0x${string}`;

export const identityAbi = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export const reputationAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

function pub() {
  return createPublicClient({ chain: erc8004Chain, transport: http(RPC) });
}
function wallet(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  return createWalletClient({ account, chain: erc8004Chain, transport: http(RPC) });
}

// CAIP-19 reference used in ENS text records + the agent card to tie a name → identity.
export function agentRef(agentId: string | bigint): string {
  return `eip155:${erc8004Chain.id}:${IDENTITY_REGISTRY}:eip721:${agentId}`;
}

export function explorerTx(hash: string): string {
  const base = erc8004Chain.id === 8453 ? "https://basescan.org" : "https://etherscan.io";
  return `${base}/tx/${hash}`;
}
export function explorerToken(agentId: string | bigint): string {
  const base = erc8004Chain.id === 8453 ? "https://basescan.org" : "https://etherscan.io";
  return `${base}/token/${IDENTITY_REGISTRY}?a=${agentId}`;
}

// Register an agent on-chain. Owner/registrant = the signer (ENS_OWNER_PK by default).
// agentURI should resolve to the agent's registration JSON (we serve /api/agent-card/<addr>).
export async function registerAgent(opts: {
  agentURI: string;
  signerPk?: `0x${string}`;
}): Promise<{ agentId: string; tx: string; chainId: number }> {
  const pk = opts.signerPk ?? (process.env.ENS_OWNER_PK as `0x${string}`);
  if (!pk) throw new Error("no signer key (ENS_OWNER_PK)");
  const w = wallet(pk);
  const p = pub();
  const hash = await w.writeContract({
    address: IDENTITY_REGISTRY, abi: identityAbi,
    functionName: "register", args: [opts.agentURI],
    chain: erc8004Chain, account: w.account!,
  });
  const receipt = await p.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: receipt.logs });
  const agentId = logs[0]?.args?.agentId;
  if (agentId === undefined) throw new Error("Registered event not found in receipt");
  return { agentId: String(agentId), tx: hash, chainId: erc8004Chain.id };
}

// Give on-chain reputation feedback about an agent. NOTE: the registry blocks
// self-feedback from the agent owner/operator — pass a DISTINCT client key
// (REPUTATION_CLIENT_PK / AGENT_PK), funded on the same chain.
export async function giveFeedback(opts: {
  agentId: string;
  value: number;          // e.g. 8700 with decimals=2 → 87.00
  decimals?: number;
  tag1: string;           // "accuracy" | "pnl" | "markets"
  tag2?: string;          // market tag, e.g. "BTC"
  endpoint?: string;
  feedbackURI?: string;   // off-chain rich JSON
  clientPk?: `0x${string}`;
}): Promise<{ tx: string }> {
  const pk = opts.clientPk ?? (process.env.REPUTATION_CLIENT_PK as `0x${string}`) ?? (process.env.AGENT_PK as `0x${string}`);
  if (!pk) throw new Error("no client key (REPUTATION_CLIENT_PK/AGENT_PK)");
  const w = wallet(pk);
  const feedbackURI = opts.feedbackURI ?? "";
  const feedbackHash = feedbackURI ? keccak256(toHex(feedbackURI)) : (("0x" + "0".repeat(64)) as `0x${string}`);
  const hash = await w.writeContract({
    address: REPUTATION_REGISTRY, abi: reputationAbi,
    functionName: "giveFeedback",
    args: [BigInt(opts.agentId), BigInt(Math.round(opts.value)), opts.decimals ?? 2,
      opts.tag1, opts.tag2 ?? "", opts.endpoint ?? "", feedbackURI, feedbackHash],
    chain: erc8004Chain, account: w.account!,
  });
  await pub().waitForTransactionReceipt({ hash });
  return { tx: hash };
}

// Read aggregate reputation (clientAddresses must be non-empty).
export async function readSummary(agentId: string, clients: `0x${string}`[], tag1 = "", tag2 = "") {
  const [count, summaryValue, decimals] = await pub().readContract({
    address: REPUTATION_REGISTRY, abi: reputationAbi,
    functionName: "getSummary", args: [BigInt(agentId), clients, tag1, tag2],
  }) as [bigint, bigint, number];
  return { count: Number(count), value: Number(summaryValue) / 10 ** Number(decimals), decimals: Number(decimals) };
}
