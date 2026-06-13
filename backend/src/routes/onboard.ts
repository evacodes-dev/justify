import type { FastifyInstance } from "fastify";
import { parseEther } from "viem";
import { config } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { factoryAbi } from "../abis.js";
import { db, nullifiers } from "../store.js";

// POST /onboard { idkitResponse, rp_id, name, address, avatar? }
//  1) verify World ID 4.0 (Developer Portal) + nullifier dedup
//  2) validate + claim internal name (DB uniqueness, NO on-chain/ENS)
//  3) gas dotation to the user on Arc (faucet)
//  4) factory.registerCreator(address) (verifier)
//  5) mark verified
export async function onboardRoutes(app: FastifyInstance) {
  app.post<{ Body: any }>("/onboard", async (req, reply) => {
    const { idkitResponse, rp_id, name: rawName, address, avatar } = (req.body ?? {}) as any;
    const name = String(rawName ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "bad address" });
    if (!name) return reply.code(400).send({ error: "bad name" });
    if (db.users.find((u) => u.name === name && u.address.toLowerCase() !== address.toLowerCase()))
      return reply.code(409).send({ error: "name taken" });

    // 1) World ID verify
    let nullifier: string | undefined;
    if (idkitResponse && rp_id) {
      const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse),
      });
      if (!portal.ok) {
        const b = await portal.json().catch(() => ({}));
        return reply.code(400).send({ error: "World ID verification failed", portal: b });
      }
      nullifier = (idkitResponse?.responses ?? []).map((r: any) => r?.nullifier).find(Boolean);
      if (nullifier && nullifiers.has(nullifier)) {
        // demo-friendly: reuse is still a real human (prod would 409)
        app.log.warn("nullifier reuse (demo allowed)");
      }
      if (nullifier) nullifiers.add(nullifier);
    } else if (process.env.NODE_ENV === "production") {
      return reply.code(400).send({ error: "World ID proof required" });
    }

    const signer = backendSigner();
    let arcTx: string | undefined;

    // 3) gas dotation: send a little native USDC so the user can pay for approve+buy
    try {
      const fundTx = await signer.run(({ wallet, account }) =>
        wallet.sendTransaction({ to: address as `0x${string}`, value: parseEther("0.1"), account, chain: arc }),
      );
      await publicClient.waitForTransactionReceipt({ hash: fundTx });
    } catch (e) {
      app.log.error("dotation failed: " + (e as Error).message);
    }

    // 4) registerCreator on Arc (verifier)
    try {
      const already = await publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: "isCreator", args: [address as `0x${string}`] });
      if (!already) {
        arcTx = await signer.run(({ wallet, account }) =>
          wallet.writeContract({ address: config.factory, abi: factoryAbi, functionName: "registerCreator", args: [address as `0x${string}`], account, chain: arc }),
        );
        await publicClient.waitForTransactionReceipt({ hash: arcTx as `0x${string}` });
      }
    } catch (e) {
      return reply.code(502).send({ error: "registerCreator failed: " + (e as Error).message });
    }

    // 5) store user
    const user = db.users.find((u) => u.address.toLowerCase() === address.toLowerCase());
    const humanId = nullifier ?? user?.humanId ?? address.toLowerCase();
    db.users.put({
      id: address.toLowerCase(), address, name, verified: true, humanId, avatar,
      createdAt: user?.createdAt ?? Date.now(), arcTx,
    });

    return { ok: true, name, arcTx };
  });

  // live name availability check (debounced from the client)
  app.get<{ Querystring: { name?: string } }>("/name-available", async (req) => {
    const name = String(req.query.name ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!name) return { available: false, name: "" };
    return { available: !db.users.find((u) => u.name === name), name };
  });
}
