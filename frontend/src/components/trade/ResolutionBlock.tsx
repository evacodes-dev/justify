import { useEffect, useState } from 'react'
import type { ApiMarket } from '../../lib/markets'
import { redeemPositions, redeemValue, txUrl } from '../../lib/arc'
import { useCtfShares } from '../../hooks/useArcMarket'
import { getResolution, type Resolution } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import ChainlinkBadge from '../market/ChainlinkBadge'

// Market-detail resolution block over the Gnosis CTF:
// - closed but not finalized → "resolving…" state (optimistic settler challenge window)
// - resolved → outcome + oracle justification + redeemPositions for winners/INVALID.
export default function ResolutionBlock({ market }: { market: ApiMarket }) {
  const { address, getChainWalletClient } = useWallet()
  const toast = useToast()
  const { shares, refresh } = useCtfShares(market, address)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimedTx, setClaimedTx] = useState('')

  useEffect(() => {
    if (market.resolved) getResolution(market.id).then(setResolution).catch(() => {})
  }, [market.id, market.resolved])

  const closed = market.closeTime > 0 && market.closeTime * 1000 < Date.now()

  // Between closeTime and finalization: subjective markets sit in the 2h public
  // challenge window (Optimistic Settler) — show a generic resolving state.
  if (!market.resolved) {
    if (!closed) return null
    return (
      <div className="px-lg-3 pb-3">
        <div className="bg-glass rounded-4 shadow-sm p-3 d-flex align-items-center">
          <span className="material-icons text-warning me-2">hourglass_top</span>
          <div>
            <p className="text-body fw-bold mb-0">Resolving…</p>
            <p className="text-muted small mb-0">Resolution proposed — public challenge window before the outcome finalizes.</p>
          </div>
        </div>
      </div>
    )
  }

  const wonSide = market.outcome === 1 ? 'YES' : market.outcome === 0 ? 'NO' : 'INVALID'
  const payout = redeemValue(market.outcome, shares?.yesShares ?? 0, shares?.noShares ?? 0)
  const canRedeem = payout > 0 && !!market.conditionId && !claimedTx

  const redeem = async () => {
    if (!market.conditionId) return
    setClaiming(true)
    try {
      const wc = await getChainWalletClient()
      const hash = await redeemPositions(wc, market.conditionId)
      setClaimedTx(hash)
      toast.show(`Redeemed $${payout.toFixed(2)} USDC`, { kind: 'success', href: txUrl(hash), hrefLabel: 'View tx ↗' })
      refresh()
    } catch (e: any) {
      toast.show(e?.shortMessage || e?.message || 'Redeem failed', { kind: 'error' })
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="px-lg-3 pb-3">
      <div className="bg-glass rounded-4 shadow-sm p-3">
        <div className="d-flex align-items-center mb-2 gap-2 flex-wrap">
          <h6 className="fw-bold text-body mb-0 flex-grow-1">Resolution</h6>
          {resolution?.oracle === 'chainlink' ? (
            <span className="badge" style={{ background: '#375bd2' }}>Chainlink Data Feed</span>
          ) : resolution?.oracle === 'claude' ? (
            <span className="badge bg-secondary">AI oracle (Claude)</span>
          ) : null}
          <span className={`badge ${wonSide === 'YES' ? 'bg-success' : wonSide === 'NO' ? 'bg-danger' : 'bg-warning text-dark'}`}>
            Resolved · {wonSide}
          </span>
        </div>
        {resolution?.rationale ? (
          <p className="text-muted small mb-2" style={{ whiteSpace: 'pre-wrap' }}>{resolution.rationale}</p>
        ) : (
          <p className="text-muted small mb-2">Outcome settled on-chain.</p>
        )}
        {resolution?.oracle === 'chainlink' && <div className="mb-2"><ChainlinkBadge question={market.question} /></div>}
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
            {claiming ? 'Redeeming…' : `Redeem $${payout.toFixed(2)} USDC`}
          </button>
        )}
        {claimedTx && (
          <p className="mt-2 mb-0 small text-success">
            Redeemed · <a href={txUrl(claimedTx)} target="_blank" rel="noreferrer" className="text-success">view tx ↗</a>
          </p>
        )}
      </div>
    </div>
  )
}
