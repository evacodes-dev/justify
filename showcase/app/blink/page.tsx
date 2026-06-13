"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useBlinkDeposit } from "@swype-org/deposit/react";

// Test 4 — Blink deposit widget targeting the Dynamic embedded wallet address.
// Base USDC by default. Render-only PARTIAL: modal opens; a real transfer needs
// an approved merchantId + real funds (Blink is mainnet-only, no sandbox).
const BASE_CHAIN_ID = 8453;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export default function BlinkPage() {
  const { primaryWallet } = useDynamicContext();
  const { status, result, error, displayMessage, requestDeposit } = useBlinkDeposit({
    signer: "/api/sign-payment",
  });

  const target = primaryWallet?.address;

  return (
    <main style={{ maxWidth: 640, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Test 4 — Blink deposit widget</h1>
      <p>Target = your Dynamic embedded wallet. Log in on the{" "}
        <a href="/">home page</a> first so an address exists.</p>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, background: "#fafafa", marginBottom: 16 }}>
        <div style={{ wordBreak: "break-all" }}><strong>Destination:</strong> {target ?? "— log in first —"}</div>
        <div><strong>Chain:</strong> Base ({BASE_CHAIN_ID}) · <strong>Token:</strong> USDC</div>
      </div>

      <button
        onClick={() =>
          requestDeposit({ amount: 50, chainId: BASE_CHAIN_ID, address: target!, token: USDC_BASE })
        }
        disabled={!target || status === "signer-loading"}
        style={{ padding: "10px 18px", fontSize: 16, cursor: "pointer" }}
      >
        {status === "signer-loading" ? "Preparing…" : "Deposit $50 (open Blink)"}
      </button>

      <div style={{ marginTop: 16 }}>
        <div><strong>Status:</strong> {status}</div>
        {error && <p style={{ color: "crimson" }}>Error: {displayMessage}</p>}
        {result && <p style={{ color: "green" }}>Transfer {result.transfer.id} — {result.transfer.status}</p>}
      </div>
    </main>
  );
}
