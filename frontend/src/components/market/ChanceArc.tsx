export default function ChanceArc({ chance }: { chance: number }) {
  return (
    <div className="chance-arc">
      <svg width="48" height="48" viewBox="0 0 36 36" className="chance-svg">
        <path
          className="bg"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className="progress"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831"
          strokeDasharray={`${chance}, 100`}
        />
      </svg>
      <span className="chance-value">{chance}%</span>
      <span className="chance-label">chance</span>
    </div>
  )
}
