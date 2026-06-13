"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import "../../showcase/showcase.css";
import { Nav } from "../../showcase/nav";
import { MarketSocial } from "../../showcase/live";
import { DEMO_MARKETS, ARC } from "../../showcase/demo-markets";
import { readMarket } from "../../../lib/arc";

type MarketState = Awaited<ReturnType<typeof readMarket>>;

export default function MarketDetail() {
  const params = useParams();
  const id = Number(params.id);
  // base markets are static; user-created markets (id 100+) live in the store
  const [market, setMarket] = useState<{ id: number; address: `0x${string}`; question: string; emoji: string; gradient: string } | null | undefined>(undefined);
  useEffect(() => {
    const base = DEMO_MARKETS.find((m) => m.id === id);
    if (base) { setMarket(base); return; }
    fetch("/api/create-market").then((r) => r.json()).then((b) => {
      const c = (b.created ?? []).find((m: any) => m.id === id);
      setMarket(c ? { id: c.id, address: c.address, question: c.question, emoji: "🎯", gradient: "linear-gradient(135deg,#8957e5,#3a1d6e)" } : null);
    }).catch(() => setMarket(null));
  }, [id]);
  const [s, setS] = useState<MarketState | null>(null);
  const [resolution, setResolution] = useState<{ rationale: string; verdict: string; tx?: string; model?: string; ethPrice?: number } | null>(null);
  const [creLog, setCreLog] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const { primaryWallet } = useDynamicContext();
  const user = primaryWallet?.address;
  const [ens, setEns] = useState<string | undefined>(undefined);
  useEffect(() => { if (user) fetch(`/api/ens-name?address=${user}`).then((r) => r.json()).then((b) => setEns(b.name ?? undefined)).catch(() => {}); }, [user]);

  useEffect(() => {
    if (!market) return;
    readMarket(market.address).then(setS).catch(() => {});
    fetch(`/api/resolution/${id}`).then((r) => (r.ok ? r.json() : null)).then(setResolution).catch(() => {});
    if (id === 1) fetch("/api/cre-log").then((r) => r.json()).then((b) => setCreLog(b.log ?? "")).catch(() => {});
  }, [market, id]);

  async function runCre() {
    setBusy("cre"); setCreLog("Running cre workflow simulate… (reads ETH/USD feed)");
    try { const b = await fetch("/api/cre-run", { method: "POST" }).then((r) => r.json()); setCreLog(b.log ?? "no output"); }
    catch (e: any) { setCreLog("Failed: " + (e?.message ?? e)); }
    finally { setBusy(""); }
  }
  async function runResolve() {
    setBusy("resolve");
    try { const b = await fetch("/api/admin-resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).then((r) => r.json()); if (!b.error) setResolution(b); }
    finally { setBusy(""); readMarket(market!.address).then(setS).catch(() => {}); }
  }

  if (market === undefined) {
    return <div className="wrap"><Nav active="/showcase" /><div className="detail"><p className="muted">Loading…</p></div></div>;
  }
  if (market === null) {
    return <div className="wrap"><Nav active="/showcase" /><div className="detail"><h1>Market not found</h1><a className="back" href="/showcase">← back to feed</a></div></div>;
  }

  return (
    <div className="wrap">
      <Nav active="/showcase" />
      <div className="detail">
        <h1>{market.question}</h1>
        <div className="author">DemoMarket #{market.id} ·{" "}
          <a href={`${ARC.explorer}/address/${market.address}`} target="_blank" rel="noreferrer">{market.address.slice(0, 10)}… on Arcscan ↗</a>
        </div>

        <div className="meta" style={{ maxWidth: 420, marginTop: 18 }}>
          <div className="chance">
            <div className="bar"><div className="fill" style={{ width: `${s?.yesPct ?? 50}%` }} /></div>
            <span>{s?.yesPct ?? 50}% YES</span>
          </div>
          <span className="vol">{s ? `$${s.total.toFixed(2)}` : "…"} Vol · YES ${s?.yes.toFixed(2) ?? "0"} / NO ${s?.no.toFixed(2) ?? "0"}</span>
        </div>
        {s?.resolved && <p className="resolved-tag" style={{ marginTop: 12 }}>RESOLVED</p>}

        {id === 1 && (
          <div className="res-block">
            <div className="post-top" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>⛓️ Chainlink CRE — resolution workflow</h3>
              <button className="btn create" disabled={busy === "cre"} onClick={runCre}>{busy === "cre" ? "Simulating…" : "Run CRE simulation"}</button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Reads ETH/USD from a Chainlink Data Feed → decides the outcome → prepares a signed report (dry-run, no broadcast).</p>
            {creLog && <pre className="status" style={{ maxHeight: 220, overflow: "auto" }}>{creLog}</pre>}
          </div>
        )}

        <div className="res-block">
          <div className="post-top" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>🤖 AI Resolution {resolution?.model && <span className="muted" style={{ fontSize: 12 }}>· {resolution.model}</span>}</h3>
            {!resolution && !s?.resolved && <button className="btn create" disabled={busy === "resolve"} onClick={runResolve}>{busy === "resolve" ? "Thinking…" : "Run AI resolution"}</button>}
          </div>
          {resolution ? (
            <>
              <p><strong>Verdict:</strong> <span style={{ color: resolution.verdict === "NO" ? "#f85149" : "#3fb950" }}>{resolution.verdict}</span>{resolution.ethPrice ? ` · ETH $${resolution.ethPrice}` : ""}</p>
              <p className="muted">{resolution.rationale}</p>
              {resolution.tx && <a className="post-tx" href={`${ARC.explorer}/tx/${resolution.tx}`} target="_blank" rel="noreferrer">resolve tx on Arc ↗</a>}
            </>
          ) : (
            <p className="muted">Claude reads the live ETH price → writes a verdict + rationale → calls resolve() on Arc.</p>
          )}
        </div>

        <MarketSocial marketId={id} user={user} ens={ens} />
      </div>
    </div>
  );
}
