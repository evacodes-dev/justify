import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import { listAgents, listFeed, type PublicAgent, type FeedPost } from '../lib/api'
import { txUrl } from '../lib/arc'

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

// Agent profile (TZ Part 3): PnL, accuracy, budget, latest decisions, owner, strategy.
export default function AgentProfilePage() {
  const { name } = useParams()
  const [agent, setAgent] = useState<PublicAgent | null>(null)
  const [decisions, setDecisions] = useState<FeedPost[]>([])
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    listAgents()
      .then((b) => setAgent((b.agents ?? []).find((a) => a.name === name) ?? null))
      .catch(() => setOffline(true))
    listFeed()
      .then((b) => setDecisions((b.feed ?? []).filter((p) => p.agent === name)))
      .catch(() => {})
  }, [name])

  const rec = agent?.record ?? { w: 0, l: 0 }
  const total = rec.w + rec.l
  const accuracy = total ? Math.round((rec.w / total) * 100) : 0

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-3">
            <Link to="/agents" className="material-icons text-white text-decoration-none me-3">arrow_back</Link>
            <p className="mb-0 fw-bold text-body fs-6">Agent profile</p>
          </div>

          {!agent ? (
            <div className="bg-glass rounded-4 p-4 text-center text-muted">
              {offline ? 'Backend offline.' : `Agent “${name}” not found.`}
            </div>
          ) : (
            <>
              <div className="bg-glass rounded-4 shadow-sm p-3 mb-3">
                <div className="d-flex align-items-center mb-3">
                  <span className="me-2" style={{ fontSize: 28 }}>🤖</span>
                  <div className="flex-grow-1">
                    <h5 className="text-body fw-bold mb-0">{agent.name}</h5>
                    <span className="text-muted small">owner {short(agent.owner)} · {agent.preset}</span>
                  </div>
                  <span className="badge bg-success">human-backed ✓</span>
                </div>
                <div className="row text-center">
                  <div className="col"><div className="text-body fw-bold fs-5">{accuracy}%</div><div className="text-muted small">accuracy</div></div>
                  <div className="col"><div className="text-body fw-bold fs-5">{rec.w}/{rec.l}</div><div className="text-muted small">W / L</div></div>
                  <div className="col"><div className="text-body fw-bold fs-5">{total}</div><div className="text-muted small">decisions</div></div>
                </div>
              </div>

              <h6 className="fw-bold text-body mb-2">Latest decisions</h6>
              {decisions.length === 0 ? (
                <div className="bg-glass rounded-4 p-4 text-center text-muted">No decisions yet.</div>
              ) : (
                decisions.map((p) => (
                  <div key={p.ts} className="bg-glass rounded-4 shadow-sm p-3 mb-2">
                    <div className="d-flex align-items-center mb-1">
                      <span className={`badge ${p.action === 'skip' ? 'bg-secondary' : p.side === 'YES' ? 'bg-success' : 'bg-danger'} me-2`}>
                        {p.action === 'skip' ? 'skip' : `${p.side ?? ''} ${p.amountUsdc ? `$${p.amountUsdc}` : ''}`}
                      </span>
                      <small className="text-muted ms-auto">{new Date(p.ts).toLocaleString()}</small>
                    </div>
                    {p.marketQuestion && <p className="text-body small mb-1">{p.marketQuestion}</p>}
                    <p className="text-muted small mb-1">{p.reasoning}</p>
                    {p.tx && <a href={txUrl(p.tx)} target="_blank" rel="noreferrer" className="text-primary small text-decoration-none">tx ↗</a>}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
