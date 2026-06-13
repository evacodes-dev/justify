// Topic-aware data for a market — FIX for the showcase bug where every market got the
// ETH price. We read the topic from the question (+ metadataURI) and fetch only relevant data.

export type DataPoint = { key: string; label: string; value: string; source: string };

const COINS: [RegExp, string, string][] = [
  [/\beth(ereum)?\b/i, "ethereum", "ETH"],
  [/\bbtc\b|\bbitcoin\b/i, "bitcoin", "BTC"],
  [/\bsol(ana)?\b/i, "solana", "SOL"],
  [/\bdoge(coin)?\b/i, "dogecoin", "DOGE"],
];

export async function getRelevantData(question: string, metadataURI = ""): Promise<DataPoint[]> {
  const text = `${question} ${metadataURI}`;
  const out: DataPoint[] = [];

  for (const [re, id, sym] of COINS) {
    if (re.test(text)) {
      try {
        const p = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`)
          .then((r) => r.json())
          .then((d: any) => d?.[id]?.usd);
        if (p) out.push({ key: "price", label: `${sym} price`, value: `$${Number(p).toLocaleString()}`, source: "coingecko" });
      } catch {}
      break;
    }
  }

  if (/\bfed\b|\brate(s)?\b|fomc|inflation|cpi/i.test(text)) {
    out.push({ key: "macro", label: "macro", value: "US rates/FOMC topic — weigh latest Fed guidance & CPI trend", source: "context" });
  }

  if (out.length === 0) {
    out.push({ key: "none", label: "data", value: "no direct price feed — reason from base rates & priors", source: "context" });
  }
  return out;
}

export const impliedYesProb = (priceYes: number) => Math.max(0, Math.min(1, priceYes));
