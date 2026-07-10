import { createPublicClient, defineChain, http, type Chain, type PublicClient } from 'viem'
import { CHAIN, ensureConfig, USDC_ABI, FPMM_ABI, CTF_ABI, type ApiMarket } from './markets'

// On-chain reads/writes over the audited Gnosis CTF/FPMM stack on Base.
// Money sits in ConditionalTokens (ERC-1155); trading happens on the market's FPMM.

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const
// Binary condition index sets: [1] = NO slot, [2] = YES slot. Passing both on
// redeem is safe — an empty side just contributes zero.
const BOTH_INDEX_SETS = [1n, 2n]

let chain: Chain | null = null
let pub: PublicClient | null = null

// viem chain + shared public client, built after /config answers.
async function client(): Promise<{ pub: PublicClient; chain: Chain }> {
  const cfg = await ensureConfig()
  if (!pub || !chain) {
    chain = defineChain({
      id: cfg.chainId,
      name: cfg.chainId === 8453 ? 'Base' : 'Base Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpc] } },
      blockExplorers: { default: { name: 'Basescan', url: cfg.explorer } },
    })
    pub = createPublicClient({ chain, transport: http(cfg.rpc) })
  }
  return { pub, chain }
}

export const toUsdc = (human: number) => BigInt(Math.round(human * 1e6)) // 6-dec ERC20 units
export const fromUsdc = (raw: bigint) => Number(raw) / 1e6
export const txUrl = (hash: string) => `${CHAIN.explorer}/tx/${hash}`

// Buy outcome shares: quote calcBuyAmount → approve USDC on the FPMM → buy with
// 2% slippage tolerance. `side` 0 = NO, 1 = YES (== FPMM outcomeIndex).
export async function buyShares(
  walletClient: any,
  fpmm: `0x${string}`,
  side: 0 | 1,
  amountHuman: number,
): Promise<{ approveHash: string; betHash: string; shares: number }> {
  const { pub, chain } = await client()
  const account = walletClient.account
  const amount = toUsdc(amountHuman)

  const out = (await pub.readContract({
    address: fpmm, abi: FPMM_ABI, functionName: 'calcBuyAmount', args: [amount, BigInt(side)],
  })) as bigint
  const minOut = (out * 98n) / 100n

  const allowance = (await pub.readContract({
    address: CHAIN.usdc, abi: USDC_ABI, functionName: 'allowance', args: [account.address, fpmm],
  })) as bigint
  let approveHash = ''
  if (allowance < amount) {
    approveHash = await walletClient.writeContract({
      address: CHAIN.usdc, abi: USDC_ABI, functionName: 'approve', args: [fpmm, amount],
      chain, account,
    })
    await pub.waitForTransactionReceipt({ hash: approveHash as `0x${string}` })
  }

  const betHash = await walletClient.writeContract({
    address: fpmm, abi: FPMM_ABI, functionName: 'buy', args: [amount, BigInt(side), minOut],
    chain, account,
  })
  await pub.waitForTransactionReceipt({ hash: betHash as `0x${string}` })
  return { approveHash, betHash, shares: fromUsdc(out) }
}

// Quote for the buy preview: how many outcome shares `amountHuman` USDC buys now.
export async function quoteBuy(fpmm: `0x${string}`, side: 0 | 1, amountHuman: number): Promise<number> {
  const { pub } = await client()
  const out = (await pub.readContract({
    address: fpmm, abi: FPMM_ABI, functionName: 'calcBuyAmount', args: [toUsdc(amountHuman), BigInt(side)],
  })) as bigint
  return fromUsdc(out)
}

// Quote for the sell preview: how many shares must be sold to receive `returnHuman` USDC.
export async function quoteSell(fpmm: `0x${string}`, side: 0 | 1, returnHuman: number): Promise<number> {
  const { pub } = await client()
  const shares = (await pub.readContract({
    address: fpmm, abi: FPMM_ABI, functionName: 'calcSellAmount', args: [toUsdc(returnHuman), BigInt(side)],
  })) as bigint
  return fromUsdc(shares)
}

