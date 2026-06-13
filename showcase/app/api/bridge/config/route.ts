import { NextResponse } from "next/server";
import { publicNet } from "../../../../lib/networks";

// Public network profile for the client (chain ids, USDC, CCTP contracts, domains).
// Everything here is on-chain public — no secrets. Client reads this so switching
// NETWORK=mainnet on the server flips the whole UI with zero code changes.
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(publicNet());
}
