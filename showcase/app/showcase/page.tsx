"use client";

// SHOWCASE DEMO — throwaway. Looks like a product; under the hood the login,
// World ID and Blink widgets are the REAL integrations from tests 3/4/5.
// Market data is mocked. Do NOT carry this code into the Friday repo.

import { useEffect, useMemo, useState } from "react";
import {
  DynamicWidget,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import { useBlinkDeposit } from "@swype-org/deposit/react";
import {
  IDKitRequestWidget,
  orbLegacy,
  type RpContext,
} from "@worldcoin/idkit";
import "./showcase.css";
import { MARKETS, sharesOut, fmtUsd, type Market } from "./market-data";
import { DEMO_MARKETS, type DemoMarket } from "./demo-markets";
import { LiveMarketCard, LiveTradeModal, useDotation, AgentFeed } from "./live";

const WORLD_APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "app_REPLACE";
const WORLD_RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "rp_REPLACE";
const WORLD_ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "create-market";
const WORLD_READY = WORLD_APP_ID.startsWith("app_") && WORLD_APP_ID !== "app_REPLACE";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_CHAIN_ID = 8453;

export default function Showcase() {
  const { primaryWallet } = useDynamicContext();
  const [trade, setTrade] = useState<{ m: Market; side: "yes" | "no" } | null>(null);
  const [liveTrade, setLiveTrade] = useState<{ m: DemoMarket; side: 0 | 1 } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const blink = useBlinkDeposit({ signer: "/api/sign-payment" });
  const dotation = useDotation(primaryWallet);
  const [createdMarkets, setCreatedMarkets] = useState<DemoMarket[]>([]);

  useEffect(() => {
    (async () => {
      const b = await fetch("/api/create-market").then((r) => r.json()).catch(() => ({ created: [] }));
      const resolved = await Promise.all((b.created ?? []).map(async (m: any) => {
        let author = m.creator ?? "anon";
        if (m.creator && /^0x[a-fA-F0-9]{40}$/.test(m.creator)) {
          const name = await fetch(`/api/ens-name?address=${m.creator}`).then((r) => r.json()).then((d) => d.name).catch(() => null);
          author = name ?? `${m.creator.slice(0, 6)}…${m.creator.slice(-4)}`;
        }
        return { id: m.id, address: m.address, question: m.question, emoji: "🎯", gradient: "linear-gradient(135deg,#8957e5,#3a1d6e)", author };
      }));
      setCreatedMarkets(resolved);
    })();
  }, []);

  return (
    <div className="wrap">
      {/* Header */}
      <header className="hdr">
        <div className="brand">
          <span className="logo">J</span>
          <span className="name">Justify</span>
          <nav className="nav">
            <a href="/showcase" className="nav-a active">Feed</a>
            <a href="/agents" className="nav-a">Agents</a>
            <a href="/leaderboard" className="nav-a">Leaderboard</a>
            <a href="/portfolio" className="nav-a">Portfolio</a>
          </nav>
        </div>
        <div className="hdr-right">
          <button
            className="btn ghost"
            title="Live Blink deposit widget (merchant APPROVED). Mainnet-only — completing a deposit needs real USDC from a source wallet."
            onClick={() => primaryWallet ? blink.requestDeposit({ amount: 50, chainId: BASE_CHAIN_ID, address: primaryWallet.address, token: USDC_BASE }) : alert("Log in first")}
          >
            Deposit
          </button>
          <DynamicWidget />
        </div>
      </header>

      {primaryWallet && (
        <div className="wallet-bar">
          embedded wallet: <code>{primaryWallet.address}</code>
          <span className="identity-badge" title="ENS identity lives on Ethereum mainnet; funds/trades run on Arc. Same address on both.">
            🪪 Identity on Ethereum (ENS) · Funds on Arc
          </span>
          {dotation && <span className="dot-state">· {dotation}</span>}
        </div>
      )}

      {/* LIVE markets on Arc */}
      <div className="toolbar">
        <h2>● Live markets <span className="sub">— real bets on Arc</span></h2>
      </div>
      <main className="feed">
        {[...DEMO_MARKETS, ...createdMarkets].map((m) => (
          <LiveMarketCard key={m.address} market={m} user={primaryWallet?.address as `0x${string}` | undefined}
            onTrade={(mkt, side) => primaryWallet ? setLiveTrade({ m: mkt, side }) : alert("Log in first")} />
        ))}
      </main>

      {/* Live AI-agent activity */}
      <AgentFeed />

      {/* Feed toolbar */}
      <div className="toolbar">
        <h2>Trending markets <span className="sub">— mock feed</span></h2>
        <button className="btn create" onClick={() => setCreateOpen(true)}>
          {WORLD_READY ? "+ Create Market" : "+ Create Market (World ID pending)"}
        </button>
      </div>

      {/* Feed */}
      <main className="feed">
        {MARKETS.map((m) => (
          <article key={m.id} className="card">
            <div className="thumb" style={{ background: m.gradient }}>
              <span>{m.emoji}</span>
              <span className="mock-badge">demo · mock</span>
            </div>
            <div className="card-body">
              <div className="author">
                {m.author} <span className="badge" title="verified human (World ID)">✓</span>
              </div>
              <h3 className="q">{m.question}</h3>
              <div className="meta">
                <div className="chance">
                  <div className="bar"><div className="fill" style={{ width: `${m.chance}%` }} /></div>
                  <span>{m.chance}% chance</span>
                </div>
                <span className="vol">{fmtUsd(m.volumeUsd)} Vol</span>
              </div>
              <div className="actions">
                <button className="btn yes" onClick={() => setTrade({ m, side: "yes" })}>Buy Yes</button>
                <button className="btn no" onClick={() => setTrade({ m, side: "no" })}>Buy No</button>
              </div>
            </div>
          </article>
        ))}
      </main>

      <footer className="foot">
        showcase demo · live integrations: Dynamic · World ID · Blink · (markets mocked)
      </footer>

      {liveTrade && <LiveTradeModal market={liveTrade.m} side={liveTrade.side} primaryWallet={primaryWallet} onClose={() => setLiveTrade(null)} />}
      {trade && <TradeModal trade={trade} onClose={() => setTrade(null)} />}
      {createOpen && (
        <CreateMarketModal
          ready={WORLD_READY}
          walletAddress={primaryWallet?.address}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {/* blink status toast */}
      {blink.error && <div className="toast err">Blink: {blink.displayMessage}</div>}
    </div>
  );
}

function TradeModal({ trade, onClose }: { trade: { m: Market; side: "yes" | "no" }; onClose: () => void }) {
  const { m, side } = trade;
  const [amount, setAmount] = useState("100");
  const a = Number(amount);
  const out = useMemo(() => sharesOut(side, a, m.rYes, m.rNo), [side, a, m.rYes, m.rNo]);
  const avgPrice = a > 0 && out > 0 ? a / out : 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{m.question}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className={`pill ${side}`}>Buying {side.toUpperCase()}</div>

        <label className="lbl">Amount (USDC)</label>
        <input className="input" value={amount} inputMode="decimal"
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />

        <div className="calc">
          <div><span>Shares out</span><b>{out.toFixed(2)}</b></div>
          <div><span>Avg price</span><b>{avgPrice ? `$${avgPrice.toFixed(3)}` : "—"}</b></div>
          <div><span>Potential return</span><b>{out ? `$${out.toFixed(2)}` : "—"}</b></div>
        </div>
        <p className="cpmm">CPMM (client-side): tokensOut = r{side === "yes" ? "Yes" : "No"} + a − (rYes·rNo)/(r{side === "yes" ? "No" : "Yes"} + a)</p>

        <button className="btn confirm" disabled title="on-chain on hackathon">
          Confirm — on-chain on hackathon
        </button>
      </div>
    </div>
  );
}

function CreateMarketModal({ ready, walletAddress, onClose }: { ready: boolean; walletAddress?: string; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState(false);
  const [label, setLabel] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState<any>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  async function createMarket() {
    setCreating(true); setStatus("Deploying market on Arc…");
    try {
      const res = await fetch("/api/create-market", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, creator: walletAddress }),
      });
      const body = await res.json();
      if (!res.ok) setStatus("Create failed: " + (body.error ?? JSON.stringify(body)));
      else { setCreated(body); setStatus(""); }
    } finally { setCreating(false); }
  }

  // Live availability check on the name input (debounced).
  useEffect(() => {
    if (!label) { setAvailable(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/mint-subname?label=${label}`).then((r) => r.json()).then((b) => setAvailable(b.available)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [label]);

  // Skip World ID if this wallet already verified (demo re-runnability).
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/verify-proof?address=${walletAddress}`)
      .then((r) => r.json())
      .then((b) => { if (b.verified) setVerified(true); })
      .catch(() => {});
  }, [walletAddress]);

  async function mintName() {
    setMinting(true); setStatus("Minting " + label + ".jstfy-demo.eth on Ethereum…");
    try {
      const res = await fetch("/api/mint-subname", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, userAddr: walletAddress }),
      });
      const body = await res.json();
      if (!res.ok) { setStatus("Mint failed: " + JSON.stringify(body)); }
      else { setMintResult(body); setStatus(""); }
    } finally { setMinting(false); }
  }

  async function verify() {
    setStatus("Fetching RP signature…");
    const rpSig = await fetch("/api/rp-signature", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: WORLD_ACTION }),
    }).then((r) => r.json());
    setRpContext({
      rp_id: WORLD_RP_ID, nonce: rpSig.nonce,
      created_at: rpSig.created_at, expires_at: rpSig.expires_at, signature: rpSig.sig,
    });
    setOpen(true);
    setStatus("Scan with the World ID simulator…");
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Create a market</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <p className="muted">Creating a market requires proving you&apos;re a unique human (World ID). Then write your question — it deploys a real market on Arc.</p>
        {walletAddress && <p className="muted">as <code>{walletAddress.slice(0, 10)}…</code></p>}

        {/* Step 2 — create the market (after World ID) */}
        {verified && !created && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">✅ Human verified. Write your market question:</p>
            <input className="input" placeholder="Will ETH flip BTC by 2027?" value={question} disabled={creating}
              onChange={(e) => setQuestion(e.target.value)} style={{ margin: "8px 0" }} />
            <button className="btn create wide" disabled={creating || question.trim().length < 8} onClick={createMarket}>
              {creating ? "Deploying on Arc…" : "Create market (real Arc deploy)"}
            </button>

            {/* secondary: claim ENS name */}
            {!mintResult ? (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #30363d" }}>
                <p className="muted" style={{ fontSize: 12 }}>Optional — claim your ENS name (Ethereum):</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0" }}>
                  <input className="input" placeholder="yourname" value={label} disabled={minting}
                    onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} style={{ flex: 1 }} />
                  <span className="muted">.jstfy-demo.eth</span>
                </div>
                {label && available === false && <p className="err">⛔ taken</p>}
                {label && available === true && <p className="muted" style={{ color: "#3fb950" }}>✓ available</p>}
                <button className="btn ghost wide" disabled={minting || !label || available === false} onClick={mintName}>
                  {minting ? "Minting…" : "Claim name"}
                </button>
              </div>
            ) : (
              <div className="success" style={{ marginTop: 12 }}>🪪 <b>{mintResult.name}</b> {mintResult.existing ? "(already yours)" : "minted"}.</div>
            )}
          </div>
        )}

        {/* Step 3 — market created */}
        {created && (
          <div className="success" style={{ marginTop: 12 }}>
            🎉 Market deployed on Arc!
            <div><a href={created.explorer} target="_blank" rel="noreferrer">{created.address?.slice(0, 12)}… on Arcscan ↗</a></div>
            <div className="muted" style={{ marginTop: 6 }}>It now appears in the Live feed. <a href="/showcase" onClick={() => location.reload()}>refresh</a></div>
          </div>
        )}

        {ready && !verified && (
          <>
            <button className="btn create wide" onClick={verify}>Verify with World ID</button>
            {rpContext && (
              <IDKitRequestWidget
                open={open}
                onOpenChange={setOpen}
                app_id={WORLD_APP_ID as `app_${string}`}
                action={WORLD_ACTION}
                rp_context={rpContext}
                allow_legacy_proofs={true}
                environment="staging"
                preset={orbLegacy({ signal: walletAddress ?? "" })}
                handleVerify={async (result) => {
                  setStatus("Verifying proof on backend…");
                  const res = await fetch("/api/verify-proof", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ rp_id: WORLD_RP_ID, idkitResponse: result, walletAddress }),
                  });
                  const body = await res.json();
                  if (!res.ok) { setStatus("Verification failed: " + JSON.stringify(body)); throw new Error("verify failed"); }
                }}
                onSuccess={() => { setVerified(true); setOpen(false); setStatus(""); }}
              />
            )}
          </>
        )}

        {!ready && (
          <>
            <button
              className="btn ghost wide"
              onClick={() => setStatus("World ID ключи ещё не заданы. Добавь NEXT_PUBLIC_WORLD_APP_ID / NEXT_PUBLIC_WORLD_RP_ID / RP_SIGNING_KEY в app/.env.local (developer.world.org → включить World ID 4.0) — кнопка оживёт.")}
              title="World ID keys not set yet"
            >
              World ID pending
            </button>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Нужны app_id / rp_id / signing_key из developer.world.org. Флоу уже подключён — оживёт сам, как добавишь ключи.
            </p>
          </>
        )}
        {status && <pre className="status">{status}</pre>}
      </div>
    </div>
  );
}

