import { createPublicClient, defineChain, http, parseEther } from "viem";
import { ARC, USDC_ABI, MARKET_ABI } from "../app/showcase/demo-markets";

// viem chain for Arc testnet (native USDC, 18-decimal native unit)
export const arcChain = defineChain({
  id: ARC.chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC.rpc] } },
  blockExplorers: { default: { name: "Arcscan", url: ARC.explorer } },
});

export const arcPublic = createPublicClient({ chain: arcChain, transport: http(ARC.rpc) });

export const toUsdc = (human: number) => BigInt(Math.round(human * 1e6)); // 6-dec ERC20 units
export const fromUsdc = (raw: bigint) => Number(raw) / 1e6;
export const txUrl = (hash: string) => `${ARC.explorer}/tx/${hash}`;

// Live trade: approve USDC then bet, from a Dynamic embedded wallet, on Arc.
// primaryWallet is the Dynamic EVM wallet; we get a viem WalletClient from it.
export async function approveAndBet(
  walletClient: any,
  market: `0x${string}`,
  side: 0 | 1,
  amountHuman: number,
): Promise<{ approveHash: string; betHash: string }> {
  const account = walletClient.account;
  const amount = toUsdc(amountHuman);

  // 1) approve (skip if allowance already enough)
  const allowance = (await arcPublic.readContract({
    address: ARC.usdc, abi: USDC_ABI, functionName: "allowance", args: [account.address, market],
  })) as bigint;
  let approveHash = "";
  if (allowance < amount) {
    approveHash = await walletClient.writeContract({
      address: ARC.usdc, abi: USDC_ABI, functionName: "approve", args: [market, amount],
      chain: arcChain, account,
    });
    await arcPublic.waitForTransactionReceipt({ hash: approveHash as `0x${string}` });
  }

  // 2) bet
  const betHash = await walletClient.writeContract({
    address: market, abi: MARKET_ABI, functionName: "bet", args: [side, amount],
    chain: arcChain, account,
  });
  await arcPublic.waitForTransactionReceipt({ hash: betHash as `0x${string}` });
  return { approveHash, betHash };
}

// USDC balance (ERC-20 6-dec view of the native balance) for any address.
export async function usdcBalance(address: `0x${string}`): Promise<number> {
  const raw = (await arcPublic.readContract({ address: ARC.usdc, abi: USDC_ABI, functionName: "balanceOf", args: [address] })) as bigint;
  return fromUsdc(raw);
}

// Send USDC (native value-transfer = gas + asset on Arc) from a Dynamic wallet.
export async function sendUsdc(walletClient: any, to: `0x${string}`, amountHuman: number): Promise<string> {
  const hash = await walletClient.sendTransaction({
    to, value: parseEther(String(amountHuman)), chain: arcChain, account: walletClient.account,
  });
  await arcPublic.waitForTransactionReceipt({ hash: hash as `0x${string}` });
  return hash;
}

export async function claimMarket(walletClient: any, market: `0x${string}`): Promise<string> {
  const hash = await walletClient.writeContract({
    address: market, abi: MARKET_ABI, functionName: "claim", args: [],
    chain: arcChain, account: walletClient.account,
  });
  await arcPublic.waitForTransactionReceipt({ hash: hash as `0x${string}` });
  return hash;
}

export async function readPosition(market: `0x${string}`, user: `0x${string}`) {
  const base = await readMarket(market, user);
  const [outcome, payout] = await Promise.all([
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: "outcome" }).catch(() => 0) as Promise<number>,
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: "previewPayout", args: [user] }).catch(() => BigInt(0)) as Promise<bigint>,
  ]);
  return { ...base, outcome, payout: fromUsdc(payout) };
}

export async function readMarket(market: `0x${string}`, user?: `0x${string}`) {
  const [pools, resolved] = await Promise.all([
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: "pools" }) as Promise<readonly [bigint, bigint]>,
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: "resolved" }) as Promise<boolean>,
  ]);
  const ZERO = BigInt(0);
  let stake: readonly [bigint, bigint] = [ZERO, ZERO];
  if (user) stake = (await arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: "stakeOf", args: [user] })) as readonly [bigint, bigint];
  const [no, yes] = pools;
  const total = no + yes;
  const yesPct = total === ZERO ? 50 : Number((yes * BigInt(100)) / total);
  return { no: fromUsdc(no), yes: fromUsdc(yes), total: fromUsdc(total), yesPct, resolved, stakeNo: fromUsdc(stake[0]), stakeYes: fromUsdc(stake[1]) };
}
