import { parseEther } from "viem";
import { config } from "./config.js";
import { publicClient, backendSigner, arc } from "./chain.js";

// Shared helpers extracted from route duplication.

export const isAddr = (a?: string): a is `0x${string}` => /^0x[a-fA-F0-9]{40}$/.test(a ?? "");

/// Verify a World ID proof against the developer portal. Returns the nullifier on success,
/// throws with the portal's response on failure. Dev bypass (no proof) is decided by the
/// caller via ALLOW_DEV_VERIFY before calling this.
export async function verifyWorldProof(rpId: string, idkitResponse: unknown): Promise<string | undefined> {
  const portal = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });
  if (!portal.ok) {
    const body = await portal.json().catch(() => ({}));
    throw Object.assign(new Error("World ID verification failed"), { portal: body });
  }
  return ((idkitResponse as any)?.responses ?? []).map((r: any) => r?.nullifier).find(Boolean);
}

/// Top up an address's NATIVE balance (gas) if below the configured threshold.
/// Network-aware via config (Base native = ETH, tiny drip). Returns the tx hash or null.
export async function ensureGas(address: `0x${string}`): Promise<string | null> {
  const balWei = await publicClient.getBalance({ address });
  if (Number(balWei) / 1e18 >= config.gasDripThreshold) return null;
  const hash = await backendSigner().run(({ wallet, account }) =>
    wallet.sendTransaction({ to: address, value: parseEther(String(config.gasDripAmount)), account, chain: arc }),
  );
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
