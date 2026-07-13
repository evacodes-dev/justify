import { useEffect, useState } from 'react'
import type { ApiMarket } from '../../lib/markets'
import { challengeProposal, redeemPositions, redeemValue, txUrl } from '../../lib/arc'
import { useCtfShares } from '../../hooks/useArcMarket'
import { getProposal, getResolution, type ProposalState, type Resolution } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import ChainlinkBadge from '../market/ChainlinkBadge'

const OUTCOME_LABEL: Record<number, string> = { 0: 'NO', 1: 'YES', 2: 'INVALID' }
const outcomeBadge = (o: number | null | undefined) =>
  o === 1 ? 'bg-success' : o === 0 ? 'bg-danger' : 'bg-warning text-dark'

function remainingLabel(endsAt: number): string {
  const ms = endsAt - Date.now()
  if (ms <= 0) return 'ending now'
  const h = Math.floor(ms / 3_600e3)
  const m = Math.floor((ms % 3_600e3) / 60e3)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

// Market-detail resolution block over the Gnosis CTF:
// - closed but not finalized → live optimistic-settler state: the proposed outcome,
//   the AI rationale, the challenge countdown, and a challenge form (anyone can
//   dispute; position holders get an explicit nudge). Challenges escalate to UMA.
// - resolved → outcome + oracle justification + redeemPositions for winners/INVALID.
export default function ResolutionBlock({ market }: { market: ApiMarket }) {
  const { address, isLoggedIn, promptLogin, getChainWalletClient } = useWallet()
  const toast = useToast()
  const { shares, refresh } = useCtfShares(market, address)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [proposal, setProposal] = useState<ProposalState | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimedTx, setClaimedTx] = useState('')
  // challenge form
  const [showChallenge, setShowChallenge] = useState(false)
  const [counter, setCounter] = useState<0 | 1 | 2 | null>(null)
  const [evidence, setEvidence] = useState('')
  const [challenging, setChallenging] = useState(false)
  const [, forceTick] = useState(0) // re-render for the countdown label

  const closed = market.closeTime > 0 && market.closeTime * 1000 < Date.now()

  useEffect(() => {
    if (market.resolved) getResolution(market.id).then(setResolution).catch(() => {})
  }, [market.id, market.resolved])

  // While the market sits between closeTime and finalization, poll the settler state.
  useEffect(() => {
    if (market.resolved || !closed) return
    let alive = true
    const load = () => getProposal(market.id).then((p) => { if (alive) setProposal(p) })
    load()
    const t = setInterval(() => { load(); forceTick((x) => x + 1) }, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [market.id, market.resolved, closed])

  const holds = (shares?.yesShares ?? 0) + (shares?.noShares ?? 0) > 0

  const submitChallenge = async () => {
    if (!isLoggedIn) { promptLogin(); return }
    if (counter === null || evidence.trim().length < 10) return
    setChallenging(true)
    try {
      const wc = await getChainWalletClient()
      const { txHash, bond } = await challengeProposal(wc, market.id, counter, evidence.trim())
      toast.show(
        `Challenge submitted${bond > 0 ? ` (bond $${bond.toFixed(2)})` : ''} — escalated to UMA`,
        { kind: 'success', href: txUrl(txHash), hrefLabel: 'View tx ↗' },
      )
      setShowChallenge(false)
      getProposal(market.id).then(setProposal)
    } catch (e: any) {
      toast.show(e?.shortMessage || e?.message || 'Challenge failed', { kind: 'error' })
    } finally {
      setChallenging(false)
    }
  }

  // ── between closeTime and finalization: the optimistic challenge window ──
  if (!market.resolved) {
    if (!closed) return null

    const status = proposal?.status ?? 'none'
    const windowOpen = status === 'proposed' && !!proposal?.windowEndsAt && proposal.windowEndsAt > Date.now()

    return (
      <div className="px-lg-3 pb-3">
        <div className="bg-glass rounded-4 shadow-sm p-3">
          <div className="d-flex align-items-center mb-2 gap-2 flex-wrap">
            <h6 className="fw-bold text-body mb-0 flex-grow-1">Resolution</h6>
            {status === 'proposed' && proposal?.outcome != null && (
              <span className={`badge ${outcomeBadge(proposal.outcome)}`}>Proposed · {OUTCOME_LABEL[proposal.outcome]}</span>
            )}
            {status === 'challenged' && <span className="badge bg-warning text-dark">Challenged · UMA dispute</span>}
            {status === 'none' && <span className="badge bg-secondary">Awaiting proposal</span>}
          </div>

          {status === 'none' && (
            <p className="text-muted small mb-0">
              The market has closed. The oracle will propose an outcome shortly; it then sits in a
              public challenge window before it finalizes.
            </p>
          )}

          {status === 'proposed' && proposal && (
            <>
              {proposal.reason && (
                <p className="text-muted small mb-2" style={{ whiteSpace: 'pre-wrap' }}>{proposal.reason}</p>
              )}
              <div className="d-flex align-items-center gap-2 small mb-2">
                <span className="material-icons md-18 text-warning">hourglass_top</span>
                <span className="text-body">
                  Challenge window: <span className="fw-bold">{proposal.windowEndsAt ? remainingLabel(proposal.windowEndsAt) : '—'}</span>
                </span>
              </div>
              <p className="text-muted small mb-2">
                {holds
                  ? `You hold ${(shares!.yesShares).toFixed(2)} YES / ${(shares!.noShares).toFixed(2)} NO shares in this market. If you believe the proposed outcome is wrong, challenge it before the window closes — the dispute goes to UMA's Optimistic Oracle.`
                  : 'Anyone can dispute the proposed outcome during this window; disputes are escalated to UMA’s Optimistic Oracle. If nobody challenges, the outcome finalizes automatically.'}
              </p>

              {windowOpen && !showChallenge && (
                <button className="btn btn-outline-warning rounded-4 w-100 fw-bold" onClick={() => setShowChallenge(true)}>
                  Challenge this outcome
                </button>
              )}

              {windowOpen && showChallenge && (
                <div className="mt-2">
                  <p className="text-body small fw-bold mb-1">Your counter-outcome</p>
                  <div className="d-flex gap-2 mb-2">
                    {([1, 0, 2] as const).filter((o) => o !== proposal.outcome).map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={`btn btn-sm flex-grow-1 rounded-4 fw-bold ${
                          counter === o
                            ? o === 1 ? 'btn-success' : o === 0 ? 'btn-danger' : 'btn-warning'
                            : 'btn-outline-secondary text-body'
                        }`}
                        onClick={() => setCounter(o)}
                      >
                        {OUTCOME_LABEL[o]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="form-control bg-transparent text-body border-secondary rounded-3 mb-2"
                    rows={3}
                    placeholder="Evidence: why is the proposed outcome wrong? (posted publicly on-chain, min 10 chars)"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    disabled={challenging}
                  />
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-warning rounded-4 flex-grow-1 fw-bold"
                      disabled={challenging || counter === null || evidence.trim().length < 10}
                      onClick={submitChallenge}
                    >
                      {challenging ? 'Submitting challenge…' : 'Submit challenge to UMA'}
                    </button>
                    <button className="btn btn-outline-secondary rounded-4" disabled={challenging} onClick={() => setShowChallenge(false)}>
                      Cancel
                    </button>
                  </div>
                  <p className="text-muted mt-2 mb-0" style={{ fontSize: 12 }}>
                    A challenge posts UMA&apos;s minimum bond (currently $0 on testnet) and moves the decision
                    to UMA&apos;s Optimistic Oracle: your counter-claim stands unless disputed there, otherwise
                    UMA token holders vote.
                  </p>
                </div>
              )}
            </>
          )}

          {status === 'challenged' && proposal && (
            <>
              <p className="text-body small mb-1">
                Proposed <span className={`badge ${outcomeBadge(proposal.outcome)}`}>{OUTCOME_LABEL[proposal.outcome ?? 2]}</span> was
                challenged with <span className={`badge ${outcomeBadge(proposal.counterOutcome)}`}>{OUTCOME_LABEL[proposal.counterOutcome ?? 2]}</span> —
                the dispute is now with UMA&apos;s Optimistic Oracle.
              </p>
              <p className="text-muted small mb-0">
                The outcome finalizes once UMA settles the assertion (liveness period, then a DVM vote if disputed there).
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── resolved: outcome + rationale + redeem ──
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
