"use client";

import { useEffect, useState, useCallback } from "react";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { DEMO_MARKETS, ARC, type DemoMarket } from "./demo-markets";
import { approveAndBet, readMarket, txUrl } from "../../lib/arc";

// Auto-dotation: when an embedded wallet appears, fund it once with 0.5 USDC.
export function useDotation(primaryWallet: any) {
  const [state, setState] = useState<string>("");
  useEffect(() => {
    const addr = primaryWallet?.address;
    if (!addr) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dotation", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: addr }),
        });
        const b = await res.json();
        if (!cancelled) setState(b.funded ? "funded 0.5 USDC" : b.skipped ? "already funded" : "");
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [primaryWallet?.address]);
  return state;
}

type MarketState = Awaited<ReturnType<typeof readMarket>>;

export function LiveMarketCard({ market, user, onTrade }: { market: DemoMarket; user?: `0x${string}`; onTrade: (m: DemoMarket, side: 0 | 1) => void }) {
  const [s, setS] = useState<MarketState | null>(null);
  const refresh = useCallback(() => { readMarket(market.address, user).then(setS).catch(() => {}); }, [market.address, user]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);

  return (
    <article className="card live">
      <div className="thumb" style={{ background: market.gradient }}>
        <span>{market.emoji}</span>
        <span className="live-badge">● LIVE on Arc</span>
      </div>
      <div className="card-body">
        <div className="author">
          by {market.author ?? "anon"} <span className="badge" title="market creator">✓</span>
          {" · "}<a href={`/market/${market.id}`}>#{market.id} details</a>
        </div>
        <h3 className="q">{market.question}</h3>
        <div className="meta">
          <div className="chance">
            <div className="bar"><div className="fill" style={{ width: `${s?.yesPct ?? 50}%` }} /></div>
            <span>{s?.yesPct ?? 50}% YES</span>
          </div>
          <span className="vol">{s ? `$${s.total.toFixed(2)}` : "…"} Vol</span>
        </div>
        {s && (s.stakeYes > 0 || s.stakeNo > 0) && (
          <div className="your-pos">your position: YES ${s.stakeYes.toFixed(2)} · NO ${s.stakeNo.toFixed(2)}</div>
        )}
        <CardLike marketId={market.id} user={user} />
        {s?.resolved && <div className="resolved-tag">RESOLVED</div>}
        <div className="actions">
          <button className="btn yes" disabled={s?.resolved} onClick={() => onTrade(market, 1)}>Buy Yes</button>
          <button className="btn no" disabled={s?.resolved} onClick={() => onTrade(market, 0)}>Buy No</button>
        </div>
      </div>
    </article>
  );
}

export function LiveTradeModal({ market, side, primaryWallet, onClose }: { market: DemoMarket; side: 0 | 1; primaryWallet: any; onClose: () => void }) {
  const [amount, setAmount] = useState("0.5");
  const [phase, setPhase] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [betHash, setBetHash] = useState("");
  const [err, setErr] = useState("");
  const a = Number(amount);

  async function confirm() {
    setPhase("signing"); setErr("");
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an EVM wallet");
      await primaryWallet.switchNetwork(ARC.chainId);
      const wc = await primaryWallet.getWalletClient();
      const { betHash } = await approveAndBet(wc, market.address, side, a);
      setBetHash(betHash); setPhase("done");
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || String(e)); setPhase("error");
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{market.question}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className={`pill ${side === 1 ? "yes" : "no"}`}>Buying {side === 1 ? "YES" : "NO"} · live on Arc</div>

        <label className="lbl">Amount (USDC)</label>
        <input className="input" value={amount} inputMode="decimal" disabled={phase === "signing"}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        {/* DemoMarket is fixed 50/50 → shares 1:1 (no FPMM curve in the showcase) */}
        <div className="calc"><div><span>Shares (1:1 demo)</span><b>{a > 0 ? a.toFixed(2) : "—"}</b></div></div>

        {phase !== "done" && (
          <button className="btn confirm-live" disabled={phase === "signing" || !(a > 0)} onClick={confirm}>
            {phase === "signing" ? "Signing approve + bet…" : `Confirm — real tx on Arc`}
          </button>
        )}
        {phase === "error" && <p className="err">{err}</p>}
        {phase === "done" && (
          <div className="success">
            ✅ Bet placed on-chain.
            <div><a href={txUrl(betHash)} target="_blank" rel="noreferrer">View tx on Arcscan ↗</a></div>
            <code>{betHash.slice(0, 18)}…</code>
          </div>
        )}
      </div>
    </div>
  );
}

