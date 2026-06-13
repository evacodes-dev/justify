// Relevant external data per market topic (fixes the "always ETH price" bug).
// Detects the market subject from its question and fetches only what's relevant.

export type DataPoint = { key: string; label: string; value: string; source: string };

async function coingecko(id: string, sym: string): Promise<DataPoint | null> {
  try {
    const p = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`)
      .then((r) => r.json()).then((d) => d?.[id]?.usd);
    return p ? { key: sym, label: `${sym}/USD spot`, value: `$${p}`, source: "coingecko" } : null;
  } catch { return null; }
}

const COINS: [RegExp, string, string][] = [
  [/\beth(ereum)?\b/i, "ethereum", "ETH"],
  [/\bbtc\b|\bbitcoin\b/i, "bitcoin", "BTC"],
  [/\bsol(ana)?\b/i, "solana", "SOL"],
  [/\bdoge\b/i, "dogecoin", "DOGE"],
];

// Returns the relevant data points for a market question.
export async function getRelevantData(question: string): Promise<DataPoint[]> {
  const out: DataPoint[] = [];
  const matched = COINS.filter(([re]) => re.test(question));
  const prices = await Promise.all(matched.map(([, id, sym]) => coingecko(id, sym)));
  prices.forEach((p) => p && out.push(p));

  if (/\bfed\b|\brate(s)?\b|\bfomc\b|\binflation\b|\bcpi\b/i.test(question)) {
    out.push({ key: "macro", label: "macro context", value: "no live rate feed wired — reason from priors", source: "none" });
  }
  if (out.length === 0) {
    out.push({ key: "none", label: "external data", value: "no relevant price feed for this topic — judge from the question + market prices", source: "none" });
  }
  return out;
}

// Implied probability of YES from the parimutuel pools.
export function impliedYesProb(yesPool: number, noPool: number): number {
  const t = yesPool + noPool;
  return t <= 0 ? 0.5 : yesPool / t;
}
