import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// shared on-chain config produced by the contracts deploy
const deploymentPath = join(here, "../../contracts/deployments/arc-testnet.json");
export const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

export const config = {
  port: Number(process.env.PORT ?? 8787),
  arcRpc: process.env.ARC_RPC ?? deployment.rpc,
  explorer: deployment.explorer as string,
  chainId: deployment.chainId as number,

  // contracts
  factory: deployment.contracts.MarketFactory as `0x${string}`,
  resolver: deployment.contracts.Resolver as `0x${string}`,
  usdc: deployment.collateral.USDC as `0x${string}`,
  usdcDecimals: deployment.collateral.decimals as number,
  deployBlock: BigInt(deployment.deployBlock),

  // signer: verifier (registerCreator) + oracle (resolve) + faucet (gas dotation)
  backendPk: (process.env.BACKEND_PK ?? "") as `0x${string}`,

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
