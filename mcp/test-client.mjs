// Minimal MCP client that exercises every tool against the live subgraph and API.
//   node test-client.mjs
import { spawn } from "node:child_process";

const child = spawn("node", [new URL("./index.mjs", import.meta.url).pathname], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
});

let id = 0;
const rpc = (method, params) =>
  new Promise((resolve) => {
    const rid = ++id;
    pending.set(rid, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: rid, method, params }) + "\n");
  });

const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } });
console.log("server:", JSON.stringify(init.result.serverInfo));

const { result: { tools } } = await rpc("tools/list");
console.log(`tools: ${tools.map((t) => t.name).join(", ")}\n`);

const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args });
  console.log(`── ${name}(${JSON.stringify(args)})`);
  console.log(r.result.content[0].text.split("\n").slice(0, 12).join("\n"));
  console.log();
};

await call("list_markets", { limit: 5 });
await call("get_market_context", { marketId: "13" });
await call("get_leaderboard", { limit: 3 });
await call("get_resolution_evidence", { marketId: "13" });
await call("get_agent_reputation", { address: "0x5aB9514b6F4D60B86cb1A53D76fFf4e0A90277cF" });
await call("query_subgraph", { query: "{ global(id: \"global\") { tradeCount volumeUSDC } }" });

child.kill();
process.exit(0);