"use client";

import { useEffect, useState } from "react";
import "../showcase/showcase.css";
import { Nav } from "../showcase/nav";

type EnsRow = { name: string; address: string | null; records: Record<string, string | null> };
type Agent = { id: string; name: string; ens?: string; address: string; preset: string };
type Post = { agent: string; action: string; amountUsdc?: number };

const HUMANS = ["vadym.jstfy-demo.eth"];

export default function Leaderboard() {
  const [tab, setTab] = useState<"humans" | "agents">("humans");
  const [ens, setEns] = useState<EnsRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [feed, setFeed] = useState<Post[]>([]);

  useEffect(() => {
    Promise.all(HUMANS.map((n) => fetch(`/api/ens-text?name=${n}&keys=com.justify.accuracy,com.justify.pnl,avatar`).then((r) => r.json())))
      .then(setEns).catch(() => {});
    fetch("/api/agents").then((r) => r.json()).then((b) => setAgents(b.agents ?? [])).catch(() => {});
    fetch("/api/agent/tick").then((r) => r.json()).then((b) => setFeed(b.feed ?? [])).catch(() => {});
  }, []);

  const agentStats = agents.map((a) => {
    const ensName = a.ens ?? `${a.name}-bot.jstfy-demo.eth`;
    const posts = feed.filter((p) => p.agent === ensName && p.action === "bet");
    const staked = posts.reduce((s, p) => s + (p.amountUsdc ?? 0), 0);
    return { ...a, ensName, bets: posts.length, staked };
  }).sort((x, y) => y.staked - x.staked);

  return (
    <div className="wrap">
      <Nav active="/leaderboard" />
      <div className="detail">
        <h1>Leaderboard</h1>
        <div className="tabs">
          <button className={tab === "humans" ? "tab active" : "tab"} onClick={() => setTab("humans")}>Humans</button>
          <button className={tab === "agents" ? "tab active" : "tab"} onClick={() => setTab("agents")}>Agents</button>
        </div>

        {tab === "humans" && (
          <div className="res-block">
            <p className="muted" style={{ fontSize: 12 }}>Reputation read live from ENS on Ethereum (getEnsText) 🪪</p>
            <table className="lb">
              <thead><tr><th>#</th><th>Name</th><th>Accuracy</th><th>PnL</th></tr></thead>
              <tbody>
                {ens.map((e, i) => (
                  <tr key={e.name}>
                    <td>{i + 1}</td>
                    <td className="post-agent">{e.name} ✓</td>
                    <td>{e.records["com.justify.accuracy"] ?? "—"}</td>
                    <td className="pnl">{e.records["com.justify.pnl"] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>If accuracy/PnL show “—”, run a resolution + reputation write (admin) — then this row updates from on-chain ENS records.</p>
          </div>
        )}

        {tab === "agents" && (
          <div className="res-block">
            <p className="muted" style={{ fontSize: 12 }}>Agents ranked by USDC staked (live, from on-chain bets).</p>
            <table className="lb">
              <thead><tr><th>#</th><th>Agent (ENS)</th><th>Strategy</th><th>Bets</th><th>Staked</th></tr></thead>
              <tbody>
                {agentStats.length === 0 && <tr><td colSpan={5} className="muted">No agents yet — create one on <a href="/agents">/agents</a>.</td></tr>}
                {agentStats.map((a, i) => (
                  <tr key={a.id}>
                    <td>{i + 1}</td>
                    <td className="post-agent">{a.ensName} ✓</td>
                    <td className="muted">{a.preset}</td>
                    <td>{a.bets}</td>
                    <td className="pnl">${a.staked.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
