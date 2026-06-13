import { createPublicClient, defineChain, http, parseEther } from 'viem'
import { ARC, USDC_ABI, MARKET_ABI } from './markets'

// viem chain for Arc testnet (native USDC, 18-decimal native unit).
export const arcChain = defineChain({
  id: ARC.chainId,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC.rpc] } },
  blockExplorers: { default: { name: 'Arcscan', url: ARC.explorer } },
})

export const arcPublic = createPublicClient({ chain: arcChain, transport: http(ARC.rpc) })

export const toUsdc = (human: number) => BigInt(Math.round(human * 1e6)) // 6-dec ERC20 units
export const fromUsdc = (raw: bigint) => Number(raw) / 1e6
export const txUrl = (hash: string) => `${ARC.explorer}/tx/${hash}`

// Live trade on the FPMM: approve USDC then buy, from a Dynamic embedded wallet.
// `side` 0 = NO, 1 = YES (== the FPMM `outcome`). Name kept for component compatibility.
export async function approveAndBet(
  walletClient: any,
  market: `0x${string}`,
  side: 0 | 1,
  amountHuman: number,
): Promise<{ approveHash: string; betHash: string }> {
  const account = walletClient.account
  const amount = toUsdc(amountHuman)

  const allowance = (await arcPublic.readContract({
    address: ARC.usdc, abi: USDC_ABI, functionName: 'allowance', args: [account.address, market],
  })) as bigint
  let approveHash = ''
  if (allowance < amount) {
    approveHash = await walletClient.writeContract({
      address: ARC.usdc, abi: USDC_ABI, functionName: 'approve', args: [market, amount],
      chain: arcChain, account,
    })
    await arcPublic.waitForTransactionReceipt({ hash: approveHash as `0x${string}` })
  }

  const betHash = await walletClient.writeContract({
    address: market, abi: MARKET_ABI, functionName: 'buy', args: [side, amount],
    chain: arcChain, account,
  })
  await arcPublic.waitForTransactionReceipt({ hash: betHash as `0x${string}` })
  return { approveHash, betHash }
}

export async function usdcBalance(address: `0x${string}`): Promise<number> {
  const raw = (await arcPublic.readContract({ address: ARC.usdc, abi: USDC_ABI, functionName: 'balanceOf', args: [address] })) as bigint
  return fromUsdc(raw)
}

// Send USDC (native value-transfer = gas + asset on Arc) from a Dynamic wallet.
export async function sendUsdc(walletClient: any, to: `0x${string}`, amountHuman: number): Promise<string> {
  const hash = await walletClient.sendTransaction({
    to, value: parseEther(String(amountHuman)), chain: arcChain, account: walletClient.account,
  })
  await arcPublic.waitForTransactionReceipt({ hash: hash as `0x${string}` })
  return hash
}

// Claim winnings on a resolved FPMM market (redeem winning shares 1:1).
export async function claimMarket(walletClient: any, market: `0x${string}`): Promise<string> {
  const hash = await walletClient.writeContract({
    address: market, abi: MARKET_ABI, functionName: 'redeem', args: [],
    chain: arcChain, account: walletClient.account,
  })
  await arcPublic.waitForTransactionReceipt({ hash: hash as `0x${string}` })
  return hash
}

export type MarketState = Awaited<ReturnType<typeof readMarket>>

export async function readPosition(market: `0x${string}`, user: `0x${string}`) {
  const base = await readMarket(market, user)
  const [outcome, payout] = await Promise.all([
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'winningOutcome' }).catch(() => 0) as Promise<number>,
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'previewPayout', args: [user] }).catch(() => BigInt(0)) as Promise<bigint>,
  ])
  return { ...base, outcome, payout: fromUsdc(payout) }
}

// Live FPMM state for one market. `yesPct` comes from priceYes() (the AMM probability),
// NOT a pool ratio. `stakeNo/stakeYes` are the user's outcome-share balances.
export async function readMarket(market: `0x${string}`, user?: `0x${string}`) {
  const [priceYesRaw, reserves, resolved] = await Promise.all([
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'priceYes' }) as Promise<bigint>,
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'reserves' }) as Promise<readonly [bigint, bigint]>,
    arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'resolved' }) as Promise<boolean>,
  ])
  let stakeNo = 0, stakeYes = 0
  if (user) {
    const [no, yes] = await Promise.all([
      arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'balances', args: [user, 0] }) as Promise<bigint>,
      arcPublic.readContract({ address: market, abi: MARKET_ABI, functionName: 'balances', args: [user, 1] }) as Promise<bigint>,
    ])
    stakeNo = fromUsdc(no); stakeYes = fromUsdc(yes)
  }
  const [reserveYes, reserveNo] = reserves
  const yesPct = Math.round((Number(priceYesRaw) / 1e18) * 100)
  return {
    no: fromUsdc(reserveNo), yes: fromUsdc(reserveYes), total: fromUsdc(reserveYes + reserveNo),
    yesPct, resolved, stakeNo, stakeYes,
  }
}
