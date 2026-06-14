import { useState } from 'react'
import { IDKitRequestWidget, orbLegacy, type RpContext } from '@worldcoin/idkit'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from './Toast'

const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID as `app_${string}`
const WORLD_RP_ID = import.meta.env.VITE_WORLD_RP_ID as string
const WORLD_ACTION = (import.meta.env.VITE_WORLD_ACTION as string) ?? 'create-market'
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === 'true'

// Reusable "confirm with World ID" button. Runs the real IDKit 4.0 flow and, on a
// verified proof, calls onConfirm({ rp_id, idkitResponse }). When World ID isn't
// configured or VITE_DEV_BYPASS=true it takes a no-proof path (the backend still
// gates that via ALLOW_DEV_VERIFY). Mirrors the onboarding widget setup.
export default function WorldIdConfirm({
  label, busyLabel, busy, disabled, className, onConfirm,
}: {
  label: string
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  className?: string
  onConfirm: (proof: { rp_id?: string; idkitResponse?: unknown }) => Promise<void> | void
}) {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [open, setOpen] = useState(false)

  const start = async () => {
    if (!isLoggedIn) { promptLogin(); return }
    // Dev / unconfigured: confirm without a proof (backend enforces ALLOW_DEV_VERIFY).
    if (!WORLD_APP_ID || DEV_BYPASS) { await onConfirm({}); return }
    try {
      const rp = await fetch('/api/rp-signature', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: WORLD_ACTION }),
      }).then((r) => r.json())
      setRpContext({ rp_id: WORLD_RP_ID, nonce: rp.nonce, created_at: rp.created_at, expires_at: rp.expires_at, signature: rp.sig })
      setOpen(true)
    } catch {
      toast.show('Could not start World ID. Is the backend running?', { kind: 'error' })
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={disabled || busy} onClick={start}>
        {busy ? (busyLabel ?? '…') : label}
      </button>
      {rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={WORLD_APP_ID}
          action={WORLD_ACTION}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment="staging"
          preset={orbLegacy({ signal: address ?? '' })}
          handleVerify={async (result) => { await onConfirm({ rp_id: WORLD_RP_ID, idkitResponse: result }) }}
          onSuccess={() => { setOpen(false) }}
        />
      )}
    </>
  )
}