// Sell shares back to the pool BEFORE resolution. The user chooses the USDC amount
// to receive; the FPMM burns up to maxOutcomeTokensToSell of their ERC-1155 shares.
export async function sellShares(
  walletClient: any,
  fpmm: `0x${string}`,
  side: 0 | 1,
  returnHuman: number,
): Promise<{ approveHash: string; sellHash: string; sharesSold: number }> {
  const { pub, chain } = await client()
  const account = walletClient.account
  const ret = toUsdc(returnHuman)

  // one-time ERC-1155 operator approval per market
  const approved = (await pub.readContract({
    address: CHAIN.ctf, abi: CTF_ABI, functionName: 'isApprovedForAll', args: [account.address, fpmm],
  })) as boolean
  let approveHash = ''
  if (!approved) {
    approveHash = await walletClient.writeContract({
      address: CHAIN.ctf, abi: CTF_ABI, functionName: 'setApprovalForAll', args: [fpmm, true],
      chain, account,
    })
    await pub.waitForTransactionReceipt({ hash: approveHash as `0x${string}` })
  }

  const maxSell = (await pub.readContract({
    address: fpmm, abi: FPMM_ABI, functionName: 'calcSellAmount', args: [ret, BigInt(side)],
  })) as bigint

  const sellHash = await walletClient.writeContract({
    address: fpmm, abi: FPMM_ABI, functionName: 'sell', args: [ret, BigInt(side), maxSell],
    chain, account,
  })
  await pub.waitForTransactionReceipt({ hash: sellHash as `0x${string}` })
  return { approveHash, sellHash, sharesSold: fromUsdc(maxSell) }
}

// The user's outcome-share balances (ERC-1155 positions in ConditionalTokens).
export async function readShares(
  market: Pick<ApiMarket, 'posYes' | 'posNo'>,
  user: `0x${string}`,
): Promise<{ yesShares: number; noShares: number }> {
  if (!market.posYes || !market.posNo) return { yesShares: 0, noShares: 0 }
  const { pub } = await client()
  const [yes, no] = await Promise.all([
    pub.readContract({ address: CHAIN.ctf, abi: CTF_ABI, functionName: 'balanceOf', args: [user, BigInt(market.posYes)] }) as Promise<bigint>,
    pub.readContract({ address: CHAIN.ctf, abi: CTF_ABI, functionName: 'balanceOf', args: [user, BigInt(market.posNo)] }) as Promise<bigint>,
  ])
  return { yesShares: fromUsdc(yes), noShares: fromUsdc(no) }
}

// Expected redeem value for a resolved market. `outcome` from /api/markets:
// 0 = NO won, 1 = YES won, 2 = INVALID (50/50 split).
export function redeemValue(outcome: number | undefined, yesShares: number, noShares: number): number {
  if (outcome === 1) return yesShares
  if (outcome === 0) return noShares
  if (outcome === 2) return (yesShares + noShares) / 2
  return 0
}

// Redeem after resolution — winner and INVALID use the same call.
export async function redeemPositions(walletClient: any, conditionId: `0x${string}`): Promise<string> {
  const { pub, chain } = await client()
  const hash = await walletClient.writeContract({
    address: CHAIN.ctf, abi: CTF_ABI, functionName: 'redeemPositions',
    args: [CHAIN.usdc, ZERO_BYTES32, conditionId, BOTH_INDEX_SETS],
    chain, account: walletClient.account,
  })
  await pub.waitForTransactionReceipt({ hash: hash as `0x${string}` })
  return hash
}

// USDC is a plain ERC-20 on Base (not the native token like on Arc).
export async function usdcBalance(address: `0x${string}`): Promise<number> {
  const { pub } = await client()
  const raw = (await pub.readContract({ address: CHAIN.usdc, abi: USDC_ABI, functionName: 'balanceOf', args: [address] })) as bigint
  return fromUsdc(raw)
}
