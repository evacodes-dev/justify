import type { FastifyInstance } from "fastify";
import { isAddr } from "../util.js";
import { config } from "../config.js";
import { db } from "../store.js";
import {
  NoTrackRecordError,
  computeAndPublishReputation,
} from "../reputation.js";

// The reputation layer's public face: pay-per-query scoring of trading agents.
//
// The route sits behind an x402 paywall (HTTP 402 → the client signs an EIP-3009 USDC
// transfer on Base Sepolia → retries with the payment header → data). No account, no API
// key — an agent with a funded wallet is a customer. The same rails The Graph's gateway
// uses for pay-per-query subgraph access, so one wallet pays for both sides of our loop:
// data in (subgraph via x402) and reputation out (this endpoint).
//
// Machine clients: wrap fetch with `wrapFetchWithPayment` from @x402/fetch and call
// GET /api/reputation/:address — payment is handled inside the wrapper.

export async function reputationRoutes(app: FastifyInstance) {
  if (config.x402.enabled) {
    const [{ paymentMiddleware }, { registerExactEvmScheme }, core, { privateKeyToAccount }] =
      await Promise.all([
        import("@x402/fastify"),
        import("@x402/evm/exact/server"),
        import("@x402/core/server"),
        import("viem/accounts"),
      ]);

    // Revenue lands on the backend signer unless a dedicated treasury is configured.
    const payTo =
      config.x402.payTo || privateKeyToAccount(normalizePk(config.backendPk)).address;

    const facilitator = new core.HTTPFacilitatorClient({ url: config.x402.facilitator });
    const resourceServer = registerExactEvmScheme(new core.x402ResourceServer(facilitator), {});

    paymentMiddleware(
      app,
      {
        "GET /api/reputation/*": {
          accepts: {
            scheme: "exact",
            payTo,
            price: config.x402.price,
            network: config.x402.network as never,
          },
          description:
            "Reputation score for a Justify trading agent, computed from its on-chain track record against resolved market outcomes.",
          mimeType: "application/json",
        },
      },
      resourceServer,
    );
    app.log.info(
      `[x402] /api/reputation gated: ${config.x402.price} → ${payTo} on ${config.x402.network}`,
    );
  } else {
    app.log.warn("[x402] X402_ENABLED=off — reputation endpoint is free");
  }

  app.get<{ Params: { address: string } }>("/api/reputation/:address", async (req, reply) => {
    const address = req.params.address;
    if (!isAddr(address)) return reply.code(400).send({ error: "bad address" });

    try {
      const { report, bundleUri, bundleUrl } = await computeAndPublishReputation(address);
      const erc8004 = reportToRegistry(address, report.score, bundleUri, req.log);
      return {
        ...report,
        bundle: { uri: bundleUri, url: bundleUrl },
        erc8004,
        paid: config.x402.enabled,
      };
    } catch (e) {
      if (e instanceof NoTrackRecordError) {
        return reply.code(404).send({ error: "no on-chain trading record", address });
      }
      req.log.error(e, "reputation scoring failed");
      return reply.code(502).send({ error: "scoring unavailable", detail: (e as Error).message });
    }
  });

  // agent-card: the registration JSON an agent's ERC-8004 agentURI resolves to. Machine
  // readers land here from the Identity Registry token and find, alongside the identity,
  // the PAID x402 endpoint where the live score is sold — identity links to economy.
  app.get<{ Params: { address: string } }>("/api/agent-card/:address", async (req, reply) => {
    const address = req.params.address;
    if (!isAddr(address)) return reply.code(400).send({ error: "bad address" });
    const agent = db.agents.find((a) => a.address.toLowerCase() === address.toLowerCase());
    if (!agent) return reply.code(404).send({ error: "unknown agent" });
    const origin = process.env.PUBLIC_ORIGIN ?? "https://justify.market";
    return {
      type: "justify.trading-agent",
      name: agent.name,
      address: agent.address,
      strategy: agent.strategy,
      chain: { settlement: "eip155:84532" },
      erc8004: agent.erc8004Id
        ? { agentId: agent.erc8004Id, registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }
        : null,
      reputation: {
        endpoint: `${origin}/api/reputation/${agent.address}`,
        protocol: "x402",
        price: config.x402.price,
        network: config.x402.network,
      },
      dataSource: { subgraph: config.subgraphUrl },
    };
  });
}

/// Fire-and-forget: a paid read reports the score into the ERC-8004 Reputation Registry with
/// tag2="x402" and the content-addressed report as feedbackURI. Never blocks the response —
/// the buyer already got what they paid for; the registry write is the public side effect.
function reportToRegistry(
  address: string,
  score: number,
  bundleUri: string | null,
  log: { info: (m: string) => void; error: (m: string) => void },
): { agentId: string; pending: boolean } | null {
  if (!config.x402.enabled) return null; // only economically backed reads are reported
  const agent = db.agents.find((a) => a.address.toLowerCase() === address.toLowerCase());
  if (!agent?.erc8004Id) return null;

  const feedbackURI =
    bundleUri === null
      ? ""
      : `${config.zg.indexer}/file?root=${bundleUri.slice("0g://".length)}`;
  const erc8004Id = agent.erc8004Id;

  void import("../erc8004.js")
    .then(({ reportScore, erc8004Enabled }) => {
      if (!erc8004Enabled()) return;
      return reportScore({ erc8004Id, score, feedbackURI }).then((r) =>
        log.info(`[erc8004] feedback for agent #${erc8004Id} score=${score}: ${r.tx}`),
      );
    })
    .catch((e) => log.error(`[erc8004] feedback failed: ${(e as Error).message}`));

  return { agentId: erc8004Id, pending: true };
}

const normalizePk = (pk: string): `0x${string}` =>
  (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;