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

// Provenance strip under an AI verdict: where the reasoning came from, where the evidence
// lives, where it is anchored — as links, not prose.
//
// Deliberately compact. Someone deciding whether to dispute wants to see at a glance that the
// evidence exists and is reachable; the detail unfolds only if they ask. It stays visible
// during the challenge window, which is when that decision actually gets made.
//
// The one thing it will not do is overstate: current 0G providers proxy upstream and serve no
// per-response enclave signature, so this says "settled on-chain", never "TEE verified".

function Chip({
  href, label, value, title,
}: { href?: string; label: string; value: string; title?: string }) {
  const body = (
    <>
      <span className="text-muted">{label}</span>
      <span className="ms-1 text-body">{value}</span>
      {href && <span className="ms-1 text-muted">↗</span>}
    </>
  )
  const cls = 'd-inline-flex align-items-center px-2 py-1 rounded-3 text-decoration-none'
  const style = { background: 'rgba(255,255,255,0.06)', fontSize: '0.72rem' }
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style} title={title}>{body}</a>
  ) : (
    <span className={cls} style={style} title={title}>{body}</span>
  )
}

export default function VerifiableAiBadge({ reason }: { reason: string | null | undefined }) {
  const [bundle, setBundle] = useState<JustificationBundle | null>(null)
  const [open, setOpen] = useState(false)

  const uri = bundleUriIn(reason)
  const root = uri === null ? null : uri.slice('0g://'.length)

  // Fetched up front so the model name can sit in the strip without a click.
  useEffect(() => {
    if (root === null || bundle !== null) return
    getJustification(`/api/justification/${root}`).then(setBundle).catch(() => {})
  }, [root, bundle])

  if (root === null) return null

  const compute = bundle?.compute ?? null
  const signed = compute?.verified === true

  return (
    <div className="mb-2">
      <div className="d-flex flex-wrap align-items-center gap-1">
        <Chip
          label="reasoned over"
          value="The Graph"
          title="The agent read this market's live indexed record — price drift, flow, concentration — before judging it."
        />
        <Chip
          label="verdict on"
          value={compute?.model ? `0G · ${compute.model}` : '0G Compute'}
          title={
            signed
              ? 'Enclave signature verified.'
              : 'Inference settled on-chain against a provider whose TEE signer the 0G network acknowledges. Providers do not currently sign individual responses.'
          }
        />
        <Chip href={`${ZG_STORAGE_GATEWAY}/file?root=${root}`} label="evidence" value="0G Storage" />
        <Chip href={`${ZG_CHAIN_EXPLORER}/address/${ZG_ATTESTATIONS}`} label="anchored" value="0G Chain" />
        <button
          type="button"
          className="btn btn-sm btn-link p-0 text-muted"
          style={{ fontSize: '0.72rem' }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'hide' : 'what it saw'}
        </button>
      </div>

      {open && (
        <div className="mt-2">
          {bundle?.graphData ? (
            <pre
              className="p-2 rounded mb-1 text-body"
              style={{ whiteSpace: 'pre-wrap', fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)' }}
            >
              {bundle.graphData.summary}
            </pre>
          ) : (
            <p className="text-muted small mb-1">Fetching the bundle from 0G Storage…</p>
          )}

          {bundle?.graphData && (
            <details>
              <summary className="text-muted" style={{ fontSize: '0.72rem' }}>GraphQL query</summary>
              <pre
                className="mt-1 p-2 rounded text-body"
                style={{ fontSize: '0.68rem', overflowX: 'auto', background: 'rgba(255,255,255,0.06)' }}
              >
                {bundle.graphData.query}
              </pre>
            </details>
          )}

          {compute && !signed && (
            <p className="text-muted mb-0" style={{ fontSize: '0.7rem' }}>
              Billed on-chain to provider {compute.provider.slice(0, 10)}… (TEE signer acknowledged).
              Per-response signature not served by current providers.
            </p>
          )}
        </div>
      )}
    </div>
  )
}