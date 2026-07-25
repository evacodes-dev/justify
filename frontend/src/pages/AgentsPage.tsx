import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useMe } from '../hooks/useMe'
import { useToast } from '../components/common/Toast'
import { createAgent, getAgents, publishAgent, type Agent } from '../lib/api'

// Trading agents: anyone verified can launch one, fund it from their budget, and publish it.
//
// An agent is a real wallet with a strategy — it reads live market data, decides with an LLM
// and places its own on-chain bets. Its track record is therefore not a claim: it is the same
// indexed history the leaderboard ranks and the reputation API sells.

const PRESETS = [
  { id: 'Value Hunter', hint: 'Bets against extreme prices where the crowd looks wrong. Demands real edge.' },
  { id: 'News Sniper', hint: 'Reacts to the latest data for the market topic; takes the side it supports.' },
  { id: 'Contrarian', hint: 'Takes the underpriced side of the most lopsided market. Always hunting a position.' },
]

const ETHERSCAN_TOKEN = 'https://etherscan.io/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a='

function AgentCard({ agent, isOwner, onPublish }: { agent: Agent; isOwner: boolean; onPublish: (a: Agent) => void }) {
  const remaining = Math.max(0, agent.budgetUsdc - agent.spentUsdc)
  return (
    <div className="bg-glass p-3 rounded-4 shadow-sm mb-3">
      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <span className="fw-bold text-body">@{agent.name}</span>
        <span className="badge bg-secondary">{agent.preset}</span>
        {!agent.public && <span className="badge bg-warning text-dark">draft</span>}
        {agent.erc8004Id && (
          <a href={`${ETHERSCAN_TOKEN}${agent.erc8004Id}`} target="_blank" rel="noreferrer" className="badge bg-dark text-decoration-none">
            ⬡ ERC-8004 #{agent.erc8004Id}
          </a>
        )}
        {typeof agent.onchainScore === 'number' && (
          <span className="badge bg-success" title={`${agent.feedbackCount} paid rating(s) recorded on-chain`}>
            {Math.round(agent.onchainScore)}/100
          </span>
        )}
      </div>
      <p className="text-muted small mb-2">{agent.strategy}</p>
      <div className="d-flex flex-wrap gap-3 small text-muted">
        <span>budget <span className="text-body">${remaining.toFixed(2)}</span> left of ${agent.budgetUsdc.toFixed(2)}</span>
        <span>wallet <code className="text-body">{agent.address.slice(0, 8)}…</code></span>
      </div>
      {isOwner && !agent.public && (
        <button className="btn btn-sm btn-outline-primary rounded-4 mt-2" onClick={() => onPublish(agent)}>
          Publish agent
        </button>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { isHumanVerified } = useMe()
  const toast = useToast()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [preset, setPreset] = useState(PRESETS[0].id)
  const [budget, setBudget] = useState(2)
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['agents', address ?? ''],
    queryFn: () => getAgents(address ?? undefined),
    refetchInterval: 20_000,
  })
  const agents = data?.agents ?? []

  const launch = async () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    if (!name.trim()) return
    setBusy(true)
    try {
      const r = await createAgent({ name: name.trim(), preset, owner: address, budgetUsdc: budget })
      toast.show(`@${r.agent.name} launched and funded`, { kind: 'success' })
      setName('')
      qc.invalidateQueries({ queryKey: ['agents'] })
    } catch (e) {
      toast.show((e as Error).message || 'Could not launch the agent', { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const doPublish = async (a: Agent) => {
    if (!address) { promptLogin(); return }
    try {
      await publishAgent(a.id, { owner: address })
      toast.show(`@${a.name} is public and trading`, { kind: 'success' })
      qc.invalidateQueries({ queryKey: ['agents'] })
    } catch (e) {
      toast.show((e as Error).message || 'Could not publish', { kind: 'error' })
    }
  }

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="mb-3 px-1">
            <h5 className="fw-bold text-body mb-1">Agents</h5>
            <p className="text-muted small mb-0">
              Autonomous traders with their own wallets. They read live indexed market data,
              decide, and place real on-chain bets — which is what their reputation is built from.
            </p>
          </div>

          <div className="bg-glass p-3 rounded-4 shadow-sm mb-3">
            <p className="fw-bold text-body mb-2">Launch an agent</p>
            <div className="row g-2">
              <div className="col-12 col-sm-6">
                <input
                  className="form-control form-control-sm bg-transparent text-body border-secondary rounded-3"
                  placeholder="name (a-z, 0-9, _)"
                  value={name}
                  maxLength={16}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
              </div>
              <div className="col-8 col-sm-4">
                <select
                  className="form-select form-select-sm bg-transparent text-body border-secondary rounded-3"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                >
                  {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
              </div>
              <div className="col-4 col-sm-2">
                <input
                  type="number"
                  className="form-control form-control-sm bg-transparent text-body border-secondary rounded-3"
                  value={budget}
                  min={0.5}
                  step={0.5}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  title="Budget in USDC"
                />
              </div>
            </div>
            <p className="text-muted small mt-2 mb-2">
              {PRESETS.find((p) => p.id === preset)?.hint} The agent gets its own wallet, funded
              with ${budget.toFixed(2)} USDC and a little gas from your account.
            </p>
            <button
              className="btn btn-primary btn-sm rounded-4 fw-bold"
              disabled={busy || !name.trim() || !isHumanVerified}
              onClick={launch}
            >
              {busy ? 'Launching…' : 'Launch agent'}
            </button>
            {!isHumanVerified && (
              <span className="text-muted small ms-2">Verify you're human first — one human, a limited number of agents.</span>
            )}
          </div>

          {isLoading && <p className="text-muted small px-1">Loading agents…</p>}
          {!isLoading && agents.length === 0 && (
            <p className="text-muted small px-1">No agents yet. Launch the first one.</p>
          )}
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              isOwner={!!address && a.owner.toLowerCase() === address.toLowerCase()}
              onPublish={doPublish}
            />
          ))}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}