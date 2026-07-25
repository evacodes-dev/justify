import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

// Demo buyer for the reputation API — the whole x402 loop from the customer's side.
//
// The buyer is just a wallet holding Base Sepolia USDC. No account, no API key, no gas:
// the 402 response carries the payment requirements, the wallet signs an EIP-3009
// transferWithAuthorization, the facilitator submits it (and pays the gas), and the
// retried request returns the score. This is what "an agent buys another agent's
// reputation" looks like on the wire.
//
//   X402_BUYER_PK=0x… npx tsx scripts/buy-reputation.ts <agentAddress> [baseUrl]

const pk = process.env.X402_BUYER_PK;
if (!pk) {
  console.error("Set X402_BUYER_PK to a wallet holding Base Sepolia USDC.");
  process.exit(1);
}

const agent = process.argv[2] ?? "0x199D2956A804d48804a9482240D03Dab0495F578";
const baseUrl = process.argv[3] ?? "http://localhost:8790";

const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const signer = toClientEvmSigner(account, publicClient);

const client = new x402Client().register("eip155:84532", new ExactEvmScheme(signer));
const fetchWithPay = wrapFetchWithPayment(fetch, client);

console.log(`buyer:  ${account.address}`);
console.log(`target: ${baseUrl}/api/reputation/${agent}\n`);

const res = await fetchWithPay(`${baseUrl}/api/reputation/${agent}`, {
  headers: { Accept: "application/json" },
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const settle = res.headers.get("payment-response");
if (settle !== null) {
  const decoded = decodePaymentResponseHeader(settle);
  console.log("payment settled:", JSON.stringify(decoded, null, 2));
} else {
  console.log("(no payment-response header — endpoint was served free)");
}

const report = (await res.json()) as {
  address: string;
  score: number;
  components: Record<string, number>;
  sample: Record<string, number | null>;
  bundle: { uri: string | null; url: string | null };
};
console.log(`\nagent ${report.address}`);
console.log(`SCORE: ${report.score}/100`);
console.log("components:", JSON.stringify(report.components));
console.log("sample:    ", JSON.stringify(report.sample));
console.log("report pinned at:", report.bundle.uri ?? "(not pinned)");