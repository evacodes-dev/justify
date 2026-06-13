"use client";

import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import "../showcase/showcase.css";
import { Nav } from "../showcase/nav";
import { ReasoningCard, type Post } from "../showcase/live";
import { ApprovalsPanel } from "./approvals";
import { BridgeDeposit } from "./bridge";
import { ARC } from "../showcase/demo-markets";
import { usdcBalance, sendUsdc } from "../../lib/arc";

const PRESETS = ["Value Hunter", "News Sniper", "Contrarian"];
type Agent = { id: string; name: string; ens?: string; address: string; preset: string; erc8004Id?: string; record?: { w: number; l: number } };

export default function AgentsPage() {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("Contrarian");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [feed, setFeed] = useState<Post[]>([]);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [bal, setBal] = useState<Record<string, number>>({});
  const { primaryWallet } = useDynamicContext();

  const loadAgents = () => fetch("/api/agents").then((r) => r.json()).then((b) => { const a = b.agents ?? []; setAgents(a); loadBalances(a); }).catch(() => {});
  const loadFeed = () => fetch("/api/agent/tick").then((r) => r.json()).then((b) => setFeed(b.feed ?? [])).catch(() => {});
  const loadBalances = (list: Agent[]) => list.forEach((a) => usdcBalance(a.address as `0x${string}`).then((v) => setBal((m) => ({ ...m, [a.address]: v }))).catch(() => {}));
  useEffect(() => { loadAgents(); loadFeed(); const t = setInterval(loadFeed, 8000); return () => clearInterval(t); }, []);

  async function fundAgent(addr: string) {
    if (!primaryWallet) { alert("Log in to fund"); return; }
    setBusy("fund" + addr); setStatus("Sending 0.3 USDC from your wallet to the agent…");
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("no wallet");
      await primaryWallet.switchNetwork(ARC.chainId);
      const wc = await primaryWallet.getWalletClient();
      const tx = await sendUsdc(wc, addr as `0x${string}`, 0.3);
      setStatus(`Funded agent with 0.3 USDC · tx ${tx.slice(0, 12)}…`);
      usdcBalance(addr as `0x${string}`).then((v) => setBal((m) => ({ ...m, [addr]: v })));
    } catch (e: any) { setStatus(e?.shortMessage || e?.message || String(e)); }
    finally { setBusy(""); }
  }

  async function createAgent() {
    setBusy("create"); setStatus("Generating wallet → funding → minting ENS…");
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, preset, owner: primaryWallet?.address }) });
      const b = await res.json();
      if (!res.ok) setStatus("Error: " + (b.error ?? JSON.stringify(b)));
      else { setStatus(`Created ${b.agent.ens ?? b.agent.name} · wallet ${b.agent.address.slice(0, 10)}… · funded ✓`); setName(""); loadAgents(); }
    } finally { setBusy(""); }
  }

  async function registerErc8004(id: string) {
    setBusy("8004" + id); setStatus("Registering agent on ERC-8004 Identity Registry (mainnet) — one on-chain tx…");
    try {
      const res = await fetch("/api/erc8004/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: id }) });
      const b = await res.json();
      if (!res.ok) setStatus("Error: " + (b.error ?? JSON.stringify(b)));
      else setStatus(`ERC-8004 identity #${b.erc8004Id} minted${b.ensTx ? " · ENS bound" : ""} · ${b.txUrl ?? b.token ?? ""}`);
      loadAgents();
    } finally { setBusy(""); }
  }

  async function runAgent(id: string) {
    setBusy(id); setStatus("Agent thinking…");
    try {
      const res = await fetch("/api/agent/tick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: id }) });
      const b = await res.json();
      setStatus(b.action === "bet" ? `Bet ${b.side} $${b.amountUsdc} on #${b.marketId}` : ("Skipped: " + (b.reasoning ?? "").slice(0, 80)));
      loadFeed();
    } finally { setBusy(""); }
  }

  return (
    <div className="wrap">
      <Nav active="/agents" />
      <div className="detail">
        <h1>AI Agents</h1>
        <p className="muted">Create an autonomous agent — it gets its own wallet, an ENS identity, and a strategy, and trades real markets on Arc via Claude. It starts with a small faucet stake; <b>top it up from your own wallet with “Fund”</b> so it trades the budget you give it.</p>

        <div className="res-block">
          <h3>Create an agent</h3>
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
            <input className="input" placeholder="agentname" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} style={{ flex: 1 }} />
            <span className="muted">-bot.jstfy-demo.eth</span>
          </div>
          <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)} style={{ margin: "8px 0" }}>
            {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn create wide" disabled={busy === "create" || !name} onClick={createAgent}>
            {busy === "create" ? "Creating…" : "Create agent (wallet + ENS + fund)"}
          </button>
          {status && <pre className="status">{status}</pre>}
        </div>

        {agents.length > 0 && (
          <BridgeDeposit
            destinations={agents.map((a) => ({ label: `${a.ens ?? a.name} · ${a.address.slice(0, 10)}…`, address: a.address }))}
            onDone={() => loadAgents()}
          />
        )}

        <ApprovalsPanel owner={primaryWallet?.address} onChange={loadFeed} />

        <div className="res-block">
          <h3>Your agents ({agents.length})</h3>
          {agents.length === 0 && <p className="muted">None yet — create one above.</p>}
          {agents.map((a) => (
            <div key={a.id} className="post" style={{ marginBottom: 8 }}>
              <div className="post-top" style={{ justifyContent: "space-between" }}>
                <span className="post-agent">{a.ens ?? `${a.name}-bot.jstfy-demo.eth`} ✓</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn ghost" disabled={busy === "fund" + a.address} onClick={() => fundAgent(a.address)}>{busy === "fund" + a.address ? "Funding…" : "Fund +0.3"}</button>
                  {a.erc8004Id
                    ? <a className="identity-badge" href={`https://etherscan.io/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=${a.erc8004Id}`} target="_blank" rel="noreferrer" title="ERC-8004 on-chain identity">⬡ ERC-8004 #{a.erc8004Id}</a>
                    : <button className="btn ghost" disabled={busy === "8004" + a.id} onClick={() => registerErc8004(a.id)}>{busy === "8004" + a.id ? "Registering…" : "Register ERC-8004"}</button>}
                  <button className="btn create" disabled={!!busy} onClick={() => runAgent(a.id)}>{busy === a.id ? "Thinking…" : "Run (real bet)"}</button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                strategy: {a.preset} · wallet {a.address.slice(0, 12)}… · <b style={{ color: "#3fb950" }}>balance ${(bal[a.address] ?? 0).toFixed(2)} USDC</b>
                {a.erc8004Id && <> · <span style={{ color: "#a371f7" }}>on-chain agent #{a.erc8004Id}</span></>}
                {a.record && (a.record.w + a.record.l) > 0 && <> · <span style={{ color: "#d29922" }} title="learns from resolved bets (reflexion)">📈 {a.record.w}W/{a.record.l}L</span></>}
              </div>
            </div>
          ))}
        </div>

        <div className="res-block">
          <h3>Activity</h3>
          <div className="posts">
            {feed.length === 0 && <div className="muted">No activity yet.</div>}
            {feed.map((p) => <ReasoningCard key={p.ts} p={p} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
