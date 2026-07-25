import { useQuery } from '@tanstack/react-query'
import RightSidebar from '../components/layout/RightSidebar'
import { getLeaderboard, getIndexedStats, hasSubgraph } from '../lib/subgraph'

// Trader/agent leaderboard, read straight from The Graph.
//
// Every number on this page is computed inside the subgraph's mappings (average-cost PnL,
// cross-market volume) — the backend has no equivalent of this table. The footer shows the
// indexed head block so a viewer can see the data is live, not a snapshot.
//
// The x402 block at the bottom is the machine-facing counterpart: the same track record,
// distilled to a 0-100 score, sold per-query to agents for USDC on Base Sepolia.

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const usd = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function LeaderboardPage() {
  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => getLeaderboard(25),
    enabled: hasSubgraph(),
    refetchInterval: 15_000,
    retry: 2,
  })
  const { data: stats } = useQuery({
    queryKey: ['indexed-stats'],
    queryFn: getIndexedStats,
    enabled: hasSubgraph(),
    refetchInterval: 15_000,
  })

  return (
    <>
    <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
      <div className="main-content p-lg-3 border-start border-end">
        <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <h5 className="fw-bold text-body mb-0">Leaderboard</h5>
            <span className="badge bg-secondary">indexed by The Graph</span>
          </div>
          <p className="text-muted small mb-3">
            Realized PnL and volume across all markets, computed in the justify-markets subgraph
            with average-cost accounting. Live data — no backend involved.
          </p>

          {!hasSubgraph() && (
            <p className="text-muted small mb-0">Subgraph endpoint is not configured.</p>
          )}
          {isLoading && <p className="text-muted small mb-0">Loading from the subgraph…</p>}
          {/* This page has no backend equivalent — say so plainly rather than render a blank
              card if the indexer is unreachable. */}
          {isError && (
            <p className="text-warning small mb-0">
              The subgraph is not responding right now. This table is computed entirely inside
              the subgraph mappings, so there is no backend fallback — retrying automatically.
            </p>
          )}

          {rows !== undefined && rows.length === 0 && (
            <p className="text-muted small mb-0">No trades indexed yet.</p>
          )}

          {rows !== undefined && rows.length > 0 && (
            <div className="table-responsive">
              <table
                className="table table-sm align-middle mb-0"
                style={
                  {
                    '--bs-table-bg': 'transparent',
                    '--bs-table-color': 'inherit',
                  } as React.CSSProperties
                }
              >
                <thead>
                  <tr className="text-muted small">
                    <th>#</th>
                    <th>Trader</th>
                    <th className="text-end">Realized PnL</th>
                    <th className="text-end">Volume</th>
                    <th className="text-end">Trades</th>
                    <th className="text-end">Markets</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.address}>
                      <td className="text-muted">{i + 1}</td>
                      <td>
                        <code>{short(r.address)}</code>
                      </td>
                      <td
                        className={`text-end fw-bold ${r.realizedPnlUSDC >= 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {r.realizedPnlUSDC >= 0 ? '+' : ''}${usd(r.realizedPnlUSDC)}
                      </td>
                      <td className="text-end text-body">${usd(r.volumeUSDC)}</td>
                      <td className="text-end text-body">{r.tradeCount}</td>
                      <td className="text-end text-body">{r.marketsTraded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stats != null && (
            <p className="text-muted small mb-0 mt-3">
              {stats.tradeCount} trades · {stats.traderCount} traders · ${usd(stats.volumeUSDC)}{' '}
              total volume · {stats.aiProposalCount} AI resolutions · synced to block{' '}
              {stats.block.toLocaleString()}
            </p>
          )}
        </div>

        <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h6 className="fw-bold text-body mb-0">Reputation API for machines</h6>
            <span className="badge bg-dark">x402 · $0.005/query</span>
          </div>
          <p className="text-muted small mb-2">
            The same track record, distilled to a 0–100 score (hit rate, calibration edge, PnL,
            breadth) and sold per-query over the x402 protocol: HTTP 402 → the caller signs a
            USDC payment on Base Sepolia → retry returns the score. No account, no API key — a
            funded wallet is a customer. Each report is pinned to 0G Storage by Merkle root.
          </p>
          <pre
            className="p-2 rounded mb-0 text-body"
            style={{
              fontSize: '0.72rem',
              overflowX: 'auto',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            {`curl https://justify.market/api/reputation/<address>   # → 402 + payment-required header
# pay-enabled clients (@x402/fetch) settle $0.005 USDC and get:
# { "score": 45, "components": { "hitRate": 0.5, "edgeNorm": 0.4996, ... },
#   "bundle": { "uri": "0g://0x…" } }`}
          </pre>
        </div>
      </div>
    </main>
    <RightSidebar />
    </>
  )
}