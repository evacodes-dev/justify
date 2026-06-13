"use client";

import { useCallback, useEffect, useState } from "react";
import { useDynamicContext, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import "../showcase/showcase.css";
import { Nav } from "../showcase/nav";
import { DEMO_MARKETS, ARC } from "../showcase/demo-markets";
import { readPosition, claimMarket, txUrl } from "../../lib/arc";

type Pos = Awaited<ReturnType<typeof readPosition>> & { id: number; question: string; address: `0x${string}` };

export default function Portfolio() {
  const { primaryWallet } = useDynamicContext();
  const [rows, setRows] = useState<Pos[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const addr = primaryWallet?.address as `0x${string}` | undefined;

  const refresh = useCallback(() => {
    if (!addr) { setRows([]); return; }
    Promise.all(DEMO_MARKETS.map(async (m) => ({ id: m.id, question: m.question, address: m.address, ...(await readPosition(m.address, addr)) })))
      .then((r) => setRows(r.filter((x) => x.stakeYes > 0 || x.stakeNo > 0))).catch(() => {});
  }, [addr]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);

  async function claim(m: Pos) {
    setBusy(m.address); setMsg("");
    try {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error("no wallet");
      await primaryWallet.switchNetwork(ARC.chainId);
      const wc = await primaryWallet.getWalletClient();
      const tx = await claimMarket(wc, m.address);
      setMsg(`Claimed! tx ${tx.slice(0, 14)}…`); refresh();
    } catch (e: any) { setMsg(e?.shortMessage || e?.message || String(e)); }
    finally { setBusy(""); }
  }

  return (
    <div className="wrap">
      <Nav active="/portfolio" right={<DynamicWidget />} />
      <div className="detail">
        <h1>Portfolio</h1>
        {!addr && <p className="muted">Log in to see your positions.</p>}
        {addr && rows.length === 0 && <p className="muted">No positions yet — go bet on the <a href="/showcase">live markets</a>.</p>}

        {rows.map((m) => {
          const won = m.resolved && ((m.outcome === 1 && m.stakeYes > 0) || (m.outcome === 0 && m.stakeNo > 0));
          return (
            <div key={m.address} className="res-block">
              <div className="post-top" style={{ justifyContent: "space-between" }}>
                <strong>{m.question}</strong>
                <a className="muted" href={`/market/${m.id}`}>#{m.id}</a>
              </div>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className="muted">YES ${m.stakeYes.toFixed(2)} · NO ${m.stakeNo.toFixed(2)}</span>
                {m.resolved
                  ? <span className={`post-bet ${won ? "yes" : "no"}`}>{won ? `WON → claim $${m.payout.toFixed(2)}` : "lost"}</span>
                  : <span className="post-skip">open</span>}
              </div>
              {m.resolved && won && (
                <button className="btn create" style={{ marginTop: 10 }} disabled={busy === m.address} onClick={() => claim(m)}>
                  {busy === m.address ? "Claiming…" : `Claim $${m.payout.toFixed(2)}`}
                </button>
              )}
            </div>
          );
        })}
        {msg && <pre className="status">{msg}</pre>}
      </div>
    </div>
  );
}
