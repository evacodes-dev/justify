"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { NetCfg } from "../../lib/networks";
import { usdcAbi, tokenMessengerV2Abi, addrToBytes32, usdc6, viemChain, FINALITY_STANDARD, ZERO_BYTES32 } from "../../lib/cctp";

// Deposit USDC from Base into an agent's Arc wallet via Circle CCTP V2
// (burn on Base → Iris attestation → mint on Arc). All addresses come from
// /api/bridge/config so flipping NETWORK on the server flips this too.
type Dest = { label: string; address: string };

export function BridgeDeposit({ destinations, onDone }: { destinations: Dest[]; onDone?: () => void }) {
  const { primaryWallet } = useDynamicContext();
  const [net, setNet] = useState<NetCfg | null>(null);
  const [amount, setAmount] = useState("1");
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const log = (s: string) => setSteps((l) => [...l, s]);

  useEffect(() => { fetch("/api/bridge/config").then((r) => r.json()).then(setNet).catch(() => {}); }, []);
  useEffect(() => { if (!dest && destinations[0]) setDest(destinations[0].address); }, [destinations, dest]);

  async function bridge() {
    if (!net || !primaryWallet) { alert("Log in first"); return; }
    if (!isEthereumWallet(primaryWallet)) { alert("EVM wallet required"); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(dest)) { alert("pick a destination"); return; }
    setBusy(true); setSteps([]);
    try {
      const amt = usdc6(Number(amount));
      const basePub = createPublicClient({ chain: viemChain(net.base), transport: http(net.base.rpc) });

      // 1. switch to Base + get wallet client
      log(`Switching wallet to ${net.base.name}…`);
      await primaryWallet.switchNetwork(net.base.chainId);
      const wc = await primaryWallet.getWalletClient();
      const account = wc.account;

      // 2. approve USDC → TokenMessengerV2 (skip if allowance enough)
      const allowance = (await basePub.readContract({ address: net.base.usdc, abi: usdcAbi, functionName: "allowance", args: [account.address, net.base.tokenMessengerV2] })) as bigint;
      if (allowance < amt) {
        log("Approving USDC…");
        const ah = await wc.writeContract({ address: net.base.usdc, abi: usdcAbi, functionName: "approve", args: [net.base.tokenMessengerV2, amt], chain: viemChain(net.base), account });
        await basePub.waitForTransactionReceipt({ hash: ah });
      }

      // 3. depositForBurn on Base → DEST domain = Arc (26)
      log("Burning on Base (depositForBurn)…");
      const burnTx = await wc.writeContract({
        address: net.base.tokenMessengerV2, abi: tokenMessengerV2Abi, functionName: "depositForBurn",
        args: [amt, net.arc.domain, addrToBytes32(dest), net.base.usdc, ZERO_BYTES32, BigInt(0), FINALITY_STANDARD],
        chain: viemChain(net.base), account,
      });
      await basePub.waitForTransactionReceipt({ hash: burnTx });
      log(`Burned ✅ ${net.base.explorer}/tx/${burnTx}`);

      // 4. poll Iris for attestation
      log("Waiting for Circle attestation (Iris)…");
      let att: any = { status: "pending" };
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        att = await fetch("/api/bridge/attest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: burnTx, sourceDomain: net.base.domain }) }).then((r) => r.json());
        if (att.status === "complete" && att.message && att.attestation) break;
        if (i % 3 === 0) log(`  …attestation ${att.status} (${(i + 1) * 4}s)`);
      }
      if (att.status !== "complete") { log("Attestation not ready — retry the relay later."); return; }
      log("Attestation ready ✅");

      // 5. relay receiveMessage on Arc (server pays gas) → mint
      log("Minting on Arc (receiveMessage)…");
      const relay = await fetch("/api/bridge/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: att.message, attestation: att.attestation }) }).then((r) => r.json());
      if (relay.error) { log("Relay error: " + relay.error); return; }
      log(`Minted on Arc ✅ ${relay.txUrl}`);
      onDone?.();
    } catch (e: any) {
      log("Error: " + (e?.shortMessage || e?.message || String(e)));
    } finally { setBusy(false); }
  }

  if (!net) return null;
  return (
    <div className="res-block">
      <h3>🌉 Deposit from Base → Arc (Circle CCTP V2)</h3>
      <p className="muted">
        Real cross-chain USDC: burn on <b>{net.base.name}</b> → Circle attestation → mint on <b>{net.arc.name}</b>.
        Profile: <code>{net.profile}</code>. You need USDC + gas on {net.base.name} in your wallet.
      </p>
      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} style={{ width: 90 }} />
        <span className="muted">USDC →</span>
        <select className="input" value={dest} onChange={(e) => setDest(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          {destinations.map((d) => <option key={d.address} value={d.address}>{d.label}</option>)}
        </select>
        <button className="btn create" disabled={busy} onClick={bridge}>{busy ? "Bridging…" : "Bridge USDC"}</button>
      </div>
      {steps.length > 0 && <pre className="status">{steps.join("\n")}</pre>}
    </div>
  );
}
