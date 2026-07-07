import type { FastifyInstance } from "fastify";
import { parseEther } from "viem";
import { config, fromUsdc, toUsdc, txUrl } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { factoryAbi, erc20Abi, registryAbi } from "../abis.js";
import { db, kv, type AgentRow, type FeedItem, type Approval } from "../store.js";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { createAgentInternal } from "./agents.js";
import { tickAgent, executeBuy } from "../agent-loop.js";
import { hasFeed, readChainlinkPrice } from "../chainlink.js";

// Compatibility layer: serves the `/api/*` contract the SPA front-end already codes
// against (showcase shapes), backed by the REAL FPMM contracts + agent loop. Lets the
// front-end point at this backend with no changes to its api.ts.

const sideOf = (o?: number) => (o === 1 ? "YES" : o === 0 ? "NO" : undefined);

// ─── price-history (market chart) ───
// Window length per toggle; ALL has no window (whole life of the market).
const RANGE_MS: Record<string, number> = {
  "1H": 3_600e3, "6H": 6 * 3_600e3, "1D": 86_400e3, "1W": 7 * 86_400e3, "1M": 30 * 86_400e3,
};
const MAX_POINTS = 120; // keep the canvas series light

// Uniformly sample down to `max` points, always keeping the first and last.
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

// a bot is world-visible unless explicitly a draft (public === false)
const isPublicAgent = (a: AgentRow) => a.public !== false;

function toPublicAgent(a: AgentRow) {
  return {
    id: a.id, name: a.name, address: a.address, strategy: a.strategy, preset: a.preset,
    owner: a.ownerAddress, humanId: a.ownerHumanId, humanBacked: a.humanBacked,
    record: { w: a.wins, l: a.losses }, budgetUsdc: a.budgetUsdc, spentUsdc: a.spentUsdc, active: a.active,
    public: isPublicAgent(a),
  };
}

function toFeedPost(f: FeedItem) {
  const action = f.tx && f.amountUsdc ? "bet" : f.status === "awaiting" ? "request_approval" : f.kind === "agent" && f.amountUsdc ? "request_approval" : "skip";
  return {
    ts: f.ts, agent: f.agentName ?? f.user ?? "", action,
    marketId: f.marketId, marketQuestion: f.marketQuestion, side: sideOf(f.outcome),
    amountUsdc: f.amountUsdc, confidence: f.confidence, impliedProb: f.impliedProb, estProb: f.estProb, edge: f.edge,
    reasoning: f.reasoning,
    dataUsed: (f.dataUsed ?? []).map((d: any) => (typeof d === "string" ? { label: d, value: "", source: "" } : d)),
    humanBacked: f.humanBacked, tx: f.tx, status: f.status,
  };
}

function toApproval(a: Approval) {
  return {
    id: a.id, agentId: a.agentId, agent: a.agentName, owner: a.ownerAddress, marketId: a.marketId,
    marketQuestion: a.marketQuestion, side: sideOf(a.outcome), amountUsdc: a.amountUsdc, reasoning: a.reasoning,
    ts: a.ts, status: a.status, tx: a.tx,
  };
}

