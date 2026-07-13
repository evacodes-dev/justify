import { useEffect, useMemo, useState, type FormEvent } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import MarketCard from '../components/market/MarketCard'
import { useWallet } from '../hooks/useWallet'
import { createMarket, getMe, type PriceConfig } from '../lib/api'
import { apiMarketToDemo, toUiMarket, type ApiMarket } from '../lib/markets'

const CATEGORIES = ['crypto', 'macro', 'politics', 'sports', 'general']
const ASSETS = ['ETH', 'BTC', 'LINK'] as const
type Phase = 'idle' | 'creating' | 'done' | 'error'
type Mode = 'price' | 'custom'

// default close: in 7 days, rounded to the hour, formatted for <input type="datetime-local">
function defaultClose(): string {
  const d = new Date(Date.now() + 7 * 86400e3)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

// Locale-proof price parsing: "1,785" (US thousands) → 1785; "1785,5" (EU decimal) → 1785.5;
// "1 785.50" → 1785.5. Naive Number("1,785") in a ru locale silently becomes 1.785 — a
// $1,785 target turning into $1.785 would resolve the market wrong.
function parseThreshold(raw: string): number {
  const s = raw.replace(/\s/g, '')
  if (!s) return NaN
  const commaAsThousands = /,\d{3}(?:[.,]|$)/.test(s) || (s.includes(',') && s.includes('.'))
  const normalized = commaAsThousands ? s.replace(/,/g, '') : s.replace(',', '.')
  return Number(normalized)
}

// Market creation is a hand-granted role (admin API), NOT unlocked by World ID —
// verify only gives the checkmark. Non-creators see an explainer instead of the form.
// Two modes: PRICE (structured -> deterministic Chainlink resolution, instant at close)
// and CUSTOM (free question + required resolution criteria -> AI + challenge window).
export default function CreatePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const [creator, setCreator] = useState<boolean | null>(null) // null = still loading
  const [myName, setMyName] = useState('')

  const [mode, setMode] = useState<Mode>('price')
  const [category, setCategory] = useState('crypto')
  const [closeAt, setCloseAt] = useState(defaultClose())
  // price mode
  const [asset, setAsset] = useState<(typeof ASSETS)[number]>('ETH')
  const [comparator, setComparator] = useState<'above' | 'below'>('above')
  const [threshold, setThreshold] = useState('')
  // custom mode
  const [question, setQuestion] = useState('')
  const [criteria, setCriteria] = useState('')

  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<{ id: number; address: string; explorer: string } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!address) { setCreator(false); return }
    setCreator(null)
    getMe(address)
      .then((b) => { setCreator(!!b.user?.creator); setMyName(b.user?.name ?? '') })
      .catch(() => setCreator(false))
  }, [address])

  const closeDate = useMemo(() => (closeAt ? new Date(closeAt) : null), [closeAt])
  const closeValid = !!closeDate && closeDate.getTime() > Date.now() + 30 * 60e3
  // local-time hint for the creator; canonical en-US date inside the on-chain question
  // (the question text is what the oracle and challengers read — keep it unambiguous)
  const closeHuman = closeDate
    ? closeDate.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
  const closeCanonical = closeDate
    ? closeDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
    : '—'

  const parsedThreshold = useMemo(() => parseThreshold(threshold), [threshold])

  // the question shown/created for price markets is composed from the structured fields
  const priceQuestion = useMemo(() => {
    if (!(parsedThreshold > 0)) return ''
    return `Will ${asset} be ${comparator} $${parsedThreshold.toLocaleString('en-US')} on ${closeCanonical}?`
  }, [asset, comparator, parsedThreshold, closeCanonical])

  const finalQuestion = mode === 'price' ? priceQuestion : question.trim()
  const canSubmit =
    closeValid &&
    (mode === 'price' ? parsedThreshold > 0 : finalQuestion.length >= 6 && criteria.trim().length >= 20)

  // live preview card (fabricated ApiMarket run through the real card pipeline)
  const preview = useMemo(() => {
    const fake: ApiMarket = {
      id: -1, address: '0x0000000000000000000000000000000000000000',
      question: finalQuestion || (mode === 'price' ? `Will ${asset} be ${comparator} $… on …?` : 'Your market question…'),
      metadataURI: JSON.stringify({ category }),
      priceYes: 0.5, volume: 0, resolved: false, closeTime: closeDate ? Math.floor(closeDate.getTime() / 1000) : 0,
      creator: address ?? '', creatorName: myName || 'you', likes: 0,
      conditionId: null, posYes: null, posNo: null,
    }
    return toUiMarket(apiMarketToDemo(fake), { yesPct: 50, total: 0, resolved: false, likes: 0 })
  }, [finalQuestion, category, closeDate, address, myName, mode, asset, comparator])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) { promptLogin(); return }
    if (!canSubmit) return
    setPhase('creating'); setErr('')
    try {
      const priceConfig: PriceConfig | undefined =
        mode === 'price' ? { asset, comparator, threshold: parsedThreshold } : undefined
      const r = await createMarket({
        question: finalQuestion,
        description: mode === 'custom' ? criteria.trim() : `Resolves automatically from the Chainlink ${asset}/USD feed at close time.`,
        category,
        closeTimeTs: Math.floor(closeDate!.getTime() / 1000),
        priceConfig,
        creator: address,
      })
      setResult({ id: r.id, address: r.address, explorer: r.explorer })
      setPhase('done')
      setQuestion(''); setCriteria(''); setThreshold('')
    } catch (e: any) {
      setErr(e?.message || String(e)); setPhase('error')
    }
  }

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-4">
            <span className="material-icons text-primary me-2">add_chart</span>
            <h4 className="mb-0 fw-bold text-body">Create a market</h4>
          </div>

          {!isLoggedIn ? (
            <div className="bg-glass p-4 rounded-4 text-center">
              <p className="text-muted mb-3">Connect your wallet to continue.</p>
              <button className="btn btn-primary rounded-5 px-4 py-2 fw-bold" onClick={promptLogin}>Connect wallet</button>
            </div>
          ) : creator === null ? (
            <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
          ) : !creator ? (
            <div className="bg-glass p-4 rounded-4 text-center">
              <span className="material-icons text-primary mb-2" style={{ fontSize: 44 }}>workspace_premium</span>
              <p className="text-body fw-bold mb-1">Market creation is available to creators</p>
              <p className="text-muted small mb-0">
                Creating markets is a curated role granted by the Justify team.
                Want to become a creator? Reach out to us and tell us what markets you'd run.
              </p>
            </div>
          ) : (
            <div className="feeds">
              <div className="bg-glass p-4 feed-item rounded-4 shadow-sm mb-3">
                <form onSubmit={submit}>
                  {/* mode toggle */}
                  <div className="d-flex gap-2 mb-3">
                    <button type="button"
                      className={`btn rounded-4 flex-fill fw-bold ${mode === 'price' ? 'btn-primary' : 'btn-outline-secondary text-body'}`}
                      onClick={() => setMode('price')}>
                      Price market
                      <div className="small fw-normal opacity-75">auto-resolves via Chainlink</div>
                    </button>
                    <button type="button"
                      className={`btn rounded-4 flex-fill fw-bold ${mode === 'custom' ? 'btn-primary' : 'btn-outline-secondary text-body'}`}
                      onClick={() => setMode('custom')}>
                      Custom question
                      <div className="small fw-normal opacity-75">AI oracle + challenge window</div>
                    </button>
                  </div>

                  {mode === 'price' ? (
                    <>
                      <div className="row g-3 mb-3">
                        <div className="col-4">
                          <div className="form-floating">
                            <select className="form-select rounded-4 bg-glass" id="pa" value={asset} onChange={(e) => setAsset(e.target.value as any)}>
                              {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <label htmlFor="pa" className="text-muted">ASSET</label>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="form-floating">
                            <select className="form-select rounded-4 bg-glass" id="pc" value={comparator} onChange={(e) => setComparator(e.target.value as any)}>
                              <option value="above">above</option>
                              <option value="below">below</option>
                            </select>
                            <label htmlFor="pc" className="text-muted">DIRECTION</label>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="form-floating">
                            <input type="text" inputMode="decimal" className="form-control rounded-4 bg-glass" id="pt"
                              value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="4000" />
                            <label htmlFor="pt" className="text-muted">TARGET $</label>
                          </div>
                        </div>
                      </div>
                      {threshold.trim() && (
                        <p className={`small mb-1 ${parsedThreshold > 0 ? 'text-body' : 'text-warning'}`}>
                          {parsedThreshold > 0 ? `Target parsed as $${parsedThreshold.toLocaleString('en-US')}` : 'Enter a valid price.'}
                        </p>
                      )}
                      <p className="text-muted small mb-3">
                        <span className="material-icons md-13 me-1 align-middle" style={{ fontSize: 14 }}>link</span>
                        Resolves on-chain from the Chainlink {asset}/USD feed the moment the market closes — no waiting, no disputes.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="form-floating mb-3">
                        <input type="text" className="form-control rounded-4 bg-glass" id="mq"
                          value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will ... ?" />
                        <label htmlFor="mq" className="text-muted">MARKET QUESTION</label>
                      </div>
                      <div className="form-floating mb-1">
                        <textarea className="form-control rounded-4 bg-glass" id="md" style={{ height: 110 }}
                          value={criteria} onChange={(e) => setCriteria(e.target.value)}
                          placeholder="Resolves YES if … according to <source> at close time." />
                        <label htmlFor="md" className="text-muted">RESOLUTION CRITERIA (required)</label>
                      </div>
                      <p className="text-muted small mb-3">
                        State exactly how and from what source this resolves — the AI oracle judges by it, and anyone can
                        challenge a wrong resolution during the 48h window. {criteria.trim().length < 20 && <span className="text-warning">Min 20 characters.</span>}
                      </p>
                    </>
                  )}

                  <div className="row g-3 mb-1">
                    <div className="col-6">
                      <div className="form-floating">
                        <select className="form-select rounded-4 bg-glass" id="mc" value={category} onChange={(e) => setCategory(e.target.value)}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <label htmlFor="mc" className="text-muted">CATEGORY</label>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="form-floating">
                        <input type="datetime-local" className="form-control rounded-4 bg-glass" id="mt"
                          value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
                        <label htmlFor="mt" className="text-muted">CLOSES AT</label>
                      </div>
                    </div>
                  </div>
                  <p className={`small mb-3 ${closeValid ? 'text-muted' : 'text-warning'}`}>
                    {closeValid ? `Closes ${closeHuman} (your local time)` : 'Close time must be at least 30 minutes from now.'}
                  </p>

                  {/* live preview */}
                  <label className="text-muted small d-block mb-2">PREVIEW</label>
                  <div className="mb-3" style={{ pointerEvents: 'none', opacity: 0.95 }}>
                    <MarketCard market={preview} />
                  </div>

                  <div className="d-grid">
                    <button type="submit" className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase m-0" disabled={phase === 'creating' || !canSubmit}>
                      {phase === 'creating' ? 'Deploying on-chain…' : 'Create market'}
                    </button>
                  </div>

                  {phase === 'done' && result && (
                    <div className="alert alert-success mt-3 mb-0 rounded-4" role="alert">
                      Market #{result.id} deployed.{' '}
                      <a href={result.explorer + '/address/' + result.address} target="_blank" rel="noreferrer" className="fw-bold">View in explorer ↗</a>
                      <div className="small text-break mt-1">{result.address}</div>
                    </div>
                  )}
                  {phase === 'error' && <div className="alert alert-danger mt-3 mb-0 rounded-4 text-break" role="alert">{err}</div>}
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
