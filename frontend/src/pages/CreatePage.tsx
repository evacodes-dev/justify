import { useState, type FormEvent } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useUi } from '../components/layout/UiContext'
import { createMarket, verifyStatus } from '../lib/api'
import { COUNTRIES } from '../lib/countries'

const CATEGORIES = ['crypto', 'macro', 'politics', 'sports', 'general']
type Phase = 'idle' | 'creating' | 'done' | 'error'

export default function CreatePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { openModal } = useUi()
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('crypto')
  const [countries, setCountries] = useState<string[]>([])
  const [restricted, setRestricted] = useState(false)
  const [closeDays, setCloseDays] = useState(14)

  const toggleCountry = (code: string) =>
    setCountries((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]))
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<{ id: number; address: string; explorer: string } | null>(null)
  const [err, setErr] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) { promptLogin(); return }
    if (question.trim().length < 6) { setErr('Enter a clear market question (at least 6 chars).'); setPhase('error'); return }
    // Gate: market creation requires a World ID-verified human.
    const verified = address ? await verifyStatus(address) : false
    if (!verified) { openModal('onboard'); return }

    setPhase('creating'); setErr('')
    try {
      const r = await createMarket({ question: question.trim(), description: description.trim(), category, closeTimeDays: closeDays, creator: address, countries: category === 'politics' ? countries : [], restricted: category === 'politics' && restricted })
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

          <div className="feeds">
            <div className="bg-glass p-4 feed-item rounded-4 shadow-sm mb-3">
              <p className="text-muted small mb-3">
                Binary YES/NO market on Arc. Resolves automatically via the oracle (price feeds or LLM) at close time.
                Requires a World ID-verified human.
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

                {category === 'politics' && (
                  <div className="mb-3">
                    <label className="text-muted small d-block mb-2">COUNTRIES (for politicians)</label>
                    <div className="d-flex flex-wrap gap-3">
                      {COUNTRIES.map((c) => (
                        <div className="form-check" key={c.code}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`country-${c.code}`}
                            checked={countries.includes(c.code)}
                            onChange={() => toggleCountry(c.code)}
                          />
                          <label className="form-check-label text-body small" htmlFor={`country-${c.code}`}>
                            {c.name}
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-muted small mt-2 mb-0">
                      {countries.length ? `Selected: ${countries.join(', ')}` : 'Optional — pick the countries this market is about.'}
                    </p>
                    {countries.length > 0 && (
                      <div className="form-check form-switch mt-2">
                        <input className="form-check-input" type="checkbox" id="restrict" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
                        <label className="form-check-label text-body small" htmlFor="restrict">
                          Only verified humans from these countries can bet (World ID country-gate)
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <div className="d-grid">
                  <button type="submit" className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase m-0" disabled={phase === 'creating'}>
                    {phase === 'creating' ? 'Deploying on Arc…' : 'Create market'}
                  </button>
                </div>

                {phase === 'done' && result && (
                  <div className="alert alert-success mt-3 mb-0 rounded-4" role="alert">
                    Market #{result.id} deployed on Arc.{' '}
                    <a href={result.explorer + '/address/' + result.address} target="_blank" rel="noreferrer" className="fw-bold">View on Arcscan ↗</a>
                    <div className="small text-break mt-1">{result.address}</div>
                  </div>
                )}
                {phase === 'error' && <div className="alert alert-danger mt-3 mb-0 rounded-4 text-break" role="alert">{err}</div>}
              </form>
            </div>
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