export { DEMO_MARKETS };

export type Post = {
  ts: number; agent: string; action: "bet" | "skip" | "request_approval";
  marketId?: number; marketQuestion?: string; side?: string; amountUsdc?: number;
  confidence?: number; impliedProb?: number; estProb?: number; edge?: number;
  reasoning: string; dataUsed?: { label: string; value: string; source: string }[];
  humanBacked?: boolean; tx?: string; status?: string;
};

function confColor(c?: number) { if (c == null) return "#7d8590"; return c >= 0.66 ? "#3fb950" : c >= 0.4 ? "#d29922" : "#f0883e"; }

// Block 2 — rich "agent's thoughts" card: chain-of-thought + est-vs-implied + data + tx.
export function ReasoningCard({ p }: { p: Post }) {
  const est = p.estProb != null ? Math.round(p.estProb * 100) : null;
  const imp = p.impliedProb != null ? Math.round(p.impliedProb * 100) : null;
  return (
    <div className="rcard" style={{ borderLeft: `3px solid ${confColor(p.confidence)}` }}>
      <div className="rcard-head">
        <span className="post-agent">🤖 {p.agent}</span>
        {p.humanBacked && <span className="hb-badge" title="proof-of-human (World AgentKit)">human-backed ✓</span>}
        {p.confidence != null && <span className="conf" style={{ color: confColor(p.confidence) }}>conf {Math.round(p.confidence * 100)}%</span>}
        <span className="rcard-time">{new Date(p.ts).toLocaleTimeString()}</span>
      </div>

      {p.action === "skip" ? (
        <div className="rcard-act skip">⏭ skipped</div>
      ) : (
        <div className={`rcard-act ${p.action === "request_approval" ? "wait" : (p.side === "YES" ? "yes" : "no")}`}>
          {p.action === "request_approval" ? "⏳ awaiting human approval" : "●"} {p.side ? `${p.side}` : ""} {p.amountUsdc ? `$${p.amountUsdc}` : ""}
          {p.marketQuestion && <span className="rcard-q"> · {p.marketQuestion}</span>}
        </div>
      )}

      {est != null && imp != null && (
        <div className="probrow">
          <span>agent est <b style={{ color: confColor(p.confidence) }}>{est}% YES</b></span>
          <span className="muted">vs market {imp}%</span>
          {p.edge != null && <span className="edge">edge {Math.round(p.edge * 100)}pp</span>}
        </div>
      )}

      <div className="rcard-reason">{p.reasoning}</div>

      {p.dataUsed && p.dataUsed.length > 0 && (
        <div className="datachips">
          {p.dataUsed.map((d, i) => (
            <span key={i} className={`chip ${d.source === "x402" ? "paid" : ""}`}>{d.label}{d.value ? `: ${d.value}` : ""}{d.source === "x402" ? " · paid via x402" : ""}</span>
          ))}
        </div>
      )}
      {p.tx && <a className="post-tx" href={txUrl(p.tx)} target="_blank" rel="noreferrer">tx on Arc ↗</a>}
    </div>
  );
}

