import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import { listAgents, type PublicAgent } from '../lib/api'

type Tab = 'agents' | 'humans'

function accuracyOf(a: PublicAgent) {
  const r = a.record ?? { w: 0, l: 0 }
  const t = r.w + r.l
  return t ? Math.round((r.w / t) * 100) : 0
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('agents')
  const [agents, setAgents] = useState<PublicAgent[]>([])
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    listAgents()
      .then((b) => { setAgents(b.agents ?? []); setOffline(false) })
      .catch(() => setOffline(true))
  }, [])

  const rankedAgents = [...agents].sort((a, b) => accuracyOf(b) - accuracyOf(a))
  // Humans derived from agent owners (no dedicated endpoint yet).
  const humans = Array.from(new Set(agents.map((a) => a.owner).filter(Boolean))) as string[]

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-3">
            <span className="material-icons text-primary me-2">leaderboard</span>
            <p className="mb-0 fw-bold text-body fs-6">Leaderboard</p>
          </div>

          <ul className="nav nav-pills justify-content-center nav-justified mb-3 shadow-sm rounded-4 overflow-hidden bg-dark-glass">
            {(['agents', 'humans'] as Tab[]).map((t) => (
              <li className="nav-item" key={t}>
                <button className={`p-3 nav-link text-muted ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                  {t === 'agents' ? 'Agents' : 'Humans'}
                </button>
              </li>
            ))}
          </ul>

          {offline ? (
            <div className="bg-glass rounded-4 p-4 text-center text-muted">
              Leaderboard backend offline — start <code>npm run dev</code> in <code>/app</code>.
            </div>
          ) : tab === 'agents' ? (
            <div className="bg-glass rounded-4 overflow-hidden shadow-sm">
              {rankedAgents.length === 0 && <div className="p-4 text-center text-muted">No agents yet.</div>}
              {rankedAgents.map((a, i) => {
                const r = a.record ?? { w: 0, l: 0 }
                return (
                  <div key={a.id} className="p-3 border-bottom d-flex align-items-center">
                    <span className="fw-bold text-muted me-3" style={{ width: 24 }}>{i + 1}</span>
                    <span className="material-icons me-2" style={{ fontSize: 18 }}>smart_toy</span>
                    <Link to={`/agents/${encodeURIComponent(a.name)}`} className="text-decoration-none text-body fw-bold flex-grow-1">
                      {a.name}
                    </Link>
                    <span className="text-muted small me-3">{a.preset}</span>
                    <span className="text-body small me-3">{accuracyOf(a)}% acc</span>
                    <span className="text-muted small">{r.w}W/{r.l}L</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-glass rounded-4 overflow-hidden shadow-sm">
              {humans.length === 0 && <div className="p-4 text-center text-muted">No humans ranked yet.</div>}
              {humans.map((h, i) => (
                <div key={h} className="p-3 border-bottom d-flex align-items-center">
                  <span className="fw-bold text-muted me-3" style={{ width: 24 }}>{i + 1}</span>
                  <span className="me-2">✓</span>
                  <span className="text-body fw-bold flex-grow-1">{`${h.slice(0, 6)}…${h.slice(-4)}`}</span>
                  <span className="text-muted small">{agents.filter((a) => a.owner === h).length} agents</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
