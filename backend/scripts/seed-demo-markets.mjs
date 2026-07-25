// Seed price markets for the demo: real questions with thresholds set near the money, so the
// outcome is genuinely uncertain and the agents' calls actually mean something. Price markets
// resolve deterministically from the committed Chainlink rule the moment they close (no
// challenge window), which is what turns them into a fast, scored track record.
//
//   node scripts/seed-demo-markets.mjs [minutesUntilClose] [liquidityUSDC]
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const ROOT = new URL("../..", import.meta.url).pathname;
const env = Object.fromEntries(
  fs.readFileSync(`${ROOT}/backend/.env`, "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const dep = JSON.parse(fs.readFileSync(`${ROOT}/contracts/deployments/base-sepolia.json`, "utf8"));
const REGISTRY = getAddress(dep.contracts.MarketRegistry);
const USDC = getAddress(dep.collateral.USDC);

const pk = env.BACKEND_PK.startsWith("0x") ? env.BACKEND_PK : `0x${env.BACKEND_PK}`;
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http("https://sepolia.base.org") });

const registryAbi = parseAbi([
  "function createMarket(address collateral, string question, string metadataURI, uint64 closeTime, uint256 initialLiquidity) external returns (uint256 id, address fpmm)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
]);

const minutes = Number(process.argv[2] ?? 15);
const LIQ = BigInt(Math.round(Number(process.argv[3] ?? 1) * 1e6));

// Thresholds are derived from the live feed at seed time (see `offsetPct`) so every market
// opens genuinely uncertain — a market whose answer is already obvious teaches us nothing
// about an agent's calibration.
const MARKETS = [
  {
    asset: "ETH",
    feed: env.ONCHAIN_FEED_ETH,
    offsetPct: 0.5,
    label: (t) => `Will ETH be above $${t.toLocaleString()} when this market closes?`,
    image: "https://images.unsplash.com/photo-1622790698141-94e30457ef12?w=900&q=80",
    description: "A near-the-money ETH/USD call, resolved on-chain from the committed Chainlink feed.",
  },
  {
    asset: "BTC",
    feed: env.ONCHAIN_FEED_BTC,
    offsetPct: -0.5,
    label: (t) => `Will BTC hold above $${t.toLocaleString()} when this market closes?`,
    image: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=900&q=80",
    description: "A near-the-money BTC/USD call, resolved on-chain from the committed Chainlink feed.",
  },
];

const balance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const needed = LIQ * BigInt(MARKETS.length);
if (balance < needed) {
  console.error(`need ${Number(needed) / 1e6} USDC, have ${Number(balance) / 1e6} — top up at https://faucet.circle.com (Base Sepolia)`);
  process.exit(1);
}

const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, REGISTRY] });
if (allowance < needed) {
  const h = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [REGISTRY, needed * 10n] });
  await pub.waitForTransactionReceipt({ hash: h });
}

for (const m of MARKETS) {
  const [, answer] = await pub.readContract({ address: m.feed, abi: feedAbi, functionName: "latestRoundData" });
  const decimals = await pub.readContract({ address: m.feed, abi: feedAbi, functionName: "decimals" });
  const spot = Number(answer) / 10 ** Number(decimals);
  // Round to a clean number a human would actually quote.
  const raw = spot * (1 + m.offsetPct / 100);
  const step = raw > 10000 ? 500 : raw > 1000 ? 25 : 1;
  const threshold = Math.round(raw / step) * step;

  const question = m.label(threshold);
  const meta = {
    category: "Crypto",
    description: m.description,
    criteria: `Resolves YES if the Chainlink ${m.asset}/USD feed reads above $${threshold} at close. Spot at creation: $${spot.toFixed(2)}.`,
    image: m.image,
    price: { asset: m.asset, threshold, comparator: "above" },
    countries: [],
    restricted: false,
  };

  const closeTime = BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
  const { request, result } = await pub.simulateContract({
    account, address: REGISTRY, abi: registryAbi, functionName: "createMarket",
    args: [USDC, question, JSON.stringify(meta), closeTime, LIQ],
  });
  const hash = await wallet.writeContract(request);
  await pub.waitForTransactionReceipt({ hash });
  console.log(`market #${result[0]} — ${question}  (spot $${spot.toFixed(2)}, closes in ${minutes}m)`);
}