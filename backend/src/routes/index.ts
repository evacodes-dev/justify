import type { FastifyInstance } from "fastify";

// All API routes are mounted here (product stack).
export async function registerWriteRoutes(app: FastifyInstance) {
  const { agentRoutes } = await import("./agents.js");
  const { depositRoutes } = await import("./deposit.js");
  const { opsRoutes } = await import("./ops.js");
  const { compatRoutes } = await import("./compat.js");
  const { portfolioRoutes } = await import("./portfolio.js");
  const { ogRoutes } = await import("./og.js");
  const { betaRoutes } = await import("./beta.js");
  const { socialRoutes } = await import("./social.js");
  const { adminRoutes } = await import("./admin.js");
  await agentRoutes(app); // agent management (feature-flagged off by default)
  await depositRoutes(app); // Blink deposit signer
  await opsRoutes(app); // internal ops (resolve/tick)
  await compatRoutes(app); // /api/* contract for the SPA front-end
  await portfolioRoutes(app); // private PnL / portfolio + non-custodial withdraw
  await ogRoutes(app); // OG share images
  await betaRoutes(app); // bug-report + points
  await socialRoutes(app); // likes + followers
  await adminRoutes(app); // creator-role management (x-admin-secret)
}
