import { useEffect, useMemo, useRef, useState } from 'react'
import { useMarketHistory } from '../../hooks/useMarketHistory'
import type { ChartRange } from '../../lib/api'

const RANGES: ChartRange[] = ['1H', '6H', '1D', '1W', '1M', 'ALL']

// Fallback random walk for the showcase trade pages (/trade, /trade-founder), which
// aren't backed by a real on-chain market. Real markets pass a `marketId` and render
// live data instead.
function generateRandomWalk(length: number, startValue: number): number[] {
  const values = [startValue]
  for (let i = 1; i < length; i++) {
    let next = values[i - 1] + (Math.random() - 0.5) * 5
    next = Math.max(20, Math.min(80, next))
    values.push(parseFloat(next.toFixed(2)))
  }
  return values
}
function fallbackSeries(length: number) {
  const values = generateRandomWalk(length, 34)
  const now = Date.now()
  const times = Array.from({ length }, (_, i) => now - (length - 1 - i) * 86_400e3)
  return { values, times }
}

interface Props {
  marketId?: number
  currentYesPct?: number // live YES% from useArcMarket — used as the latest point
  resolved?: boolean
}

// Centered placeholder shown inside the chart card for the loading / error / empty
// states, sized to roughly match the canvas so the layout doesn't jump.
function ChartPlaceholder({ icon, title, subtitle, spinner }: { icon?: string; title?: string; subtitle?: string; spinner?: boolean }) {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center text-center px-3"
      style={{ minHeight: 180 }}
    >
      {spinner ? (
        <div className="spinner-border text-secondary mb-3" role="status" aria-hidden="true" />
      ) : (
        <span className="material-icons text-secondary mb-2" style={{ fontSize: 40, opacity: 0.5 }}>{icon}</span>
      )}
      {title && <p className="fw-semibold text-body mb-1">{title}</p>}
      {subtitle && <p className="text-muted small mb-0" style={{ maxWidth: 320 }}>{subtitle}</p>}
    </div>
  )
}

