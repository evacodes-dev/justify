import { Link } from 'react-router-dom'

// Renders text with @mentions as profile links (/name). Keeps everything else as-is.
export default function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9_]{2,20})/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <Link key={i} to={`/${p.slice(1).toLowerCase()}`} className="text-primary text-decoration-none fw-500">
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
