import type { FastifyInstance } from "fastify";

// Write routes are mounted here. Filled incrementally: onboard, agents, deposit, approve.
export async function registerWriteRoutes(app: FastifyInstance) {
  const { onboardRoutes } = await import("./onboard.js");
  const { agentRoutes } = await import("./agents.js");
  const { depositRoutes } = await import("./deposit.js");
  await onboardRoutes(app);
  await agentRoutes(app);
  await depositRoutes(app);
}
