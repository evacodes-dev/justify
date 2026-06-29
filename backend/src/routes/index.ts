import type { FastifyInstance } from "fastify";

// Write routes are mounted here. Filled incrementally: onboard, agents, deposit, approve.
export async function registerWriteRoutes(app: FastifyInstance) {
  const { onboardRoutes } = await import("./onboard.js");
  const { agentRoutes } = await import("./agents.js");
  const { depositRoutes } = await import("./deposit.js");
  const { opsRoutes } = await import("./ops.js");
  const { compatRoutes } = await import("./compat.js");
  const { depositBridgeRoutes } = await import("./deposit-bridge.js");
  const { portfolioRoutes } = await import("./portfolio.js");
  const { ogRoutes } = await import("./og.js");
  await onboardRoutes(app);
  await agentRoutes(app);
  await depositRoutes(app);
  await opsRoutes(app);
  await compatRoutes(app); // /api/* contract for the SPA front-end
  await depositBridgeRoutes(app); // CCTP Base Sepolia → Arc auto-bridge
  await portfolioRoutes(app); // BE5 — private PnL / portfolio
  await ogRoutes(app); // BE9 — OG share images
}
