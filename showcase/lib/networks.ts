// Single source of truth for all cross-chain network params (RPC, USDC, CCTP V2
// contracts, Iris attestation host). Switch the whole stack with ONE env var:
//   NETWORK=testnet (default)  |  NETWORK=mainnet
// Bridge logic (lib/cctp.ts) reads only from here — no per-file hardcoding.
//
// CCTP V2 testnet contracts are the SAME deterministic address on every chain
// (verified on developers.circle.com/cctp/evm-smart-contracts, 2026-06-13).
// Arc is CCTP domain 26 (verified on the supported-blockchains table).

export type ChainCfg = {
  name: string;
  chainId: number;
  rpc: string;
  usdc: `0x${string}`;
  domain: number;                  // CCTP domain id
  tokenMessengerV2: `0x${string}`;
  messageTransmitterV2: `0x${string}`;
  explorer: string;
};
export type NetCfg = { profile: "testnet" | "mainnet"; base: ChainCfg; arc: ChainCfg; iris: string };

// --- CCTP V2 deterministic contract addresses ------------------------------
const V2_TESTNET = {
  tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const,     // VERIFIED (Circle docs)
  messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const,  // VERIFIED (Circle docs)
};
const V2_MAINNET = {
  // MUST-VERIFY on Circle docs before flipping NETWORK=mainnet (env-overridable below).
  tokenMessengerV2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const,
  messageTransmitterV2: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const,
};

const env = (k: string, d: string) => (process.env[k] && process.env[k]!.length ? process.env[k]! : d);

const PROFILES: Record<"testnet" | "mainnet", NetCfg> = {
  testnet: {
    profile: "testnet",
    iris: env("IRIS_URL", "https://iris-api-sandbox.circle.com"),
    base: {
      name: "Base Sepolia", chainId: 84532,
      rpc: env("BASE_RPC", "https://sepolia.base.org"),
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",          // VERIFIED (Circle)
      domain: 6,
      tokenMessengerV2: V2_TESTNET.tokenMessengerV2,
      messageTransmitterV2: V2_TESTNET.messageTransmitterV2,
      explorer: "https://sepolia.basescan.org",
    },
    arc: {
      name: "Arc Testnet", chainId: 5042002,
      rpc: env("ARC_RPC", "https://rpc.testnet.arc.network"),
      usdc: "0x3600000000000000000000000000000000000000",          // VERIFIED (Circle) — native USDC iface
      domain: 26,
      tokenMessengerV2: V2_TESTNET.tokenMessengerV2,
      messageTransmitterV2: V2_TESTNET.messageTransmitterV2,
      explorer: env("ARC_EXPLORER", "https://explorer.testnet.arc.network"),
    },
  },
  mainnet: {
    profile: "mainnet",
    iris: env("IRIS_URL", "https://iris-api.circle.com"),
    base: {
      name: "Base", chainId: 8453,
      rpc: env("BASE_RPC", "https://mainnet.base.org"),
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",          // VERIFIED (Circle) Base mainnet USDC
      domain: 6,
      tokenMessengerV2: (env("BASE_TOKEN_MESSENGER_V2", V2_MAINNET.tokenMessengerV2)) as `0x${string}`,
      messageTransmitterV2: (env("BASE_MESSAGE_TRANSMITTER_V2", V2_MAINNET.messageTransmitterV2)) as `0x${string}`,
      explorer: "https://basescan.org",
    },
    arc: {
      // MUST-VERIFY Arc mainnet chainId / RPC / USDC before flipping.
      name: "Arc", chainId: Number(env("ARC_MAINNET_CHAINID", "0")),
      rpc: env("ARC_MAINNET_RPC", ""),
      usdc: (env("ARC_MAINNET_USDC", "0x3600000000000000000000000000000000000000")) as `0x${string}`,
      domain: 26,
      tokenMessengerV2: (env("ARC_TOKEN_MESSENGER_V2", V2_MAINNET.tokenMessengerV2)) as `0x${string}`,
      messageTransmitterV2: (env("ARC_MESSAGE_TRANSMITTER_V2", V2_MAINNET.messageTransmitterV2)) as `0x${string}`,
      explorer: env("ARC_MAINNET_EXPLORER", "https://explorer.arc.network"),
    },
  },
};

export const NETWORK = (process.env.NETWORK === "mainnet" ? "mainnet" : "testnet") as "testnet" | "mainnet";
export const NET: NetCfg = PROFILES[NETWORK];

// Public-safe view for the client (no secrets — all of this is on-chain public).
export function publicNet() {
  return NET;
}