// Live AI-agent activity: polls the feed, can trigger a tick, auto-ticks every 2 min.
export function AgentFeed() {
  const [feed, setFeed] = useState<Post[]>([]);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/agent/tick").then((r) => r.json()).then((b) => setFeed(b.feed ?? [])).catch(() => {});
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 10000); return () => clearInterval(t); }, [refresh]);

  const tick = useCallback(async () => {
    setRunning(true);
    try { await fetch("/api/agent/tick", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); refresh(); }
    finally { setRunning(false); }
  }, [refresh]);

  // 2-minute autonomous loop (client-driven cron for the demo)
  useEffect(() => { if (!auto) return; const t = setInterval(tick, 120000); return () => clearInterval(t); }, [auto, tick]);

  return (
    <section className="agent-feed">
      <div className="agent-head">
        <h2>🤖 Live agent activity <span className="sub">— real bets from AI agents</span></h2>
        <div className="agent-ctrl">
          <label className="auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto (2 min)</label>
          <button className="btn create" disabled={running} onClick={tick}>{running ? "thinking…" : "Run agent now"}</button>
        </div>
      </div>
      <div className="posts">
        {feed.length === 0 && <div className="muted">No agent activity yet — click “Run agent now”.</div>}
        {feed.map((p) => <ReasoningCard key={p.ts} p={p} />)}
      </div>
    </section>
  );
}


// Compact like button for a market card.
export function CardLike({ marketId, user }: { marketId: number; user?: string }) {
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  useEffect(() => { fetch(`/api/social/${marketId}?viewer=${user ?? ""}`).then((r) => r.json()).then((b) => { setLikes(b.likes); setLiked(b.liked); }).catch(() => {}); }, [marketId, user]);
  async function toggle() {
    if (!user) { alert("Log in to like"); return; }
    const b = await fetch(`/api/social/${marketId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "like", address: user }) }).then((r) => r.json());
    setLikes(b.likes); setLiked(b.liked);
  }
  return (
    <button className={`like-btn ${liked ? "on" : ""}`} onClick={toggle} title="like">
      {liked ? "❤️" : "🤍"} {likes}
    </button>
  );
}

type SocialData = { likes: number; liked: boolean; comments: { author: string; ens?: string; text: string; ts: number }[] };

// Full social block (likes + comments) — commenting gated by World ID.
export function MarketSocial({ marketId, user, ens }: { marketId: number; user?: string; ens?: string }) {
  const [d, setD] = useState<SocialData>({ likes: 0, liked: false, comments: [] });
  const [verified, setVerified] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { fetch(`/api/social/${marketId}?viewer=${user ?? ""}`).then((r) => r.json()).then(setD).catch(() => {}); }, [marketId, user]);
  useEffect(() => {
    load();
    if (user) fetch(`/api/verify-proof?address=${user}`).then((r) => r.json()).then((b) => setVerified(!!b.verified)).catch(() => {});
  }, [load, user]);

  async function like() {
    if (!user) { alert("Log in to like"); return; }
    const b = await fetch(`/api/social/${marketId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "like", address: user }) }).then((r) => r.json());
    setD((x) => ({ ...x, likes: b.likes, liked: b.liked }));
  }
  async function comment() {
    if (!user || !text.trim()) return;
    const res = await fetch(`/api/social/${marketId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "comment", address: user, text, ens }) });
    const b = await res.json();
    if (!res.ok) { setMsg(b.error ?? "error"); } else { setText(""); setMsg(""); load(); }
  }

  return (
    <div className="res-block">
      <div className="post-top" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>💬 Discussion</h3>
        <button className={`like-btn ${d.liked ? "on" : ""}`} onClick={like}>{d.liked ? "❤️" : "🤍"} {d.likes}</button>
      </div>

      {user ? (verified ? (
        <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
          <input className="input" placeholder="Add a comment…" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && comment()} />
          <button className="btn create" disabled={!text.trim()} onClick={comment}>Post</button>
        </div>
      ) : (
        <p className="muted" style={{ margin: "10px 0" }}>🛡️ Verify with <a href="/showcase">World ID</a> to comment (one human, one voice).</p>
      )) : <p className="muted" style={{ margin: "10px 0" }}>Log in to like &amp; comment.</p>}
      {msg && <p className="err">{msg}</p>}

      <div className="posts">
        {d.comments.length === 0 && <div className="muted">No comments yet — be the first.</div>}
        {d.comments.map((c) => (
          <div key={c.ts} className="post">
            <div className="post-top"><span className="post-agent">{c.ens ?? `${c.author.slice(0, 6)}…${c.author.slice(-4)}`} ✓</span></div>
            <div className="post-reason">{c.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
