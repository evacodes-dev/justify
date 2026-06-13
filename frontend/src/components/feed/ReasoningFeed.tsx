import { useCallback, useEffect, useRef, useState } from 'react'
import { listFeed, runAgentTick, type FeedPost } from '../../lib/api'
import { txUrl } from '../../lib/arc'
import { useToast } from '../common/Toast'

// Pop-in animation for new agent decisions, scoped to this feed.
const css = `
.rf-card { animation: rfIn .45s ease both; }
@keyframes rfIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
.rf-reason { font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace; font-size: 13px;
  background: rgba(0,0,0,.25); border-radius: 12px; padding: 12px; white-space: pre-wrap; }
.rf-chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,.08); }
`

function confColor(c?: number) {
  if (c == null) return '#7d8590'
  return c >= 0.66 ? '#3fb950' : c >= 0.4 ? '#d29922' : '#f0883e'
}

function ReasoningCard({ p }: { p: FeedPost }) {
  const est = p.estProb != null ? Math.round(p.estProb * 100) : null
  const imp = p.impliedProb != null ? Math.round(p.impliedProb * 100) : null
  return (
    <div className="border-bottom py-3 px-lg-3 rf-card">
      <div className="bg-glass p-3 rounded-4 shadow-sm" style={{ borderLeft: `3px solid ${confColor(p.confidence)}` }}>
        <div className="d-flex align-items-center mb-2">
          <span className="me-2" style={{ fontSize: 18 }}>🤖</span>
          <span className="fw-bold text-body">{p.agent}</span>
          {p.humanBacked && <span className="badge bg-success ms-2" title="proof-of-human (World ID)">human-backed ✓</span>}
          {p.confidence != null && (
            <span className="ms-2 rf-chip" style={{ color: confColor(p.confidence) }}>conf {Math.round(p.confidence * 100)}%</span>
          )}
          <small className="text-muted ms-auto">{new Date(p.ts).toLocaleTimeString()}</small>
        </div>

        {p.action === 'skip' ? (
          <div className="badge bg-secondary mb-2">⏭ skipped</div>
        ) : (
          <div className={`badge mb-2 ${p.action === 'request_approval' ? 'bg-warning text-dark' : p.side === 'YES' ? 'bg-success' : 'bg-danger'}`}>
            {p.action === 'request_approval' ? '⏳ awaiting human approval · ' : '● '}
            {p.side ?? ''} {p.amountUsdc ? `$${p.amountUsdc}` : ''}
          </div>
        )}

        {p.marketQuestion && <p className="text-body fw-bold mb-2">{p.marketQuestion}</p>}

        {est != null && imp != null && (
          <div className="d-flex gap-3 small mb-2">
            <span>agent est <b style={{ color: confColor(p.confidence) }}>{est}% YES</b></span>
            <span className="text-muted">vs market {imp}%</span>
            {p.edge != null && <span className="text-primary">edge {Math.round(p.edge * 100)}pp</span>}
          </div>
        )}

        <div className="rf-reason text-body mb-2">{p.reasoning}</div>

        {p.dataUsed && p.dataUsed.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            {p.dataUsed.map((d, i) => (
              <span key={i} className="rf-chip text-muted">{d.label}{d.value ? `: ${d.value}` : ''}</span>
            ))}
          </div>
        )}

        <div className="d-flex align-items-center">
          <a href="#" className="text-muted text-decoration-none d-flex align-items-center me-3" onClick={(e) => e.preventDefault()}>
            <span className="material-icons md-20 me-1">favorite_border</span><small>Like</small>
          </a>
          <a href="#" className="text-muted text-decoration-none d-flex align-items-center" onClick={(e) => e.preventDefault()}>
            <span className="material-icons md-20 me-1">person_add</span><small>Follow agent</small>
          </a>
          {p.tx && (
            <a href={txUrl(p.tx)} target="_blank" rel="noreferrer" className="text-primary text-decoration-none ms-auto small">
              tx on Arc ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// Real-time AI-agent decision feed (TZ Part 3): polls GET /api/agent/tick, new
// decisions animate in at the top. "Run agent now" triggers a tick.
export default function ReasoningFeed() {
  const [feed, setFeed] = useState<FeedPost[]>([])
  const [running, setRunning] = useState(false)
  const [offline, setOffline] = useState(false)
  const toast = useToast()
  const timer = useRef<ReturnType<typeof setInterval>>()

  const refresh = useCallback(() => {
    listFeed()
      .then((b) => { setFeed(b.feed ?? []); setOffline(false) })
      .catch(() => setOffline(true))
  }, [])

  useEffect(() => {
    refresh()
    timer.current = setInterval(refresh, 10000)
    return () => clearInterval(timer.current)
  }, [refresh])

  const tick = async () => {
    setRunning(true)
    try {
      await runAgentTick()
      refresh()
    } catch (e: any) {
      toast.show(e?.message || 'Agent run failed (backend offline?)', { kind: 'error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <style>{css}</style>
      <div className="d-flex align-items-center justify-content-between mb-2 px-lg-3">
        <h6 className="mb-0 fw-bold text-body">🤖 Live agent activity</h6>
        <button className="btn btn-primary btn-sm rounded-4 fw-bold" disabled={running} onClick={tick}>
          {running ? 'thinking…' : 'Run agent now'}
        </button>
      </div>
      <div className="feeds">
        {offline && feed.length === 0 && (
          <div className="px-lg-3 py-3"><div className="bg-glass rounded-4 p-4 text-center text-muted">
            Agent feed is offline — start the backend (<code>npm run dev</code> in <code>/app</code>) to see live AI decisions.
          </div></div>
        )}
        {!offline && feed.length === 0 && (
          <div className="px-lg-3 py-3"><div className="bg-glass rounded-4 p-4 text-center text-muted">
            No agent activity yet — click “Run agent now”.
          </div></div>
        )}
        {feed.map((p) => <ReasoningCard key={p.ts} p={p} />)}
      </div>
    </div>
  )
}
