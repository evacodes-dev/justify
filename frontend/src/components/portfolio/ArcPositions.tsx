import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { type ApiMarket, type DemoMarket } from '../../lib/markets'
import { readShares, redeemPositions, redeemValue, txUrl } from '../../lib/arc'
import { useWallet } from '../../hooks/useWallet'
import { useUsdcBalance } from '../../hooks/useUsdcBalance'
import { useMarkets } from '../../hooks/useMarkets'

type Row = { demo: DemoMarket; api: ApiMarket; yesShares: number; noShares: number }

function PositionCard({ row, onClaimed }: { row: Row; onClaimed: () => void }) {
  const { demo, api, yesShares, noShares } = row
  const { getChainWalletClient } = useWallet()
  const [phase, setPhase] = useState<'idle' | 'signing' | 'done' | 'error'>('idle')
  const [hash, setHash] = useState('')
  const [err, setErr] = useState('')

  const wonSide = api.outcome === 1 ? 'YES' : api.outcome === 0 ? 'NO' : 'INVALID'
  const payout = redeemValue(api.outcome, yesShares, noShares)
  const canClaim = api.resolved && payout > 0 && !!api.conditionId

  const claim = async () => {
    if (!api.conditionId) return
    setPhase('signing')
    setErr('')
    try {
      const wc = await getChainWalletClient()
      const h = await redeemPositions(wc, api.conditionId)
      setHash(h)
      setPhase('done')
      onClaimed()
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || String(e))
      setPhase('error')
    }
  }

  return (
    <div className="bg-glass rounded-4 shadow-sm p-3 mb-3">
      <div className="d-flex align-items-center mb-2">
        <span className="me-2" style={{ fontSize: 22 }}>{demo.emoji}</span>
        <Link to={`/trade/m/${demo.id}`} className="text-decoration-none text-body fw-bold flex-grow-1">
          {demo.question}
        </Link>
        {api.resolved ? (
          <span className={`badge ${wonSide === 'YES' ? 'bg-success' : wonSide === 'NO' ? 'bg-danger' : 'bg-warning text-dark'}`}>Resolved · {wonSide}</span>
        ) : (
          <span className="badge bg-primary">{Math.round(api.priceYes * 100)}% YES</span>
        )}
      </div>
      <div className="d-flex justify-content-between text-muted small">
        <span>Your YES: <span className="text-body">{yesShares.toFixed(2)}</span></span>
        <span>Your NO: <span className="text-body">{noShares.toFixed(2)}</span></span>
        {api.resolved && (
          <span>Payout: <span className="text-body">${payout.toFixed(2)}</span></span>
        )}
      </div>
      {canClaim && phase !== 'done' && (
        <button
          className="btn btn-primary btn-sm rounded-4 w-100 mt-3 fw-bold"
          disabled={phase === 'signing'}
          onClick={claim}
        >
          {phase === 'signing' ? 'Claiming…' : `Claim $${payout.toFixed(2)}`}
        </button>
      )}
      {phase === 'done' && (
        <p className="mt-2 mb-0 small text-success">
          Claimed ·{' '}
          <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="text-success">view tx ↗</a>
        </p>
      )}
      {phase === 'error' && (
        <p className="mt-2 mb-0 small text-danger" style={{ wordBreak: 'break-word' }}>{err}</p>
      )}
    </div>
  )
}

// Real on-chain positions for the connected wallet — ERC-1155 outcome shares in the
// Gnosis ConditionalTokens across all live markets.
export default function ArcPositions() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { balance, refresh: refreshBalance } = useUsdcBalance(address)
  const { markets } = useMarkets()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!address || markets.length === 0) {
      setRows([])
      return
    }
    setLoading(true)
    Promise.all(
      markets.map(({ demo, api }) =>
        readShares(api, address)
          .then(({ yesShares, noShares }) => ({ demo, api, yesShares, noShares }))
          .catch(() => null),
      ),
    )
      .then((all) => {
        const staked = all.filter((r): r is Row => !!r && (r.yesShares > 0 || r.noShares > 0))
        setRows(staked)
      })
      .finally(() => setLoading(false))
  }, [address, markets])

  useEffect(() => {
    load()
  }, [load])

  const onClaimed = () => {
    load()
    refreshBalance()
  }

  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="d-flex align-items-center mb-3">
        <h6 className="mb-0 fw-bold text-body flex-grow-1">Your positions</h6>
        {isLoggedIn && (
          <span className="badge bg-glass text-body">
            Balance: {balance == null ? '…' : `$${balance.toFixed(2)}`} USDC
          </span>
        )}
      </div>

      {!isLoggedIn ? (
        <div className="bg-glass rounded-4 shadow-sm p-4 text-center">
          <p className="text-muted mb-3">Connect your wallet to see your positions.</p>
          <button className="btn btn-primary rounded-4 fw-bold" onClick={promptLogin}>Sign In +</button>
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="text-center py-3">
          <div className="spinner-border spinner-border-sm" role="status" />
          <p className="text-muted mb-0 mt-2 small">Reading positions on-chain…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-glass rounded-4 shadow-sm p-4 text-center">
          <p className="text-muted mb-3">No positions yet.</p>
          <Link to="/market" className="btn btn-primary rounded-4 fw-bold text-decoration-none">Explore markets</Link>
        </div>
      ) : (
        rows.map((row) => <PositionCard key={row.demo.id} row={row} onClaimed={onClaimed} />)
      )}
    </div>
  )
}
