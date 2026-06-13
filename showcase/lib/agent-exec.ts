import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcChain, approveAndBet } from "./arc";

// Server-side bet execution from an agent's OWN wallet (agent.pk lives server-side
// only — throwaway demo keys; KMS in prod). Shared by the tick route (small bets)
// and the approvals route (human-approved large bets) so there's one code path.
export async function executeAgentBet(
  pk: `0x${string}`,
  market: `0x${string}`,
  side: "YES" | "NO",
  amountUsdc: number,
): Promise<{ approveHash: string; betHash: string }> {
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({ account, chain: arcChain, transport: http() });
  return approveAndBet(walletClient, market, side === "YES" ? 1 : 0, amountUsdc);
}
