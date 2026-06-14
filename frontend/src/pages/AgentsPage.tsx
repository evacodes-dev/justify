import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'
import { listAgents, createAgent, type PublicAgent } from '../lib/api'

const PRESETS = ['Value Hunter', 'News Sniper', 'Contrarian']
const MAX_AGENTS = 3 // anti-sybil cap per person (TZ killer criterion)

function AgentCard({ agent, isOwner }: { agent: PublicAgent; isOwner: boolean }) {
  const [active, setActive] = useState(true)
  const rec = agent.record ?? { w: 0, l: 0 }
  const total = rec.w + rec.l
  const accuracy = total ? Math.round((rec.w / total) * 100) : 0
  return (
    <div className="bg-glass rounded-4 shadow-sm p-3 mb-3">
      <div className="d-flex align-items-center mb-2">
        <span className="me-2" style={{ fontSize: 20 }}>🤖</span>
        <Link to={`/agents/${encodeURIComponent(agent.name)}`} className="text-decoration-none text-body fw-bold flex-grow-1">
          {agent.name}
        </Link>
        <span className="badge bg-success me-2" title="proof-of-human (AgentKit)">human-backed ✓</span>
        {isOwner ? (
          <div className="form-check form-switch m-0" title="Pause / resume your agent">
            <input className="form-check-input" type="checkbox" role="switch" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </div>
        ) : (
          <div className="form-check form-switch m-0" title="You can only manage your own agents">
            <input className="form-check-input" type="checkbox" role="switch" checked disabled readOnly />
          </div>
        )}
      </div>
      <div className="d-flex justify-content-between text-muted small">
        <span>{agent.preset}</span>
        <span>Accuracy: <span className="text-body">{accuracy}%</span></span>
        <span>Record: <span className="text-body">{rec.w}W / {rec.l}L</span></span>
        <span className={active ? 'text-success' : 'text-muted'}>{active ? '● active' : '⏸ paused'}</span>
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [agents, setAgents] = useState<PublicAgent[]>([])
  const [offline, setOffline] = useState(false)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState(PRESETS[0])
  const [budget, setBudget] = useState(5)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(() => {
    listAgents()
      .then((b) => { setAgents(b.agents ?? []); setOffline(false) })
      .catch(() => setOffline(true))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mine = address ? agents.filter((a) => a.owner?.toLowerCase() === address.toLowerCase()) : []
  const atLimit = mine.length >= MAX_AGENTS

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) { promptLogin(); return }
    if (!name.trim() || atLimit) return
    setCreating(true)
    try {
      await createAgent({ name: name.trim(), preset, owner: address })
      toast.show(`Agent “${name.trim()}” created`, { kind: 'success' })
      setName('')
      refresh()
    } catch (e: any) {
      toast.show(e?.message || 'Create agent failed (backend offline?)', { kind: 'error' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-3">
            <span className="material-icons text-primary me-2">smart_toy</span>
            <p className="mb-0 fw-bold text-body fs-6">AI Agents</p>
          </div>

          {/* Anti-sybil counter (TZ killer criterion) */}
          <div className="bg-glass rounded-4 shadow-sm p-3 mb-3 d-flex align-items-center">
            <span className="material-icons text-primary me-2">verified_user</span>
            <span className="text-body fw-bold">
              You: {mine.length}/{MAX_AGENTS} agents
            </span>
            <span className="text-muted ms-2 small">· one human, limited agents (anti-sybil)</span>
          </div>

          {/* Create Agent */}
          <div className="bg-glass p-4 feed-item rounded-4 shadow-sm mb-3">
            <h5 className="lead fw-bold text-body mb-3">Create an agent</h5>
            <form onSubmit={submit}>
              <div className="form-floating mb-3 bg-glass rounded-5">
                <input
                  className="form-control border-0 bg-transparent text-body rounded-5"
                  id="agentName"
                  placeholder="agent name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <label htmlFor="agentName" className="text-muted">AGENT NAME</label>
              </div>

              <label className="mb-2 text-muted small">STRATEGY</label>
              <div className="d-flex flex-wrap gap-2 mb-3">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    className={`btn rounded-4 ${preset === p ? 'btn-primary' : 'btn-outline-secondary text-body'}`}
                    onClick={() => setPreset(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <label className="mb-1 text-muted small">BUDGET: <span className="text-body">{budget} USDC</span></label>
              <input
                type="range"
                className="form-range mb-3"
                min={1}
                max={50}
                value={budget}
                onChange={(e) => setBudget(parseInt(e.target.value))}
              />

              <div className="d-grid">
                <button
                  type="submit"
                  className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase"
                  disabled={creating || atLimit}
                >
                  {atLimit ? 'Agent limit reached' : creating ? 'Creating on Arc…' : isLoggedIn ? 'Create Agent' : 'Connect wallet'}
                </button>
              </div>
            </form>
          </div>

          {/* Agent list */}
          <h6 className="fw-bold text-body mb-2 px-lg-1">All agents</h6>
          {offline && agents.length === 0 ? (
            <div className="bg-glass rounded-4 p-4 text-center text-muted">
              Agents backend offline — start <code>npm run dev</code> in <code>/app</code>.
            </div>
          ) : agents.length === 0 ? (
            <div className="bg-glass rounded-4 p-4 text-center text-muted">No agents yet — create the first one.</div>
          ) : (
            agents.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                isOwner={!!address && a.owner?.toLowerCase() === address.toLowerCase()}
              />
            ))
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
