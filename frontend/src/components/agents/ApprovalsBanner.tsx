import { useCallback, useEffect, useState } from 'react'
import { listApprovals, resolveApproval, type Approval } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { txUrl } from '../../lib/arc'

// Human-in-the-loop (TZ Part 3): when an agent has a pending large bet, show a
// banner asking the owner to approve. Approve → POST /api/approvals/:id (the
// backend re-verifies World ID and executes the bet from the agent wallet).
export default function ApprovalsBanner() {
  const { address } = useWallet()
  const toast = useToast()
  const [pending, setPending] = useState<Approval[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!address) { setPending([]); return }
    listApprovals(address)
      .then((b) => setPending((b.approvals ?? []).filter((a) => a.status === 'pending')))
      .catch(() => {})
  }, [address])

  useEffect(() => {
    refresh()
    if (!address) return
    const t = setInterval(refresh, 12000)
    return () => clearInterval(t)
  }, [refresh, address])

  if (pending.length === 0) return null
  const a = pending[0]

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action)
    try {
      const r = await resolveApproval(a.id, action)
      if (action === 'approve') {
        toast.show(`Approved — agent bet executed`, { kind: 'success', href: r.tx ? txUrl(r.tx) : undefined, hrefLabel: 'View tx ↗' })
      } else {
        toast.show('Bet rejected', { kind: 'info' })
      }
      refresh()
    } catch (e: any) {
      toast.show(e?.message || 'Approval needs World ID verification', { kind: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="bg-brown-gradient rounded-4 shadow-sm border-0 p-3"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 1075, maxWidth: 520, margin: '0 auto' }}
    >
      <div className="d-flex align-items-start">
        <span className="me-2" style={{ fontSize: 20 }}>🤖</span>
        <div className="flex-grow-1">
          <p className="text-body fw-bold mb-1">
            {a.agent} wants to bet ${a.amountUsdc} on {a.side}
          </p>
          <p className="text-muted small mb-1">{a.marketQuestion}</p>
          <p className="text-muted small mb-2" style={{ fontStyle: 'italic' }}>{a.reasoning}</p>
          <div className="d-flex gap-2">
            <button className="btn btn-primary btn-sm rounded-4 fw-bold flex-grow-1" disabled={!!busy} onClick={() => act('approve')}>
              {busy === 'approve' ? 'Approving…' : 'Approve (World ID)'}
            </button>
            <button className="btn btn-outline-secondary btn-sm rounded-4 text-body" disabled={!!busy} onClick={() => act('reject')}>
              {busy === 'reject' ? '…' : 'Reject'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
