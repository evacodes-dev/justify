import type { FastifyInstance } from "fastify";

import { parseEventLogs } from "viem";
import { config, toUsdc, txUrl } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { erc20Abi, registryAbi } from "../abis.js";
import { isAddr, verifyWorldProof, ensureGas } from "../util.js";
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
  const { likesOf, commentsOf, recentCommentsOf } = await import("./social.js");
  app.get("/api/markets", async () => ({
    markets: db.markets.all().sort((a, b) => b.createdAt - a.createdAt).map((m) => ({
      id: m.id, address: m.address, question: m.question, metadataURI: m.metadataURI,
      priceYes: m.priceYes, volume: m.volume, resolved: m.resolved, outcome: m.outcome, closeTime: m.closeTime, oracle: m.oracle,
      creator: m.creator, creatorName: creatorNameOf(m.id, m.creator), createdAt: m.createdAt,
      likes: likesOf(m.id).length, comments: commentsOf(m.id).length,
      recentComments: recentCommentsOf(m.id, 3),
      // Path-B (Gnosis CTF) extras — null on the legacy stack
      conditionId: m.conditionId ?? null, posYes: m.posYes ?? null, posNo: m.posNo ?? null,
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
  // Network-aware via config (Base native = ETH → tiny drip).
  app.post<{ Body: any }>("/api/dotation", async (req, reply) => {
    const { address } = (req.body ?? {}) as any;
    if (!isAddr(address)) return reply.code(400).send({ error: "bad address" });
    const hash = await ensureGas(address);
    return hash
      ? { funded: true, hash, amount: config.gasDripAmount, token: config.nativeCurrency.symbol }
      : { skipped: true, token: config.nativeCurrency.symbol };
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
      try {
        nullifier = await verifyWorldProof(rp_id, idkitResponse);
      } catch (e: any) {
        return reply.code(400).send({ error: e.message, portal: e.portal ?? {} });
      }
    }
    // gas dotation so a fresh embedded wallet can trade. World ID verify is JUST the
    // checkmark — the creator role comes exclusively from the admin API.
    try {
      await ensureGas(walletAddress as `0x${string}`);
    } catch (e) { app.log.error("verify gas dotation: " + (e as Error).message); }

    const existing = db.users.find((u) => u.address.toLowerCase() === walletAddress.toLowerCase());
    db.users.put({
      id: walletAddress.toLowerCase(), address: walletAddress,
      name: (name ? String(name).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) : "") || existing?.name || walletAddress.slice(0, 8).toLowerCase(),
      verified: true, creator: existing?.creator, humanId: nullifier ?? existing?.humanId ?? walletAddress.toLowerCase(),
      country: (country ? normCountry(country) : existing?.country),
      createdAt: existing?.createdAt ?? Date.now(),
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

  // country gate: can the connected user bet on this market? (feature-flagged off for MVP)
  app.get<{ Params: { id: string }; Querystring: { address?: string } }>("/api/can-bet/:id", async (req) => {
    if (!config.features.countryGate) return { allowed: true, restricted: false };
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
    const { followersOf } = await import("./social.js");
    const users = db.users.all();
    return {
      creators: users.map((u) => ({
        id: u.address.toLowerCase(), name: u.name, handle: "@" + u.name, address: u.address,
        avatar: u.avatar || "/img/images.jpeg", bio: u.bio || "", verified: u.verified, creator: !!u.creator,
        followers: followersOf(u.address.toLowerCase()).length,
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
    const { followersOf } = await import("./social.js");
    return {
      user: {
        name: u.name, address: u.address, bio: u.bio ?? "", avatar: u.avatar || "/img/images.jpeg",
        verified: u.verified, creator: !!u.creator, country: u.country ?? null, createdAt: u.createdAt,
        followers: followersOf(u.address.toLowerCase()).length,
      },
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
    const { question, description, category, image, closeTimeDays, closeTimeTs, creator, countries, restricted, priceConfig } = (req.body ?? {}) as any;
    if (!question || String(question).length < 6) return reply.code(400).send({ error: "question too short" });
    // self-create mode: creation happens from the user's wallet — the backend path is CLOSED
    // (otherwise a stale cached bundle silently falls back to backend-funded creation)
    if (config.createMode === "self") {
      return reply.code(409).send({ error: "self-create mode is on: create the market from your wallet (hard-refresh the page if you don't see the wallet flow)" });
    }
    // product rule: creators are granted via the admin API only (World ID = just a checkmark)
    if (config.features.creatorViaAdmin) {
      const cu = db.users.find((x) => x.address.toLowerCase() === String(creator ?? "").toLowerCase());
      if (!cu?.creator) return reply.code(403).send({ error: "creator role required (granted by admin)" });
    }

    // close time: exact timestamp (date-time picker) preferred; legacy closeTimeDays fallback
    const nowSec = Math.floor(Date.now() / 1000);
    let closeSec: number;
    if (closeTimeTs != null) {
      closeSec = Number(closeTimeTs);
      if (!Number.isFinite(closeSec)) return reply.code(400).send({ error: "bad closeTimeTs" });
      if (closeSec < nowSec + 30 * 60) return reply.code(400).send({ error: "close time must be at least 30 minutes from now" });
      if (closeSec > nowSec + 365 * 86400) return reply.code(400).send({ error: "close time too far (max 1 year)" });
    } else {
      const days = Math.max(1, Math.min(365, Number(closeTimeDays) || 14));
      closeSec = nowSec + days * 86400;
    }
    const closeTime = BigInt(closeSec);

    // structured price market: deterministic Chainlink resolution, no LLM in the loop
    let price: { asset: string; comparator: "above" | "below"; threshold: number } | null = null;
    if (priceConfig && typeof priceConfig === "object") {
      const asset = String(priceConfig.asset ?? "").toUpperCase();
      const comparator = priceConfig.comparator === "below" ? "below" : "above";
      const threshold = Number(priceConfig.threshold);
      if (!config.onchainFeeds[asset] && !hasFeed(asset)) return reply.code(400).send({ error: `no price feed for ${asset || "?"} (ETH/BTC/LINK)` });
      if (!(threshold > 0)) return reply.code(400).send({ error: "bad price threshold" });
      price = { asset, comparator, threshold };
    }
    // custom (subjective) markets MUST state how they resolve — that text is what the AI
    // oracle judges by and what challengers evaluate in the dispute window
    const criteria = String(description ?? "").trim();
    if (!price && criteria.length < 20) {
      return reply.code(400).send({ error: "resolution criteria required for custom markets (min 20 chars): state how and from what source this resolves" });
    }

    // country tags (e.g. ["US","GB"]) + restriction ride in the flexible metadata JSON — no schema change
    const countryTags = Array.isArray(countries) ? countries.map((c: any) => normCountry(c)).filter(Boolean).slice(0, 12) : [];
    const isRestricted = config.features.countryGate && !!restricted && countryTags.length > 0;
    const L = toUsdc(0.5); // small initial liquidity to stretch the faucet (liquidity UX — pending product call)
    const metadataURI = JSON.stringify({ category: category || "general", description: criteria, criteria, image: image || "", price, countries: countryTags, restricted: isRestricted });
    try {
      // create through MarketRegistry over the audited Gnosis stack (market address = FPMM)
      const target = config.registry!;
      const deployTx = await backendSigner().run(async ({ wallet, account }) => {
        let allowance = (await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, target] })) as bigint;
        if (allowance < L) {
          // MAX approve once + re-read until the (load-balanced, lagging) RPC reflects it —
          // otherwise createMarket's simulation sees the stale allowance and reverts.
          const MAX = 2n ** 256n - 1n;
          const ah = await wallet.writeContract({ address: config.usdc, abi: erc20Abi, functionName: "approve", args: [target, MAX], account, chain: arc });
          await publicClient.waitForTransactionReceipt({ hash: ah });
          for (let i = 0; i < 12 && allowance < L; i++) {
            await new Promise((r) => setTimeout(r, 2500));
            allowance = (await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, target] })) as bigint;
          }
        }
        return wallet.writeContract({ address: target, abi: registryAbi, functionName: "createMarket", args: [config.usdc, question, metadataURI, closeTime, L], account, chain: arc });
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx as `0x${string}` });
      // id/address from the receipt's own MarketCreated event — deterministic. (Re-reading
      // marketCount after the tx hit a lagging RPC node once and mis-attributed the market.)
      const created = parseEventLogs({ abi: registryAbi, logs: receipt.logs, eventName: "MarketCreated" })[0] as any;
      if (!created) return reply.code(502).send({ error: "create succeeded but MarketCreated event missing" });
      const id = Number(created.args.id);
      const address = created.args.fpmm as string;
      if (isAddr(creator)) { const s = submitters(); s[String(id)] = String(creator).toLowerCase(); kv.set("submitters", s); }
      return { address, question, id, explorer: config.explorer, deployTx };
    } catch (e) {
      return reply.code(502).send({ error: "create failed: " + (e as Error).message });
    }
  });

  // agents — public bots for everyone, plus the caller's own drafts (so they can publish)
  app.get<{ Querystring: { owner?: string } }>("/api/agents", async (req) => {
    if (!config.features.agents) return { agents: [] }; // feature-flagged off for MVP
    const owner = String(req.query.owner ?? "").toLowerCase();
    const visible = db.agents.all().filter((a) => isPublicAgent(a) || (owner && a.ownerAddress.toLowerCase() === owner));
    return { agents: visible.map(toPublicAgent) };
  });
  app.post<{ Body: any }>("/api/agents", async (req, reply) => {
    if (!config.features.agents) return reply.code(403).send({ error: "agents are disabled" });
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
      try {
        await verifyWorldProof(rp_id, idkitResponse);
      } catch (e: any) {
        return reply.code(400).send({ error: e.message, portal: e.portal ?? {} });
      }
    }
    const updated = db.agents.patch(agent.id, { public: true })!;
    return { agent: toPublicAgent(updated), published: true };
  });

  // reasoning feed (GET) + run tick (POST)
  app.get("/api/agent/tick", async () => {
    if (!config.features.agents) return { feed: [] };
    return { feed: db.feed.all().filter((f) => f.kind === "agent").sort((a, b) => b.ts - a.ts).slice(0, 100).map(toFeedPost) };
  });
  app.post<{ Body: any }>("/api/agent/tick", async (req, reply) => {
    if (!config.features.agents) return reply.code(403).send({ error: "agents are disabled" });
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
