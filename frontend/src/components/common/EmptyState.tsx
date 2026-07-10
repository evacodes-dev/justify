import { Link } from 'react-router-dom'

// Shared empty-state card: icon + title + optional hint and CTA link.
export default function EmptyState({ icon = 'inbox', title, hint, cta }: {
  icon?: string
  title: string
  hint?: string
  cta?: { to: string; label: string }
}) {
  return (
    <div className="bg-glass rounded-4 shadow-sm p-5 text-center my-3 mx-lg-3">
      <span className="material-icons text-muted mb-2" style={{ fontSize: 40 }}>{icon}</span>
      <p className="text-body fw-bold mb-1">{title}</p>
      {hint && <p className="text-muted small mb-3">{hint}</p>}
      {cta && <Link to={cta.to} className="btn btn-primary rounded-5 px-4 fw-bold text-decoration-none">{cta.label}</Link>}
    </div>
  )
}