// Line chart drawn directly on a canvas. With a `marketId` it renders the real
// indexed price history (polled, with a working range selector); otherwise it shows
// a static random walk so the design-only trade pages still look populated.
export default function MarketChart({ marketId, currentYesPct, resolved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [range, setRange] = useState<ChartRange>('ALL')
  const { data, isLoading, isError } = useMarketHistory(marketId, range)

  // Fallback series is generated once for showcase pages (no marketId).
  const fallback = useMemo(() => (marketId == null ? fallbackSeries(100) : null), [marketId])

  // Resolve the series to draw: real points (×100 → percent) or the fallback.
  // A market with zero trades resolves to null so we show an empty state instead of
  // a meaningless flat line. The last real point is overridden with the live YES%
  // so the tip stays current between backend polls.
  const series = useMemo(() => {
    if (fallback) return fallback
    if (!data || data.trades === 0 || data.points.length === 0) return null
    const values = data.points.map((pt) => pt.p * 100)
    const times = data.points.map((pt) => pt.t)
    // Keep the tip current between backend polls — but not once resolved, where the
    // backend already pins the final point to the YES/NO outcome.
    if (!resolved && currentYesPct != null && values.length) values[values.length - 1] = currentYesPct
    return { values, times }
  }, [fallback, data, currentYesPct, resolved])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!series) return

    const { values, times } = series

    // Label format follows the data's actual span, not just the selected range: a
    // market whose whole history fits in a day (common early on) reads as times of
    // day even under "ALL", instead of the same date repeated across every tick.
    const spanMs = times.length > 1 ? times[times.length - 1] - times[0] : 0
    const useTime = spanMs <= 2 * 86_400e3

    // Dynamic Y domain: pad the data range a little, clamp to [0,100]. A flat line
    // still gets a ±5 band so it isn't drawn on the axis.
    let yMin = Math.min(...values)
    let yMax = Math.max(...values)
    if (yMax - yMin < 1) { yMin -= 5; yMax += 5 }
    const pad = Math.max(2, (yMax - yMin) * 0.15)
    yMin = Math.max(0, yMin - pad)
    yMax = Math.min(100, yMax + pad)
    if (yMax <= yMin) yMax = yMin + 1

    const fmtX = (t: number) => {
      const d = new Date(t)
      return useTime
        ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    const draw = () => {
      const parent = canvas.parentElement
      if (!parent) return
      // Use the parent's *content* width — clientWidth includes the section's
      // 20px padding, so sizing to it makes the canvas overflow the card on the
      // right. Subtract the horizontal padding to keep it inside.
      const style = getComputedStyle(parent)
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const width = parent.clientWidth - padX
      if (width <= 0) return
      // A 2:1 aspect ratio would make the canvas ~550px tall inside the wide
      // trade column, dwarfing the rest of the card; cap the height so the
      // chart stays contained (wide-and-short).
      const height = Math.min(Math.round(width / 2), 320)
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.display = 'block'
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const padLeft = 38
      const padRight = 8
      const padTop = 8
      const padBottom = 24
      const plotW = width - padLeft - padRight
      const plotH = height - padTop - padBottom
      const n = values.length
      const x = (i: number) => padLeft + (n <= 1 ? plotW : (i / (n - 1)) * plotW)
      const y = (v: number) => padTop + ((yMax - v) / (yMax - yMin)) * plotH

      ctx.font = '11px sans-serif'
      ctx.lineWidth = 1

      // Horizontal grid lines + y-axis percentage ticks (5 rows across the domain)
      const rows = 4
      for (let r = 0; r <= rows; r++) {
        const v = yMin + ((yMax - yMin) * r) / rows
        ctx.strokeStyle = '#1f1f1f'
        ctx.beginPath()
        ctx.moveTo(padLeft, y(v))
        ctx.lineTo(width - padRight, y(v))
        ctx.stroke()
        ctx.fillStyle = '#aaa'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${Math.round(v)}%`, padLeft - 6, y(v))
      }

      // Vertical grid lines + time labels (~6 evenly spaced)
      const ticks = Math.min(6, n)
      for (let k = 0; k < ticks; k++) {
        const i = ticks <= 1 ? n - 1 : Math.round((k / (ticks - 1)) * (n - 1))
        ctx.strokeStyle = '#1f1f1f'
        ctx.beginPath()
        ctx.moveTo(x(i), padTop)
        ctx.lineTo(x(i), height - padBottom)
        ctx.stroke()
        ctx.fillStyle = '#aaa'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(fmtX(times[i]), x(i), height - padBottom + 6)
      }

      // "Yes Price" line
      ctx.strokeStyle = '#4fc3f7'
      ctx.lineWidth = 2
      ctx.beginPath()
      values.forEach((v, i) => {
        if (i === 0) ctx.moveTo(x(i), y(v))
        else ctx.lineTo(x(i), y(v))
      })
      ctx.stroke()
    }

    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [series])

  // State machine for the chart area (real markets only; showcase always draws):
  //   loading → spinner · error → retry message · no trades → empty state · else canvas
  function renderChart() {
    if (series) return <canvas id="marketChart" ref={canvasRef}></canvas>
    if (isLoading) return <ChartPlaceholder spinner />
    if (isError)
      return <ChartPlaceholder icon="error_outline" title="Couldn’t load price history" subtitle="We’ll keep retrying automatically." />
    return (
      <ChartPlaceholder
        icon="show_chart"
        title="No trades yet"
        subtitle="The price chart begins with the first trade — be the first to take a side."
      />
    )
  }

  return (
    <div className="market-graph-section">
      {renderChart()}
      <div className="chart-toggles">
        {RANGES.map((r) => (
          <button
            key={r}
            className={r === range ? 'active' : undefined}
            onClick={() => setRange(r)}
            disabled={marketId == null}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
