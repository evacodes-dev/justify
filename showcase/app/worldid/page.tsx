"use client";

import { useState } from "react";
import {
  IDKitRequestWidget,
  orbLegacy,
  type RpContext,
} from "@worldcoin/idkit";

// Test 5 — World ID 4.0 verification via simulator (staging). Action: create-market.
const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "app_MISSING";
const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "rp_MISSING";
const ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "create-market";

export default function WorldIdPage() {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [log, setLog] = useState<string>("");

  async function startVerification() {
    setLog("Fetching RP signature…");
    const rpSig = await fetch("/api/rp-signature", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: ACTION }),
    }).then((r) => r.json());

    setRpContext({
      rp_id: RP_ID,
      nonce: rpSig.nonce,
      created_at: rpSig.created_at,
      expires_at: rpSig.expires_at,
      signature: rpSig.sig,
    });
    setOpen(true);
    setLog("Opening widget — scan with the simulator (simulator.worldcoin.org).");
  }

  return (
    <main style={{ maxWidth: 640, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Test 5 — World ID 4.0 verification</h1>
      <p>App: <code>{APP_ID}</code> · Action: <code>{ACTION}</code> · staging (simulator)</p>

      <button onClick={startVerification} style={{ padding: "10px 18px", fontSize: 16, cursor: "pointer" }}>
        Verify with World ID
      </button>

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
            setLog("Proof received → verifying on backend…");
            const res = await fetch("/api/verify-proof", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ rp_id: RP_ID, idkitResponse: result }),
            });
            const body = await res.json();
            if (!res.ok) {
              setLog("Backend verification FAILED: " + JSON.stringify(body));
              throw new Error("Backend verification failed");
            }
            setLog("VERIFIED ✅ nullifier(s): " + JSON.stringify(body.nullifiers));
          }}
          onSuccess={() => setLog((l) => l + "\nonSuccess fired.")}
        />
      )}

      <pre style={{ marginTop: 24, padding: 12, background: "#f5f5f5", whiteSpace: "pre-wrap" }}>{log}</pre>
    </main>
  );
}
