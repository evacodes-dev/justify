import { createPublicClient, http, defineChain, parseAbi } from "viem";

// Chainlink Data Feeds (AggregatorV3) live on Ethereum mainnet/testnets — we read the
// real on-chain price from Sepolia. Used to resolve PRICE markets deterministically
// (the trustless half of the hybrid resolver; Claude handles subjective markets).
const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const sepolia = defineChain({
  id: 11155111, name: "Sepolia",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [SEPOLIA_RPC] } },
});
const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

const aggregatorAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

// Chainlink Data Feed addresses on Ethereum Sepolia.
export const CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  ETH: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  BTC: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  LINK: "0xc59E3633BAAC79493d908e63626716e204A45EdF",
};

export function hasFeed(asset?: string): boolean {
  return !!asset && !!CHAINLINK_FEEDS[asset.toUpperCase()];
}

// Read the live Chainlink price for an asset (USD). Returns null if no feed.
export async function readChainlinkPrice(asset: string): Promise<{ price: number; feed: string; updatedAt: number } | null> {
  const feed = CHAINLINK_FEEDS[asset.toUpperCase()];
  if (!feed) return null;
  const [round, decimals] = await Promise.all([
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: "latestRoundData" }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint]>,
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: "decimals" }) as Promise<number>,
  ]);
  const answer = round[1];
  const price = Number(answer) / 10 ** Number(decimals);
  return { price, feed, updatedAt: Number(round[3]) };
}