export async function compatRoutes(app: FastifyInstance) {
  // real form-submitter per market (on-chain creator is always the backend signer)
  const submitters = (): Record<string, string> => kv.get("submitters", {});
  const creatorNameOf = (id: number, chainCreator: string): string => {
    const addr = submitters()[String(id)] ?? chainCreator;
    const u = db.users.find((x) => x.address.toLowerCase() === addr.toLowerCase());
    return u?.name ?? "justify";
  };

  // markets for the on-chain layer (FPMM addresses + live price)
  app.get("/api/markets", async () => ({
    markets: db.markets.all().sort((a, b) => b.createdAt - a.createdAt).map((m) => ({
      id: m.id, address: m.address, question: m.question, metadataURI: m.metadataURI,
      priceYes: m.priceYes, volume: m.volume, resolved: m.resolved, outcome: m.outcome, closeTime: m.closeTime, oracle: m.oracle,
      creator: m.creator, creatorName: creatorNameOf(m.id, m.creator),
    })),
  }));

  // price history for the market chart — derived from indexed Buy trades.
  // Series = seed (0.5 @ creation) → each trade's priceYesAfter → tail (current price,
  // or the resolution outcome). FPMM price only moves on a buy, so the flat segment
  // from the last trade to "now" is correct. Downsampled to MAX_POINTS for the canvas.
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>("/api/markets/:id/history", async (req, reply) => {
    const m = db.markets.get(Number(req.params.id));
    if (!m) return reply.code(404).send({ error: "not found" });
    const now = Date.now();

    const trades = db.trades
      .filter((t) => t.marketId === m.id)
      .map((t) => ({ t: t.blockTs ?? t.ts, p: t.priceYesAfter }))
      .sort((a, b) => a.t - b.t);

    const tailP = m.resolved ? (m.outcome === 1 ? 1 : m.outcome === 0 ? 0 : m.priceYes) : m.priceYes;
    // Anchor the 0.5 seed at the market's creation — but never later than its first
    // trade. `createdAt` is the indexer's discovery time, which for seed markets
    // (created before deployBlock) can post-date their trades; clamping keeps the
    // series strictly time-ordered so the chart's x-axis doesn't run backwards.
    const seedT = Math.min(m.createdAt, trades.length ? trades[0].t : now);
    const full = [{ t: seedT, p: 0.5 }, ...trades, { t: now, p: tailP }];

    // window by range; keep one anchor just before the window so the line enters
    // the chart from the left edge instead of starting mid-canvas.
    const range = String(req.query.range ?? "ALL").toUpperCase();
    const span = RANGE_MS[range];
    let pts = full;
    if (span) {
      const from = now - span;
      const inside = full.filter((pt) => pt.t >= from);
      const anchor = full.filter((pt) => pt.t < from).pop();
      pts = anchor ? [{ p: anchor.p, t: from }, ...inside] : inside.length ? inside : [full[full.length - 1]];
    }

    // `trades` is the real trade count (seed/tail excluded) so the UI can show an
    // empty state instead of a meaningless flat line for a market no one has traded.
    return { id: m.id, range, current: tailP, resolved: m.resolved, trades: trades.length, points: downsample(pts, MAX_POINTS) };
  });

  // gas dotation (BE11): top up an embedded wallet's NATIVE balance so it can pay gas.
  // Network-aware via config (Arc native = USDC; Base native = ETH → tiny drip).
  app.post<{ Body: any }>("/api/dotation", async (req, reply) => {
    const { address } = (req.body ?? {}) as any;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "bad address" });
    const balWei = (await publicClient.getBalance({ address: address as `0x${string}` })) as bigint;
    const bal = Number(balWei) / 1e18;
    if (bal >= config.gasDripThreshold) return { skipped: true, balance: bal, token: config.nativeCurrency.symbol };
    const hash = await backendSigner().run(({ wallet, account }) =>
      wallet.sendTransaction({ to: address as `0x${string}`, value: parseEther(String(config.gasDripAmount)), account, chain: arc }),
    );
    await publicClient.waitForTransactionReceipt({ hash });
    return { funded: true, hash, amount: config.gasDripAmount, balance: bal + config.gasDripAmount, token: config.nativeCurrency.symbol };
  });

  // World ID 4.0 RP signature for the IDKit widget (RP_SIGNING_KEY stays server-side)
  app.post<{ Body: any }>("/api/rp-signature", async (req, reply) => {
    const { action } = (req.body ?? {}) as any;
    if (!process.env.RP_SIGNING_KEY) return reply.code(501).send({ error: "RP_SIGNING_KEY not set" });
    const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: process.env.RP_SIGNING_KEY, action });
    return { sig, nonce, created_at: createdAt, expires_at: expiresAt };
  });

  // World ID gate: verify + (on success) dotation + registerCreator + mark verified
  app.get<{ Querystring: { address?: string } }>("/api/verify-proof", async (req) => {
    const addr = String(req.query.address ?? "").toLowerCase();
    const u = db.users.find((x) => x.address.toLowerCase() === addr);
    return { verified: !!u?.verified };
  });
  app.post<{ Body: any }>("/api/verify-proof", async (req, reply) => {
    const { rp_id, idkitResponse, walletAddress, name, country } = (req.body ?? {}) as any;
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress ?? "")) return reply.code(400).send({ error: "bad walletAddress" });
    // dev bypass (no proof) is allowed unless ALLOW_DEV_VERIFY=false — flip that env to require real World ID
    if (!idkitResponse && process.env.ALLOW_DEV_VERIFY === "false")
      return reply.code(400).send({ error: "World ID proof required (dev bypass disabled)" });
    let nullifier: string | undefined;
    if (idkitResponse && rp_id) {
      const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse),
      });
      if (!portal.ok) return reply.code(400).send({ error: "World ID verification failed", portal: await portal.json().catch(() => ({})) });
      nullifier = (idkitResponse?.responses ?? []).map((r: any) => r?.nullifier).find(Boolean);
    }
    // dotation + registerCreator (best-effort, idempotent)
    let arcTx: string | undefined;
    try {
      const bal = fromUsdc((await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [walletAddress] })) as bigint);
      if (bal < 0.1) {
        const fundTx = await backendSigner().run(({ wallet, account }) => wallet.sendTransaction({ to: walletAddress, value: parseEther("0.2"), account, chain: arc }));
        await publicClient.waitForTransactionReceipt({ hash: fundTx });
      }
      const already = await publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: "isCreator", args: [walletAddress] });
      if (!already) {
        arcTx = await backendSigner().run(({ wallet, account }) => wallet.writeContract({ address: config.factory, abi: factoryAbi, functionName: "registerCreator", args: [walletAddress], account, chain: arc }));
        await publicClient.waitForTransactionReceipt({ hash: arcTx as `0x${string}` });
      }
    } catch (e) { app.log.error("verify post-actions: " + (e as Error).message); }

    const existing = db.users.find((u) => u.address.toLowerCase() === walletAddress.toLowerCase());
    db.users.put({
      id: walletAddress.toLowerCase(), address: walletAddress,
      name: (name ? String(name).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) : "") || existing?.name || walletAddress.slice(0, 8).toLowerCase(),
      verified: true, humanId: nullifier ?? existing?.humanId ?? walletAddress.toLowerCase(),
      country: (country ? normCountry(country) : existing?.country),
      createdAt: existing?.createdAt ?? Date.now(), arcTx,
    });
    return { success: true, alreadyVerified: !!existing?.verified };
  });

  // Country codes may arrive as ISO alpha-2 (UI dropdown: "US") or alpha-3 ("USA").
  // Canonicalize everything to alpha-2 so the gate matches regardless of source.
  const ALPHA3: Record<string, string> = {
    USA: "US", GBR: "GB", DEU: "DE", FRA: "FR", ITA: "IT", ESP: "ES",
    UKR: "UA", RUS: "RU", IND: "IN", BRA: "BR", CHN: "CN", JPN: "JP",
  };
  const normCountry = (c?: string | null): string => {
    const s = String(c ?? "").toUpperCase();
    return ALPHA3[s] ?? s.slice(0, 2);
  };

  // parse a market's flexible metadata (countries + restriction)
  const marketMeta = (m: { metadataURI?: string }): { restricted: boolean; countries: string[] } => {
    try { const j = JSON.parse(m.metadataURI || "{}"); return { restricted: !!j.restricted, countries: Array.isArray(j.countries) ? j.countries : [] }; }
    catch { return { restricted: false, countries: [] }; }
  };

  // country gate: can the connected user bet on this market?
  app.get<{ Params: { id: string }; Querystring: { address?: string } }>("/api/can-bet/:id", async (req) => {
    const m = db.markets.get(Number(req.params.id));
    if (!m) return { allowed: false, reason: "market not found" };
    const meta = marketMeta(m);
    if (!meta.restricted || meta.countries.length === 0) return { allowed: true, restricted: false };
    const u = db.users.find((x) => x.address.toLowerCase() === String(req.query.address ?? "").toLowerCase());
    const country = u?.country;
    const userNorm = normCountry(country);
    const allowed = !!country && meta.countries.map(normCountry).includes(userNorm);
    return { allowed, restricted: true, countries: meta.countries, userCountry: country ?? null, reason: allowed ? "" : (country ? `Restricted market — your country (${country}) is not eligible.` : "Set your country in Settings to bet on country-restricted markets.") };
  });

  // live Chainlink Data Feed price for an asset — verifiable on Etherscan
  app.get<{ Params: { asset: string } }>("/api/chainlink/:asset", async (req, reply) => {
    const asset = String(req.params.asset).toUpperCase();
    if (!hasFeed(asset)) return reply.code(404).send({ error: "no feed" });
    const p = await readChainlinkPrice(asset).catch(() => null);
    if (!p) return reply.code(502).send({ error: "feed read failed" });
    return { asset, price: p.price, feed: p.feed, updatedAt: p.updatedAt, network: "Ethereum Sepolia", explorer: `https://sepolia.etherscan.io/address/${p.feed}#readContract` };
  });

  // creators (real users) for the feed / people lists
  app.get("/api/creators", async () => {
    const users = db.users.all();
    return {
      creators: users.map((u) => ({
        id: u.address.toLowerCase(), name: u.name, handle: "@" + u.name, address: u.address,
        avatar: u.avatar || "/img/images.jpeg", bio: u.bio || "", verified: u.verified,
        markets: Object.values(submitters()).filter((a) => a.toLowerCase() === u.address.toLowerCase()).length,
      })),
    };
  });

  // public profile of any user (by name or address) + the markets they created
  app.get<{ Params: { key: string } }>("/api/user/:key", async (req, reply) => {
    const key = String(req.params.key ?? "").toLowerCase();
    const u = db.users.find((x) => x.name.toLowerCase() === key || x.address.toLowerCase() === key);
    if (!u) return reply.code(404).send({ error: "not found" });
    const subs = submitters();
    const myIds = Object.entries(subs).filter(([, a]) => a.toLowerCase() === u.address.toLowerCase()).map(([id]) => Number(id));
    const markets = db.markets.all().filter((m) => myIds.includes(m.id)).map((m) => ({ id: m.id, question: m.question, priceYes: m.priceYes, volume: m.volume, resolved: m.resolved }));
    return {
      user: { name: u.name, address: u.address, bio: u.bio ?? "", avatar: u.avatar || "/img/images.jpeg", verified: u.verified, country: u.country ?? null, createdAt: u.createdAt },
      markets,
    };
  });

  // BE8 — dual URL resolve: /<founder|address>/<market_name|market_address|id> → canonical market.
  // `owner` matches a creator by name or address; `market` matches by id, contract address,
  // or a slug of the question. Powers justify.market/<founder>/<market> links.
  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  app.get<{ Params: { owner: string; market: string } }>("/api/resolve/:owner/:market", async (req, reply) => {
    const ownerKey = String(req.params.owner ?? "").toLowerCase();
    const u = db.users.find((x) => x.name.toLowerCase() === ownerKey || x.address.toLowerCase() === ownerKey);
    const mk = String(req.params.market ?? "");
    let m =
      /^\d+$/.test(mk)
        ? db.markets.get(Number(mk))
        : /^0x[a-fA-F0-9]{40}$/.test(mk)
          ? db.markets.find((x) => x.address.toLowerCase() === mk.toLowerCase())
          : db.markets.find((x) => slugify(x.question) === slugify(mk));
    if (!m) return reply.code(404).send({ error: "market not found" });
    // if an owner was given, ensure the market belongs to them (else still return the market)
    const meta = marketMeta(m);
    return {
      owner: u ? { name: u.name, address: u.address } : null,
      market: {
        id: m.id, address: m.address, question: m.question, slug: slugify(m.question),
        priceYes: m.priceYes, volume: m.volume, resolved: m.resolved, outcome: m.outcome ?? null,
        closeTime: m.closeTime, oracle: m.oracle, creator: m.creator, restricted: meta.restricted, countries: meta.countries,
      },
    };
  });

  // current user's profile (settings prefill)
  app.get<{ Querystring: { address?: string } }>("/api/me", async (req) => {
    const u = db.users.find((x) => x.address.toLowerCase() === String(req.query.address ?? "").toLowerCase());
    return { user: u ?? null };
  });

  // update profile (settings)
  app.post<{ Body: any }>("/api/profile", async (req, reply) => {
    const { address, name, avatar, bio, country } = (req.body ?? {}) as any;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "bad address" });
    const u = db.users.find((x) => x.address.toLowerCase() === address.toLowerCase());
    if (!u) return reply.code(404).send({ error: "user not found (verify first)" });
    const cleanName = name ? String(name).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) : u.name;
    if (cleanName !== u.name && db.users.find((x) => x.name === cleanName)) return reply.code(409).send({ error: "name taken" });
    db.users.patch(u.id, { name: cleanName, avatar: avatar ?? u.avatar, bio: bio ?? u.bio, country: country ? normCountry(country) : u.country });
    return { ok: true, user: db.users.get(u.id) };
  });

  // create a market (backend is a registered creator; funds the initial liquidity)
  app.post<{ Body: any }>("/api/create-market", async (req, reply) => {
    const { question, description, category, image, closeTimeDays, creator, countries, restricted } = (req.body ?? {}) as any;
    if (!question || String(question).length < 6) return reply.code(400).send({ error: "question too short" });
    const L = toUsdc(0.5); // small initial liquidity to stretch the faucet
    const days = Math.max(1, Math.min(365, Number(closeTimeDays) || 14));
    const closeTime = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
    // country tags (e.g. ["US","GB"]) + restriction ride in the flexible metadata JSON — no schema change
    const countryTags = Array.isArray(countries) ? countries.map((c: any) => normCountry(c)).filter(Boolean).slice(0, 12) : [];
    const isRestricted = !!restricted && countryTags.length > 0;
    const metadataURI = JSON.stringify({ category: category || "general", description: description || "", image: image || "", countries: countryTags, restricted: isRestricted });
    try {
      // Path-B (audited Gnosis stack): create through MarketRegistry (market address = FPMM).
      // Legacy path (Arc): MarketFactory. Same external API either way.
      const target = (config.registry ?? config.factory) as `0x${string}`;
      const targetAbi: any = config.registry ? registryAbi : factoryAbi;
      const deployTx = await backendSigner().run(async ({ wallet, account }) => {
        const allowance = (await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, target] })) as bigint;
        if (allowance < L) {
          const ah = await wallet.writeContract({ address: config.usdc, abi: erc20Abi, functionName: "approve", args: [target, L], account, chain: arc });
          await publicClient.waitForTransactionReceipt({ hash: ah });
        }
        return wallet.writeContract({ address: target, abi: targetAbi, functionName: "createMarket", args: [config.usdc, question, metadataURI, closeTime, L], account, chain: arc });
      });
      await publicClient.waitForTransactionReceipt({ hash: deployTx as `0x${string}` });
      const count = (await publicClient.readContract({ address: target, abi: targetAbi, functionName: "marketCount" })) as bigint;
      const id = Number(count) - 1;
      const address = config.registry
        ? (((await publicClient.readContract({ address: target, abi: registryAbi, functionName: "markets", args: [BigInt(id)] })) as readonly unknown[])[0] as string)
        : ((await publicClient.readContract({ address: target, abi: factoryAbi, functionName: "markets", args: [BigInt(id)] })) as string);
      if (/^0x[a-fA-F0-9]{40}$/.test(creator ?? "")) { const s = submitters(); s[String(id)] = String(creator).toLowerCase(); kv.set("submitters", s); }
      return { address, question, id, explorer: config.explorer, deployTx };
    } catch (e) {
      return reply.code(502).send({ error: "create failed: " + (e as Error).message });
    }
  });

  // agents — public bots for everyone, plus the caller's own drafts (so they can publish)
  app.get<{ Querystring: { owner?: string } }>("/api/agents", async (req) => {
    const owner = String(req.query.owner ?? "").toLowerCase();
    const visible = db.agents.all().filter((a) => isPublicAgent(a) || (owner && a.ownerAddress.toLowerCase() === owner));
    return { agents: visible.map(toPublicAgent) };
  });
  app.post<{ Body: any }>("/api/agents", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const r = await createAgentInternal({ name: body.name, preset: body.preset, ownerAddress: body.owner, budgetUsdc: body.budgetUsdc });
    if (!r.ok) return reply.code(r.code).send({ error: r.error, quota: (r as any).quota });
    return { agent: toPublicAgent(r.agent), fundTx: r.fundTx };
  });

  // publish a draft bot — gated by a World ID confirmation (same portal verify as
  // onboarding/approvals). Dev bypass allowed unless ALLOW_DEV_VERIFY=false.
  app.post<{ Params: { id: string }; Body: any }>("/api/agents/:id/publish", async (req, reply) => {
    const { owner, idkitResponse, rp_id } = (req.body ?? {}) as any;
    const agent = db.agents.get(req.params.id);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner ?? "") || agent.ownerAddress.toLowerCase() !== String(owner).toLowerCase())
      return reply.code(403).send({ error: "only the owner can publish this agent" });
    if (isPublicAgent(agent)) return { agent: toPublicAgent(agent), alreadyPublic: true };
    if (!idkitResponse && process.env.ALLOW_DEV_VERIFY === "false")
      return reply.code(400).send({ error: "World ID proof required (dev bypass disabled)" });
    if (idkitResponse && rp_id) {
      const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse),
      });
      if (!portal.ok) return reply.code(400).send({ error: "World ID verification failed", portal: await portal.json().catch(() => ({})) });
    }
    const updated = db.agents.patch(agent.id, { public: true })!;
    return { agent: toPublicAgent(updated), published: true };
  });

  // reasoning feed (GET) + run tick (POST)
  app.get("/api/agent/tick", async () => ({ feed: db.feed.all().filter((f) => f.kind === "agent").sort((a, b) => b.ts - a.ts).slice(0, 100).map(toFeedPost) }));
  app.post<{ Body: any }>("/api/agent/tick", async (req) => {
    const { agentId } = (req.body ?? {}) as any;
    const id = agentId ?? db.agents.all().find(isPublicAgent)?.id;
    if (!id) return { action: "skip", reasoning: "no public agents", agent: "" };
    await tickAgent(id);
    const latest = db.feed.all().sort((a, b) => b.ts - a.ts)[0];
    return latest ? toFeedPost(latest) : { action: "skip", reasoning: "no feed", agent: "" };
  });

  // approvals
  app.get<{ Querystring: { owner?: string } }>("/api/approvals", async (req) => {
    const owner = String(req.query.owner ?? "").toLowerCase();
    const pending = db.approvals.filter((a) => a.status === "pending");
    return { approvals: (owner ? pending.filter((a) => a.ownerAddress.toLowerCase() === owner) : pending).map(toApproval) };
  });
  app.post<{ Params: { id: string }; Body: any }>("/api/approvals/:id", async (req, reply) => {
    const { action, idkitResponse, rp_id } = (req.body ?? {}) as any;
    const appr = db.approvals.get(req.params.id);
    if (!appr) return reply.code(404).send({ error: "no approval" });
    if (appr.status !== "pending") return reply.code(409).send({ error: `already ${appr.status}` });

    if (action === "reject") {
      db.approvals.patch(appr.id, { status: "rejected" });
      db.feed.prepend({ id: `rej:${appr.id}`, ts: Date.now(), kind: "agent", agent: true, agentName: appr.agentName, marketId: appr.marketId, marketQuestion: appr.marketQuestion, reasoning: `Human REJECTED the ${sideOf(appr.outcome)} $${appr.amountUsdc} bet.` });
      return { status: "rejected" };
    }
    if (idkitResponse && rp_id) {
      const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse) });
      if (!portal.ok) return reply.code(400).send({ error: "World ID verification failed" });
    }
    const agent = db.agents.get(appr.agentId);
    const market = db.markets.get(appr.marketId);
    if (!agent || !market) return reply.code(410).send({ error: "agent/market missing" });
    try {
      const tx = await executeBuy(agent, market, appr.outcome === 1 ? "YES" : "NO", appr.amountUsdc);
      db.agents.patch(agent.id, { spentUsdc: agent.spentUsdc + appr.amountUsdc });
      db.approvals.patch(appr.id, { status: "approved", tx });
      db.feed.prepend({ id: `appr:${appr.id}`, ts: Date.now(), kind: "agent", agent: true, agentName: agent.name, marketId: market.id, marketQuestion: market.question, outcome: appr.outcome, amountUsdc: appr.amountUsdc, reasoning: `Human-approved via World ID. ${appr.reasoning}`, humanBacked: true, tx });
      return { status: "approved", tx, txUrl: txUrl(tx) };
    } catch (e) {
      return reply.code(502).send({ error: "execution failed: " + (e as Error).message });
    }
  });

  // resolution record (verdict + rationale) for the market page
  app.get<{ Params: { id: string } }>("/api/resolution/:id", async (req, reply) => {
    const m = db.markets.get(Number(req.params.id));
    if (!m || !m.resolved) return reply.code(404).send({ error: "not resolved" });
    return { id: m.id, verdict: m.outcome === 1 ? "YES" : m.outcome === 0 ? "NO" : "INVALID", rationale: m.reason ?? "", oracle: m.oracle ?? "claude", model: m.oracle === "chainlink" ? "Chainlink Data Feed" : "claude-sonnet-4-6", at: new Date(m.createdAt).toISOString().slice(0, 10) };
  });
}
