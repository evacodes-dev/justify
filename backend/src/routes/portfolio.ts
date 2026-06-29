import type { FastifyInstance } from "fastify";
import { encodeFunctionData } from "viem";
import { db, kv } from "../store.js";
import { config, fromUsdc, toUsdc } from "../config.js";
import { publicClient } from "../chain.js";
import { erc20Abi } from "../abis.js";

async function walletUsdcBalance(address: `0x${string}`): Promise<number> {
  return fromUsdc(
    (await publicClient.readContract({
      address: config.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint,
  );
}

// BE5 — private PnL / portfolio. Computed from the user's own trades (cost basis),
// positions (shares held) and market state (resolved outcome or live price).
// Private by design: returned only for the queried address; there is no public
// leaderboard surface that exposes it (regulatory caution).
export async function portfolioRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>("/api/pnl/:address", async (req, reply) => {
    const raw = String(req.params.address);
    if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return reply.code(400).send({ error: "address" });
    const addr = raw.toLowerCase();

    // cost basis per market (sum of this user's buy amounts)
    const cost = new Map<number, number>();
    for (const t of db.trades.filter((t) => t.user.toLowerCase() === addr)) {
      cost.set(t.marketId, (cost.get(t.marketId) ?? 0) + t.amountUsdc);
    }

    let invested = 0,
      currentValue = 0,
      realized = 0,
      unrealized = 0;
    const positions: any[] = [];

    for (const [marketId, spent] of cost) {
      const m = db.markets.get(marketId);
      if (!m) continue;
      const pos = db.positions.find((p) => p.marketId === marketId && p.user.toLowerCase() === addr);
      const yes = pos?.yes ?? 0;
      const no = pos?.no ?? 0;
      invested += spent;

      let value: number;
      if (m.resolved) {
        // 1 winning share = 1 USDC; INVALID refunds YES+NO at 0.5 each
        value = m.outcome === 2 ? (yes + no) / 2 : m.outcome === 1 ? yes : no;
        realized += value - spent;
      } else {
        const pYes = m.priceYes ?? 0.5;
        value = yes * pYes + no * (1 - pYes); // mark-to-market
        unrealized += value - spent;
      }
      currentValue += value;
      positions.push({
        marketId,
        question: m.question,
        resolved: m.resolved,
        outcome: m.resolved ? (m.outcome ?? null) : null,
        shares: { yes, no },
        cost: spent,
        value,
        pnl: value - spent,
      });
    }

    // live wallet USDC balance (settlement-chain), for the cabinet header
    let walletUsdc = 0;
    try {
      walletUsdc = await walletUsdcBalance(raw as `0x${string}`);
    } catch {
      /* RPC hiccup — balance stays 0, PnL still returned */
    }

    return {
      address: raw,
      walletUsdc,
      invested,
      currentValue,
      realized,
      unrealized,
      net: realized + unrealized,
      positions: positions.sort((a, b) => b.value - a.value),
    };
  });

  // BE6 — withdraw (NON-CUSTODIAL). The backend never holds user funds nor signs on their
  // behalf: it validates the request (limits, balance) and returns an UNSIGNED ERC20 transfer
  // for the user's embedded wallet to sign. Key custody stays with the user; we only audit.
  // (A custodial variant — backend moving funds with its own key — is intentionally NOT built;
  // it needs a separate custody/compliance decision.)
  app.get<{ Params: { address: string } }>("/api/withdraw/quote/:address", async (req, reply) => {
    const raw = String(req.params.address);
    if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return reply.code(400).send({ error: "address" });
    let withdrawable = 0;
    try {
      withdrawable = await walletUsdcBalance(raw as `0x${string}`);
    } catch {
      /* RPC hiccup */
    }
    return {
      address: raw,
      withdrawable,
      token: config.usdc,
      chainId: config.chainId,
      gasToken: config.nativeCurrency.symbol,
    };
  });

  app.post<{ Body: any }>("/api/withdraw/prepare", async (req, reply) => {
    const { address, to, amount } = (req.body ?? {}) as { address?: string; to?: string; amount?: number };
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "address" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(to ?? "")) return reply.code(400).send({ error: "to" });
    const amt = Number(amount);
    if (!(amt > 0)) return reply.code(400).send({ error: "amount" });

    const balance = await walletUsdcBalance(address as `0x${string}`).catch(() => 0);
    if (amt > balance) return reply.code(400).send({ error: "insufficient", balance });

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, toUsdc(amt)],
    });

    // append-only audit log (support/compliance) — records intent, moves no funds
    const log = kv.get<any[]>("withdrawals", []);
    log.push({ ts: Date.now(), address, to, amount: amt });
    kv.set("withdrawals", log.slice(-1000));

    return {
      chainId: config.chainId,
      tx: { to: config.usdc, value: "0", data }, // user signs this from their embedded wallet
      amount: amt,
      note: "Sign this USDC transfer from your wallet to complete the withdrawal.",
    };
  });
}
