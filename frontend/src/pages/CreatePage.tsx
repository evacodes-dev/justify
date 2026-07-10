import { useEffect, useState, type FormEvent } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { createMarket, getMe } from '../lib/api'

const CATEGORIES = ['crypto', 'macro', 'politics', 'sports', 'general']
type Phase = 'idle' | 'creating' | 'done' | 'error'

// Market creation is a hand-granted role (admin API), NOT unlocked by World ID —
// verify only gives the checkmark. Non-creators see an explainer instead of the form.
export default function CreatePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('crypto')
  const [closeDays, setCloseDays] = useState(14)
  const [creator, setCreator] = useState<boolean | null>(null) // null = still loading

  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<{ id: number; address: string; explorer: string } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!address) { setCreator(false); return }
    setCreator(null)
    getMe(address)
      .then((b) => setCreator(!!b.user?.creator))
      .catch(() => setCreator(false))
  }, [address])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) { promptLogin(); return }
    if (question.trim().length < 6) { setErr('Enter a clear market question (at least 6 chars).'); setPhase('error'); return }

    setPhase('creating'); setErr('')
    try {
      const r = await createMarket({ question: question.trim(), description: description.trim(), category, closeTimeDays: closeDays, creator: address })
      setResult({ id: r.id, address: r.address, explorer: r.explorer })
      setPhase('done')
      setQuestion(''); setDescription('')
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
                <p className="text-muted small mb-3">
                  Binary YES/NO market on the audited Gnosis CTF stack. Resolves automatically via the oracle
                  (price feeds or LLM) at close time.
                </p>
                <form onSubmit={submit}>
                  <div className="form-floating mb-3">
                    <input
                      type="text" className="form-control rounded-4 bg-glass" id="mq"
                      value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will ... ?"
                    />
                    <label htmlFor="mq" className="text-muted">MARKET QUESTION</label>
                  </div>

                  <div className="form-floating mb-3">
                    <textarea
                      className="form-control rounded-4 bg-glass" id="md" style={{ height: 90 }}
                      value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="Context / resolution criteria"
                    />
                    <label htmlFor="md" className="text-muted">DESCRIPTION (optional)</label>
                  </div>

                  <div className="row g-3 mb-3">
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
                        <input
                          type="number" min={1} max={365} className="form-control rounded-4 bg-glass" id="mt"
                          value={closeDays} onChange={(e) => setCloseDays(parseInt(e.target.value) || 14)}
                        />
                        <label htmlFor="mt" className="text-muted">CLOSES IN (DAYS)</label>
                      </div>
                    </div>
                  </div>

                  <div className="d-grid">
                    <button type="submit" className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase m-0" disabled={phase === 'creating'}>
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
