import { useEffect, useState } from 'react'
import { getJustification, type JustificationBundle } from '../../lib/api'

// Public 0G Storage gateway: serves the file bytes by Merkle root straight from the
// storage network — a neutral source, not our backend. (Mainnet has no storage explorer
// UI yet; storagescan.0g.ai currently just proxies to chainscan.)
const ZG_STORAGE_GATEWAY = 'https://indexer-storage-turbo.0g.ai'
const ZG_CHAIN_EXPLORER = 'https://chainscan.0g.ai'
const ZG_ATTESTATIONS = '0x9E10941b042e08C673623EE1Eb6d21E3a278A880'

const BUNDLE_RE = /0g:\/\/0x[0-9a-fA-F]{64}/

export const bundleUriIn = (reason: string | null | undefined): string | null =>
  reason?.match(BUNDLE_RE)?.[0] ?? null

/// The on-chain reason carries the pointer so it travels with the transaction, but the prose
/// reads better without it once the link is rendered properly.
export const stripBundleUri = (reason: string): string =>
  reason.replace(/\s*\[evidence:\s*0g:\/\/0x[0-9a-fA-F]{64}\]\s*/, ' ').trim()

// Evidence panel for a verdict produced on 0G Compute.
//
// Rendered while the proposal is still challengeable, not only after it finalizes — the whole
// reason this bundle exists is so somebody deciding whether to dispute can check the reasoning
// against the same indexed data the agent saw, and the challenge window is when that decision
// gets made.
//
// It deliberately shows what could NOT be verified. Current 0G providers proxy to upstream APIs
// and serve no per-response enclave signature, so claiming "TEE verified" would be false. What
// is provable is that the inference was billed on-chain to a provider whose TEE signer the
// network acknowledges — so that is what it says.
export default function VerifiableAiBadge({ reason }: { reason: string | null | undefined }) {
  const [bundle, setBundle] = useState<JustificationBundle | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const uri = bundleUriIn(reason)
  const root = uri === null ? null : uri.slice('0g://'.length)
  const url = root === null ? null : `/api/justification/${root}`

  useEffect(() => {
    if (!open || bundle !== null || url === null) return
    setLoading(true)
    getJustification(url)
      .then(setBundle)
      .finally(() => setLoading(false))
  }, [open, bundle, url])

  if (root === null) return null

  const compute = bundle?.compute ?? null
  const signatureChecked = compute?.verified === true

  return (
    <div className="border rounded p-2 mb-2 small">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="badge bg-dark">AI verdict on 0G Compute</span>
        {signatureChecked ? (
          <span className="badge bg-success">enclave signature verified</span>
        ) : (
          <span
            className="badge bg-secondary"
            title="The inference is settled on-chain against a provider whose TEE signer is acknowledged by the 0G network. Current providers do not serve a per-response enclave signature, so the response itself is not individually signed."
          >
            on-chain settled · response unsigned
          </span>
        )}
        <a href={`${ZG_STORAGE_GATEWAY}/file?root=${root}`} target="_blank" rel="noreferrer">
          evidence on 0G Storage ↗
        </a>
        <a href={`${ZG_CHAIN_EXPLORER}/address/${ZG_ATTESTATIONS}`} target="_blank" rel="noreferrer">
          anchor ↗
        </a>
        <button type="button" className="btn btn-sm btn-link p-0" onClick={() => setOpen((v) => !v)}>
          {open ? 'hide evidence' : 'show evidence'}
        </button>
      </div>

      {open && loading && <div className="text-muted mt-2">Fetching bundle from 0G Storage…</div>}
      {open && !loading && bundle === null && (
        <div className="text-muted mt-2">Bundle could not be fetched right now — the root above is permanent.</div>
      )}

      {open && bundle !== null && (
        <div className="mt-2">
          {compute !== null && (
            <div className="mb-2">
              <div className="text-muted">Inference</div>
              <div>
                model <code>{compute.model}</code> · provider <code>{compute.provider.slice(0, 10)}…</code> ·{' '}
                <code>{compute.verifiability}</code>
              </div>
              <div>
                TEE signer <code>{compute.teeSignerAddress.slice(0, 10)}…</code>{' '}
                {compute.teeSignerAcknowledged ? '(acknowledged on-chain)' : '(not acknowledged)'}
              </div>
              {compute.verified !== true && compute.verificationNote !== '' && (
                <div className="text-muted">Signature not checked: {compute.verificationNote}</div>
              )}
            </div>
          )}

          {bundle.graphData !== null && (
            <div className="mb-2">
              <div className="text-muted">Market data the agent reasoned over (The Graph)</div>
              <pre
                className="mb-1 p-2 rounded text-body"
                style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)' }}
              >
                {bundle.graphData.summary}
              </pre>
              <details>
                <summary className="text-muted">GraphQL query</summary>
                <pre
                  className="mt-1 p-2 rounded text-body"
                  style={{ fontSize: '0.7rem', overflowX: 'auto', background: 'rgba(255,255,255,0.06)' }}
                >
                  {bundle.graphData.query}
                </pre>
              </details>
            </div>
          )}

          <div className="text-muted" style={{ wordBreak: 'break-all' }}>
            bundle root <code>{root}</code>
          </div>
        </div>
      )}
    </div>
  )
}