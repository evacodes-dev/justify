// Showcase mock data — THROWAWAY. Not product code. Hardcoded for the demo.
export type Market = {
  id: string;
  question: string;
  emoji: string;
  gradient: string;
  chance: number; // 0..100
  volumeUsd: number;
  author: string; // ENS-style name
  // fake CPMM reserves (shares)
  rYes: number;
  rNo: number;
};

export const MARKETS: Market[] = [
  {
    id: "btc-200k",
    question: "Will BTC close above $200k in 2026?",
    emoji: "₿",
    gradient: "linear-gradient(135deg,#f7931a,#7a3e00)",
    chance: 38,
    volumeUsd: 1_284_500,
    author: "alice.justify.eth",
    rYes: 6200,
    rNo: 3800,
  },
  {
    id: "eth-flip",
    question: "Will ETH/BTC ratio exceed 0.05 before July?",
    emoji: "Ξ",
    gradient: "linear-gradient(135deg,#627eea,#1b1f3b)",
    chance: 61,
    volumeUsd: 642_100,
    author: "bob.justify.eth",
    rYes: 3900,
    rNo: 6100,
  },
  {
    id: "nyc-mayor",
    question: "Will the incumbent win the NYC mayoral race?",
    emoji: "🗽",
    gradient: "linear-gradient(135deg,#2e7d32,#0b3d0b)",
    chance: 54,
    volumeUsd: 2_010_300,
    author: "carol.justify.eth",
    rYes: 4600,
    rNo: 5400,
  },
  {
    id: "fed-cut",
    question: "Will the Fed cut rates at the next meeting?",
    emoji: "🏦",
    gradient: "linear-gradient(135deg,#455a64,#15202b)",
    chance: 72,
    volumeUsd: 988_700,
    author: "dave.justify.eth",
    rYes: 2800,
    rNo: 7200,
  },
  {
    id: "ai-agi",
    question: "Will a major lab claim AGI before 2027?",
    emoji: "🤖",
    gradient: "linear-gradient(135deg,#8e24aa,#2a0a3a)",
    chance: 19,
    volumeUsd: 3_551_900,
    author: "erin.justify.eth",
    rYes: 8100,
    rNo: 1900,
  },
];

// CPMM: deposit `a` USDC, get shares on the chosen side.
// tokensOut = rSide + a − (rYes·rNo)/(rOther + a)
export function sharesOut(side: "yes" | "no", a: number, rYes: number, rNo: number): number {
  if (!Number.isFinite(a) || a <= 0) return 0;
  const k = rYes * rNo;
  if (side === "yes") return rYes + a - k / (rNo + a);
  return rNo + a - k / (rYes + a);
}

export function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
