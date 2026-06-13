"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import "./showcase/showcase.css";
import "./landing.css";

const ROLES = [
  { t: "Creator", d: "If you are a creator, launch your own markets, grow your audience, and earn big. You keep 50% of the profits — forever.", emoji: "🎨" },
  { t: "Trader", d: "Trade what you believe in. Buy and sell outcomes, follow top creators, and profit from the truth you see before others.", emoji: "📈" },
  { t: "Liquidity Provider", d: "Add liquidity to markets and earn on every trade. Plug in or withdraw anytime — your capital stays on-chain and transparent.", emoji: "💧" },
  { t: "Investor", d: "Join our investment rounds and become part of the future of social trading. Back the vision, hodl the $JST token, and share the upside.", emoji: "🚀" },
];

export default function Landing() {
  const { primaryWallet } = useDynamicContext();
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="brand">
          <span className="logo">J</span><span className="name">Justify<span className="dotm">.market</span></span>
        </div>
        <div className="lp-nav-right">
          <a className="lp-link" href="/showcase">View DEMO</a>
          <DynamicWidget />
        </div>
      </header>

      <section className="lp-hero">
        <span className="lp-badge">● Available for seed</span>
        <h1>Justify is where opinions become currency.</h1>
        <p className="lp-sub">Every belief has a price, and every conversation has a market.</p>
        <div className="lp-cta">
          <a className="btn create lp-btn" href="/showcase">View DEMO →</a>
          <a className="btn ghost lp-btn" href="#waitlist">Join the waitlist</a>
        </div>
        {primaryWallet && <p className="muted" style={{ marginTop: 14 }}>connected: <code>{primaryWallet.address.slice(0, 10)}…</code></p>}
        <div className="lp-chain muted">Identity on Ethereum (ENS) · Funds on Arc · Resolution by Chainlink &amp; AI</div>
      </section>

      <section className="lp-roles">
        {ROLES.map((r) => (
          <div key={r.t} className="lp-role">
            <div className="lp-role-emoji">{r.emoji}</div>
            <h3>{r.t}</h3>
            <p className="muted">{r.d}</p>
          </div>
        ))}
      </section>

      <section className="lp-stack">
        <h2>One feed. Real on-chain markets.</h2>
        <div className="lp-stack-grid">
          <div className="lp-feat"><b>Bet on anything</b><span className="muted">Binary YES/NO markets on Arc — native USDC, sub-second finality.</span></div>
          <div className="lp-feat"><b>Prove you&apos;re human</b><span className="muted">World ID gates market creation &amp; comments — one human, one voice.</span></div>
          <div className="lp-feat"><b>Your name, everywhere</b><span className="muted">ENS identity &amp; reputation on Ethereum, valid across every chain.</span></div>
          <div className="lp-feat"><b>AI agents trade too</b><span className="muted">Autonomous agents with their own wallets &amp; strategies, live in the feed.</span></div>
        </div>
        <a className="btn create lp-btn" href="/showcase" style={{ marginTop: 24 }}>Open the live demo →</a>
      </section>

      <footer className="lp-foot" id="waitlist">
        <blockquote>“If your opinion isn&apos;t on-chain with enough trading volume — it&apos;s a piece of shit.”</blockquote>
        <p className="muted">Backed by belief. Built on Arc, Ethereum, World ID &amp; Chainlink.</p>
        <p className="muted">contact@justify.market · evacodes.com</p>
      </footer>
    </div>
  );
}
