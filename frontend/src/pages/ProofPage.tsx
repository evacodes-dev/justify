import { useQuery } from '@tanstack/react-query'
import RightSidebar from '../components/layout/RightSidebar'
import { getProof, type Proof } from '../lib/api'

// Every integration, shown as a fact rather than a claim.
//
// Each row is a number this page fetched from a chain or an indexer a moment ago, next to the
// link a sceptic would follow to check it independently. Nothing here is copy: if the subgraph
// stops indexing, the block stops moving; if the anchor contract is empty, the count reads 0.
//
// It deliberately also shows what could NOT be proven — the enclave-signature line is honest
// about current 0G providers rather than quietly omitted.

const short = (v?: string | null, n = 6) => (v ? `${v.slice(0, n + 2)}…${v.slice(-4)}` : '—')

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="d-flex justify-content-between align-items-baseline gap-3 py-1 border-bottom border-secondary-subtle">
      <span className="text-muted small">{label}</span>
      <span className="text-body small text-end" style={{ wordBreak: 'break-all' }}>{children}</span>
    </div>
  )
}

function Card({
  title, tag, status, children,
}: { title: string; tag: string; status?: 'ok' | 'warn'; children: React.ReactNode }) {
  return (
    <div className="bg-glass p-3 rounded-4 shadow-sm mb-3">
      <div className="d-flex align-items-center gap-2 mb-2">
        <h6 className="fw-bold text-body mb-0">{title}</h6>
        <span className="badge bg-secondary">{tag}</span>
        {status === 'ok' && <span className="badge bg-success">live</span>}
        {status === 'warn' && <span className="badge bg-warning text-dark">degraded</span>}
      </div>
      {children}
    </div>
  )
}

const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer">{children}</a>
)

