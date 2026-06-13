import { useEffect, useRef } from 'react'

const Y_MIN = 20
const Y_MAX = 80
const POINTS = 100

// Random-walk generator for the chart dataset: 100 points starting at 34,
// ±2.5 steps, clamped between 20% and 80%.
function generateRandomWalk(length: number, startValue: number): number[] {
  const values = [startValue]
  for (let i = 1; i < length; i++) {
    const prev = values[i - 1]
    let next = prev + (Math.random() - 0.5) * 5
    next = Math.max(Y_MIN, Math.min(Y_MAX, next))
    values.push(parseFloat(next.toFixed(2)))
  }
  return values
}

function buildLabels(length: number): string[] {
  return Array.from({ length }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (length - i))
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
}

// Line chart drawn directly on a canvas.
export default function MarketChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const values = generateRandomWalk(POINTS, 34)
    const labels = buildLabels(POINTS)

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
      const x = (i: number) => padLeft + (i / (values.length - 1)) * plotW
      const y = (v: number) => padTop + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * plotH

      ctx.font = '11px sans-serif'
      ctx.lineWidth = 1

      // Horizontal grid lines + y-axis percentage ticks
      for (let v = Y_MIN; v <= Y_MAX; v += 10) {
        ctx.strokeStyle = '#1f1f1f'
        ctx.beginPath()
        ctx.moveTo(padLeft, y(v))
        ctx.lineTo(width - padRight, y(v))
        ctx.stroke()
        ctx.fillStyle = '#aaa'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${v}%`, padLeft - 6, y(v))
      }

      // Vertical grid lines + date labels
      const step = 14
      for (let i = 0; i < values.length; i += step) {
        ctx.strokeStyle = '#1f1f1f'
        ctx.beginPath()
        ctx.moveTo(x(i), padTop)
        ctx.lineTo(x(i), height - padBottom)
        ctx.stroke()
        ctx.fillStyle = '#aaa'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(labels[i] ?? '', x(i), height - padBottom + 6)
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
  }, [])

  return (
    <div className="market-graph-section">
      <canvas id="marketChart" ref={canvasRef}></canvas>
      <div className="chart-toggles">
        <button>1H</button>
        <button>6H</button>
        <button>1D</button>
        <button>1W</button>
        <button>1M</button>
        <button className="active">ALL</button>
      </div>
    </div>
  )
}
