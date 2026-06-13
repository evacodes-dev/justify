"use client";

import { useEffect, useState, useCallback } from "react";
import { IDKitRequestWidget, orbLegacy, type RpContext } from "@worldcoin/idkit";

const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "app_MISSING";
const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "rp_MISSING";
const ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "create-market";

export type Approval = {
  id: string; agent: string; owner: string; marketId: number; marketQuestion: string;
  side: "YES" | "NO"; amountUsdc: number; reasoning: string; ts: number;
  status: "pending" | "approved" | "rejected"; tx?: string;
};

// Human-in-the-loop: large agent bets (> threshold) wait here until a human approves
// with a World ID proof (proof-of-human). Approval verifies the proof server-side and
// only then executes the agent's bet on-chain.
export function ApprovalsPanel({ owner, onChange }: { owner?: string; onChange?: () => void }) {
  const [list, setList] = useState<Approval[]>([]);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [pendingId, setPendingId] = useState<string>("");

  const load = useCallback(() => {
    const q = owner ? `?owner=${owner}` : "";
    fetch(`/api/approvals${q}`).then((r) => r.json()).then((b) => setList((b.approvals ?? []).filter((a: Approval) => a.status === "pending"))).catch(() => {});
  }, [owner]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function startApprove(id: string) {
    setBusy(id); setStatus("Fetching World ID challenge — scan with the simulator (simulator.worldcoin.org)…");
    try {
      const rpSig = await fetch("/api/rp-signature", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: ACTION }) }).then((r) => r.json());
      setRpContext({ rp_id: RP_ID, nonce: rpSig.nonce, created_at: rpSig.created_at, expires_at: rpSig.expires_at, signature: rpSig.sig });
      setPendingId(id); setOpen(true);
    } catch (e: any) { setStatus("Error: " + (e?.message || String(e))); setBusy(""); }
  }

  async function reject(id: string) {
    setBusy(id); setStatus("");
    try {
      await fetch(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject" }) });
      setStatus("Rejected — bet not executed."); load(); onChange?.();
    } finally { setBusy(""); }
  }

  if (list.length === 0) return null;

  return (
    <div className="res-block">
      <h3>⏳ Awaiting your approval ({list.length})</h3>
      <p className="muted">These bets exceed the auto-trade threshold. Approve with World ID (proof-of-human) to let the agent execute, or reject.</p>
      {list.map((a) => (
        <div key={a.id} className="post" style={{ marginBottom: 8, borderColor: "#d2992255" }}>
          <div className="post-top" style={{ justifyContent: "space-between" }}>
            <span className="post-agent">{a.agent}</span>
            <span className={`post-bet ${a.side.toLowerCase()}`}>{a.side} ${a.amountUsdc}</span>
          </div>
          <div className="rcard-q" style={{ marginTop: 4 }}>#{a.marketId} {a.marketQuestion}</div>
          <div className="post-reason">{a.reasoning}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn yes" disabled={!!busy} onClick={() => startApprove(a.id)} style={{ flex: "none", padding: "7px 14px" }}>{busy === a.id ? "…" : "Approve with World ID"}</button>
            <button className="btn ghost" disabled={!!busy} onClick={() => reject(a.id)}>Reject</button>
          </div>
        </div>
      ))}
      {status && <pre className="status">{status}</pre>}

      {rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={APP_ID as `app_${string}`}
          action={ACTION}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment="staging"
          preset={orbLegacy({ signal: "" })}
          handleVerify={async (result) => {
            setStatus("Proof received → verifying + executing bet…");
            const res = await fetch(`/api/approvals/${pendingId}`, {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "approve", rp_id: RP_ID, idkitResponse: result }),
            });
            const b = await res.json();
            if (!res.ok) { setStatus("Approve FAILED: " + (b.error ?? JSON.stringify(b))); throw new Error("approve failed"); }
            setStatus(`Approved ✅ bet executed · ${b.txUrl ?? b.tx ?? ""}`);
            setBusy(""); load(); onChange?.();
          }}
          onSuccess={() => { setOpen(false); }}
        />
      )}
    </div>
  );
}
