import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import WorldIdConfirm from '../components/common/WorldIdConfirm'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'
import { listAgents, createAgent, publishAgent, type PublicAgent } from '../lib/api'

const PRESETS = ['Value Hunter', 'News Sniper', 'Contrarian']
const MAX_AGENTS = 3 // anti-sybil cap per person (TZ killer criterion)

function AgentCard({ agent, isOwner, onPublish }: {
  agent: PublicAgent
  isOwner: boolean
  onPublish: (agent: PublicAgent, proof: { rp_id?: string; idkitResponse?: unknown }) => Promise<void>
}) {
  const [active, setActive] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const rec = agent.record ?? { w: 0, l: 0 }
  const total = rec.w + rec.l
  const accuracy = total ? Math.round((rec.w / total) * 100) : 0
  const isDraft = agent.public === false

  const doPublish = async (proof: { rp_id?: string; idkitResponse?: unknown }) => {
    setPublishing(true)
    try { await onPublish(agent, proof) } finally { setPublishing(false) }
  }

  return (
    <div className="bg-glass rounded-4 shadow-sm p-3 mb-3">
      <div className="d-flex align-items-center mb-2">
        <span className="material-icons me-2" style={{ fontSize: 20 }}>smart_toy</span>
        <Link to={`/agents/${encodeURIComponent(agent.name)}`} className="text-decoration-none text-body fw-bold flex-grow-1">
          {agent.name}
        </Link>
        {isDraft ? (
          <span className="badge bg-warning text-dark me-2" title="Not public yet — confirm with World ID to publish">Draft · private</span>
        ) : (
          <span className="badge bg-success me-2" title="proof-of-human (AgentKit)">human-backed ✓</span>
        )}
        {!isDraft && (
          isOwner ? (
            <div className="form-check form-switch m-0" title="Pause / resume your agent">
              <input className="form-check-input" type="checkbox" role="switch" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </div>
          ) : (
            <div className="form-check form-switch m-0" title="You can only manage your own agents">
              <input className="form-check-input" type="checkbox" role="switch" checked disabled readOnly />
            </div>
          )
        )}
      </div>
      <div className="d-flex justify-content-between text-muted small">
        <span>{agent.preset}</span>
        <span>Accuracy: <span className="text-body">{accuracy}%</span></span>
        <span>Record: <span className="text-body">{rec.w}W / {rec.l}L</span></span>
        <span className={isDraft ? 'text-warning' : active ? 'text-success' : 'text-muted'}>
          {isDraft ? '○ not published' : active ? '● active' : '⏸ paused'}
        </span>
      </div>
      {isDraft && isOwner && (
        <div className="mt-3">
          <p className="text-muted small mb-2">This bot is private and not trading yet. Confirm with World ID to make it public.</p>
          <WorldIdConfirm
            label="Publish (World ID)"
            busyLabel="Publishing…"
            busy={publishing}
            className="btn btn-primary btn-sm rounded-4 fw-bold w-100"
            onConfirm={doPublish}
          />
        </div>
      )}
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
    listAgents(address) // include my own drafts so I can publish them
      .then((b) => { setAgents(b.agents ?? []); setOffline(false) })
      .catch(() => setOffline(true))
  }, [address])

  useEffect(() => { refresh() }, [refresh])

  const mine = address ? agents.filter((a) => a.owner?.toLowerCase() === address.toLowerCase()) : []
  const atLimit = mine.length >= MAX_AGENTS

  const publish = async (agent: PublicAgent, proof: { rp_id?: string; idkitResponse?: unknown }) => {
    try {
      await publishAgent(agent.id, { owner: address, ...proof })
      toast.show(`“${agent.name}” is now public`, { kind: 'success' })
      refresh()
    } catch (e: any) {
      toast.show(e?.message || 'Publish failed', { kind: 'error' })
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) { promptLogin(); return }
    if (!name.trim() || atLimit) return
    setCreating(true)
    try {
      await createAgent({ name: name.trim(), preset, owner: address })
      toast.show(`Agent “${name.trim()}” created as a draft — confirm with World ID to publish`, { kind: 'success' })
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
                onPublish={publish}
              />
            ))
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
