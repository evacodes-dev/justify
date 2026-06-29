import { createPublicClient, createWalletClient, http, defineChain, type WalletClient, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import PQueue from "p-queue";
import { config } from "./config.js";

// `arc` is the active EVM chain (named for historical reasons; now network-selectable
// via NETWORK env — Arc testnet, Base Sepolia, or Base mainnet). Native currency +
// explorer come from the deployment file, so Base (gas in ETH) works unchanged.
export const arc = defineChain({
  id: config.chainId,
  name: config.network,
  nativeCurrency: config.nativeCurrency,
  rpcUrls: { default: { http: [config.arcRpc] } },
  blockExplorers: { default: { name: "Explorer", url: config.explorer } },
});

export const publicClient = createPublicClient({ chain: arc, transport: http(config.arcRpc) });

// One serial queue per signer address → no nonce collisions when many agent/onboard
// actions fire in parallel. Every write goes through signer.run(...).
const queues = new Map<string, PQueue>();
function queueFor(addr: string): PQueue {
  let q = queues.get(addr.toLowerCase());
  if (!q) {
    q = new PQueue({ concurrency: 1 });
    queues.set(addr.toLowerCase(), q);
  }
  return q;
}

export type Signer = {
  account: Account;
  wallet: WalletClient;
  address: `0x${string}`;
  run<T>(fn: (s: { account: Account; wallet: WalletClient }) => Promise<T>): Promise<T>;
};

export function makeSigner(pk: `0x${string}`): Signer {
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: arc, transport: http(config.arcRpc) });
  return {
    account,
    wallet,
    address: account.address,
    run: (fn) => queueFor(account.address).add(() => fn({ account, wallet })) as Promise<any>,
  };
}

// Backend signer (verifier + oracle + faucet). Lazily created so the server can boot
// for read-only routes even if BACKEND_PK isn't set yet.
let _backend: Signer | null = null;
export function backendSigner(): Signer {
  if (!_backend) {
    if (!config.backendPk) throw new Error("BACKEND_PK not set");
    _backend = makeSigner(config.backendPk);
  }
  return _backend;
}
