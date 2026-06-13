import { useCallback, useEffect, useState } from 'react'
import type { DemoMarket } from '../../lib/markets'
import { readPosition, claimMarket, txUrl } from '../../lib/arc'
import { getResolution, type Resolution } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'

type Pos = Awaited<ReturnType<typeof readPosition>>

// Market-detail resolution + redeem (TZ Part 1 — Market Page): outcome +
// justification (CRE/LLM, from backend) + redeem for winners. Same bg-glass style.
export default function ResolutionBlock({ market }: { market: DemoMarket }) {
  const { address, getArcWalletClient } = useWallet()
  const toast = useToast()
  const [pos, setPos] = useState<Pos | null>(null)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [claiming, setClaiming] = useState(false)

  const load = useCallback(() => {
    if (!address) {
      setPos(null)
      return
    }
    readPosition(market.address, address).then(setPos).catch(() => {})
  }, [address, market.address])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getResolution(market.id).then(setResolution).catch(() => {})
  }, [market.id])

  // Only render once the market is resolved on-chain.
  if (!pos?.resolved) return null

  const wonSide = pos.outcome === 1 ? 'YES' : pos.outcome === 0 ? 'NO' : '—'
  const canRedeem = pos.payout > 0

  const redeem = async () => {
    setClaiming(true)
    try {
      const wc = await getArcWalletClient()
      const hash = await claimMarket(wc, market.address)
      toast.show(`Redeemed $${pos.payout.toFixed(2)} USDC`, { kind: 'success', href: txUrl(hash), hrefLabel: 'View tx on Arcscan ↗' })
      load()
    } catch (e: any) {
      toast.show(e?.shortMessage || e?.message || 'Redeem failed', { kind: 'error' })
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="px-lg-3 pb-3">
      <div className="bg-glass rounded-4 shadow-sm p-3">
        <div className="d-flex align-items-center mb-2">
          <h6 className="fw-bold text-body mb-0 flex-grow-1">Resolution</h6>
          <span className={`badge ${wonSide === 'YES' ? 'bg-success' : 'bg-danger'}`}>Resolved · {wonSide}</span>
        </div>
        {resolution?.rationale ? (
          <p className="text-muted small mb-2" style={{ whiteSpace: 'pre-wrap' }}>{resolution.rationale}</p>
        ) : (
          <p className="text-muted small mb-2">Outcome settled on-chain.</p>
        )}
        <div className="d-flex align-items-center justify-content-between small">
          {resolution?.tx ? (
            <a href={txUrl(resolution.tx)} target="_blank" rel="noreferrer" className="text-primary text-decoration-none">
              resolution tx ↗
            </a>
          ) : <span />}
          {resolution?.model && <span className="text-muted">{resolution.model}</span>}
        </div>
        {canRedeem && (
          <button className="btn btn-primary rounded-4 w-100 mt-3 fw-bold" disabled={claiming} onClick={redeem}>
            {claiming ? 'Redeeming…' : `Redeem $${pos.payout.toFixed(2)} USDC`}
          </button>
        )}
      </div>
    </div>
  )
}