export default function ProofPage() {
  const { data, isLoading, isError } = useQuery<Proof>({
    queryKey: ['proof'],
    queryFn: getProof,
    refetchInterval: 20_000,
  })

  const g = data?.graph
  const zg = data?.zg
  const anchor = zg?.chain
  const e8 = data?.erc8004
  const x = data?.x402
  const w = data?.world

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="mb-3 px-1">
            <h5 className="fw-bold text-body mb-1">Proof</h5>
            <p className="text-muted small mb-0">
              Every claim this project makes, read live from the chains and the indexer. Follow any
              link to verify it without trusting us.
            </p>
          </div>

          {isLoading && <p className="text-muted small px-1">Reading three chains and an indexer…</p>}
          {isError && <p className="text-warning small px-1">Could not reach the backend right now.</p>}

          {g && !('error' in g) && (
            <Card title="The Graph" tag="subgraph" status={g.healthy ? 'ok' : 'warn'}>
              <Row label="indexed head block">{g.block.toLocaleString()}</Row>
              <Row label="markets / resolved">{g.totals?.marketCount} / {g.totals?.resolvedMarketCount}</Row>
              <Row label="trades / traders">{g.totals?.tradeCount} / {g.totals?.traderCount}</Row>
              <Row label="AI resolutions proposed">{g.totals?.aiProposalCount}</Row>
              <Row label="endpoint"><Link href={g.endpoint}>query it yourself ↗</Link></Row>
              <p className="text-muted small mb-0 mt-2">
                Prices, positions and PnL on this site are computed inside the subgraph mappings —
                the backend stores none of them.
              </p>
            </Card>
          )}

          {zg?.enabled && (
            <Card title="0G" tag="compute · storage · chain" status={anchor ? 'ok' : 'warn'}>
              <Row label="attestations on 0G Chain">{anchor?.count ?? '—'}</Row>
              <Row label="anchor contract">
                <Link href={`${anchor?.explorer}/address/${anchor?.contract}`}>{short(anchor?.contract)} ↗</Link>
              </Row>
              {anchor?.latest && (
                <>
                  <Row label="last anchored verdict">
                    market #{anchor.latest.marketId} → {anchor.latest.outcome === 1 ? 'YES' : anchor.latest.outcome === 0 ? 'NO' : 'INVALID'}
                  </Row>
                  <Row label="model">{anchor.latest.model}</Row>
                  <Row label="TEE signer (acknowledged on-chain)">{short(anchor.latest.teeSigner)}</Row>
                  <Row label="evidence bundle">
                    <Link href={`${zg.storage.gateway}${anchor.latest.bundleRoot}`}>read the bytes from 0G Storage ↗</Link>
                  </Row>
                  <Row label="per-response enclave signature">
                    {anchor.latest.teeVerified ? (
                      <span className="text-success">verified</span>
                    ) : (
                      <span className="text-warning">not served by current providers</span>
                    )}
                  </Row>
                </>
              )}
              <p className="text-muted small mb-0 mt-2">
                Inference is billed on-chain against a prepaid 0G Compute ledger, so "this verdict
                came through 0G" is checkable from chain state. Providers today proxy upstream and
                do not sign individual responses — we record that gap instead of claiming a
                verification we cannot show.
              </p>
            </Card>
          )}

          {x?.enabled && (
            <Card title="x402" tag="pay-per-query" status={x.live ? 'ok' : 'warn'}>
              <Row label="price">{x.price} per query</Row>
              <Row label="settles in">USDC on {x.network}</Row>
              <Row label="asset">{short(x.asset)}</Row>
              <Row label="pays to">{short(x.payTo)}</Row>
              <Row label="facilitator">{x.facilitator?.replace('https://', '')}</Row>
              <p className="text-muted small mb-1 mt-2">
                The reputation endpoint answers HTTP 402 to anyone without a payment. These terms
                were just read from that live challenge:
              </p>
              <pre className="p-2 rounded mb-0 text-body" style={{ fontSize: '0.7rem', overflowX: 'auto', background: 'rgba(255,255,255,0.06)' }}>
{`curl -i https://justify.market${x.sampleEndpoint}
→ HTTP/1.1 402 Payment Required`}
              </pre>
            </Card>
          )}

          {e8 && !('error' in e8) && e8.registered > 0 && (
            <Card title="ERC-8004" tag="agent identity + reputation" status="ok">
              <Row label="registry chain">{e8.chain} ({e8.chainId})</Row>
              <Row label="identity registry">
                <Link href={`https://etherscan.io/address/${e8.identityRegistry}`}>{short(e8.identityRegistry)} ↗</Link>
              </Row>
              {e8.agents.map((a) => (
                <Row key={a.agentId} label={`@${a.name}`}>
                  <Link href={a.token}>agent #{a.agentId} ↗</Link>
                  {a.feedbackCount > 0 && (
                    <span className="text-muted"> · {a.feedbackCount} paid feedback{a.feedbackCount > 1 ? 's' : ''}, avg {a.avgScore}</span>
                  )}
                </Row>
              ))}
              <p className="text-muted small mb-0 mt-2">
                Feedback is written only after someone actually paid for a score, so the registry
                never hears about reads nobody was willing to buy.
              </p>
            </Card>
          )}

          {w && (
            <Card title="World ID" tag="two-step gate" status={w.devBypass ? 'warn' : 'ok'}>
              <Row label="step 1 — humanity">{w.verifiedUsers} verified</Row>
              <Row label="step 2 — identity check">{w.identityVerifiedUsers} verified</Row>
              <Row label="dev bypass">{w.devBypass ? 'open (demo)' : 'disabled — real proof required'}</Row>
              <p className="text-muted small mb-0 mt-2">
                Trading needs step one. Creating a market needs both, enforced server-side as well
                as in the UI.
              </p>
            </Card>
          )}

          <Card title="Developer tooling" tag="MCP · Nuthatch">
            <p className="text-muted small mb-2">
              Any agent can reach these markets — and pay for what it reads — through our MCP
              server, or index the registry locally with Nuthatch.
            </p>
            <pre className="p-2 rounded mb-0 text-body" style={{ fontSize: '0.7rem', overflowX: 'auto', background: 'rgba(255,255,255,0.06)' }}>
{`npx justify-mcp                       # 6 tools; get_agent_reputation settles x402
nuthatch sql "SELECT * FROM registry__market_created"`}
            </pre>
          </Card>

          {data && (
            <p className="text-muted small px-1">
              Read {new Date(data.generatedAt).toLocaleTimeString()} · settlement on chain{' '}
              {data.settlement.chainId} ·{' '}
              <Link href={`${data.settlement.explorer}/address/${data.settlement.registry}`}>registry ↗</Link>
            </p>
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}