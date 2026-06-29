import type { FastifyInstance } from "fastify";
import { db } from "../store.js";
import { config, fromUsdc } from "../config.js";
import { publicClient } from "../chain.js";
import { erc20Abi } from "../abis.js";

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
      walletUsdc = fromUsdc(
        (await publicClient.readContract({
          address: config.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [raw as `0x${string}`],
        })) as bigint,
      );
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
}
