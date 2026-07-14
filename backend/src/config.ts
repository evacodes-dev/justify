import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// shared on-chain config produced by the contracts deploy.
// Pick the network via NETWORK env (e.g. "base-sepolia", "base-mainnet"); defaults to
// arc-testnet so the existing Arc deployment keeps working with no env change.
const network = process.env.NETWORK ?? "arc-testnet";
const deploymentPath = join(here, `../../contracts/deployments/${network}.json`);
export const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

const nonZero = (a?: string): `0x${string}` | undefined =>
  a && a !== "0x0000000000000000000000000000000000000000" ? (a as `0x${string}`) : undefined;

export const config = {
  port: Number(process.env.PORT ?? 8787),
  network,
  // ARC_RPC kept for back-compat; RPC env override or deployment default.
  arcRpc: process.env.RPC_URL ?? process.env.ARC_RPC ?? deployment.rpc,
  explorer: deployment.explorer as string,
  chainId: deployment.chainId as number,
  nativeCurrency: (deployment.nativeCurrency ?? { name: "Ether", symbol: "ETH", decimals: 18 }) as {
    name: string;
    symbol: string;
    decimals: number;
  },

  // contracts (product stack: MarketRegistry + CtfResolver over audited Gnosis CTF/FPMM)
  resolver: deployment.contracts.Resolver as `0x${string}`,
  usdc: deployment.collateral.USDC as `0x${string}`,
  usdcDecimals: deployment.collateral.decimals as number,
  deployBlock: BigInt(deployment.deployBlock),

  // signer: verifier (registerCreator) + oracle (resolve) + faucet (gas dotation)
  backendPk: (process.env.BACKEND_PK ?? "") as `0x${string}`,

  // On-chain Chainlink Data Feed addresses (on the SETTLEMENT chain) for trustless price
  // resolution via Resolver.resolveByPrice. Set per network in .env once verified at
  // docs.chain.link. If unset for an asset, resolution falls back to the off-chain read.
  onchainFeeds: {
    ETH: (process.env.ONCHAIN_FEED_ETH || undefined) as `0x${string}` | undefined,
    BTC: (process.env.ONCHAIN_FEED_BTC || undefined) as `0x${string}` | undefined,
    LINK: (process.env.ONCHAIN_FEED_LINK || undefined) as `0x${string}` | undefined,
  } as Record<string, `0x${string}` | undefined>,
  // Max seconds since a feed's updatedAt accepted by resolveByPrice (anti-stale).
  feedMaxStaleSec: Number(process.env.FEED_MAX_STALE_SEC ?? 3600),

  // OptimisticSettler (AI/CRE propose → challenge window → UMA on dispute). When set, the
  // AI layer PROPOSES subjective outcomes instead of resolving directly — finalization only
  // after the public window. Unset = legacy direct resolve (beta break-glass).
  settler: (process.env.SETTLER_ADDRESS || nonZero(deployment.contracts.OptimisticSettler)) as
    | `0x${string}`
    | undefined,

  // Path-B (audited Gnosis CTF/FPMM) stack. When `registry` is set the backend creates
  // markets via MarketRegistry and indexes FPMM/CTF events; otherwise the legacy
  // Market/MarketFactory stack is used (Arc).
  registry: nonZero(deployment.contracts.MarketRegistry),
  ctf: nonZero(deployment.contracts.ConditionalTokens),

  // Gas dotation (BE11): top up an embedded wallet's NATIVE balance so it can pay gas.
  // On Arc the native token is USDC; on Base it is ETH — hence tiny defaults there.
  gasDripThreshold: Number(process.env.GAS_DRIP_THRESHOLD ?? (network.startsWith("base") ? 0.0002 : 0.5)),
  gasDripAmount: Number(process.env.GAS_DRIP_AMOUNT ?? (network.startsWith("base") ? 0.0005 : 0.5)),

  // Product feature flags (call decisions, 2026-06-14). Kept as flags — code stays,
  // behavior toggles per environment (hackathon demo can re-enable).
  features: {
    // AI agents: off for the product MVP (agents UI hidden, loop stopped, lists empty)
    agents: (process.env.FEATURE_AGENTS ?? "off") !== "off",
    // country-gated betting: off for the product MVP (can-bet always allows)
    countryGate: (process.env.FEATURE_COUNTRY_GATE ?? "off") !== "off",
    // creator role granted ONLY via the admin endpoint; World ID = just a verified checkmark
    creatorViaAdmin: (process.env.CREATOR_VIA_ADMIN ?? "true") !== "false",
    // gas dotation: off = users bring their own ETH for gas (instantly reversible via env)
    gasDotation: (process.env.GAS_DOTATION ?? "on") !== "off",
  },
  // shared secret for /api/admin/* (x-admin-secret header). Unset = admin API disabled.
  adminSecret: process.env.ADMIN_SECRET ?? "",

  // Dynamic environment id — used to verify session JWTs on identity writes.
  dynamicEnvId: process.env.DYNAMIC_ENV_ID ?? process.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "",

  // Product economics (beta): platform funds initial liquidity; bets are capped; each
  // creator may open a limited number of markets. All env-tunable, instantly reversible.
  initialLiquidityUsdc: Number(process.env.INITIAL_LIQUIDITY_USDC ?? 1000),
  maxBetUsdc: Number(process.env.MAX_BET_USDC ?? 50),
  maxMarketsPerCreator: Number(process.env.MAX_MARKETS_PER_CREATOR ?? 3),

  // Market creation mode: 'backend' = backend signs & funds (current default);
  // 'self' = the creator signs registry.createMarket from their own wallet and funds the
  // initial liquidity themselves. Flip via env + restart — instantly reversible.
  createMode: (process.env.CREATE_MODE === "self" ? "self" : "backend") as "self" | "backend",

  // AI
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",

  // World ID 4.0
  worldAppId: process.env.WORLD_APP_ID ?? "",
  worldRpId: process.env.WORLD_RP_ID ?? "",

  // Blink
  blinkMerchantId: process.env.BLINK_MERCHANT_ID ?? "",
  blinkPemPath: process.env.BLINK_PRIVATE_KEY_PEM ?? "./blink-private.pem",

  // agents / anti-sybil
  approvalThresholdUsdc: Number(process.env.APPROVAL_THRESHOLD_USDC ?? 5),
  maxAgentsPerHuman: Number(process.env.MAX_AGENTS_PER_HUMAN ?? 3),
  freeTrialBets: Number(process.env.FREE_TRIAL_BETS_PER_HUMAN ?? 10),
};

export const MODELS = { agent: "claude-haiku-4-5", resolution: "claude-sonnet-4-6" } as const;
export const toUsdc = (human: number) => BigInt(Math.round(human * 10 ** config.usdcDecimals));
export const fromUsdc = (raw: bigint) => Number(raw) / 10 ** config.usdcDecimals;
export const txUrl = (h: string) => `${config.explorer}/tx/${h}`;
