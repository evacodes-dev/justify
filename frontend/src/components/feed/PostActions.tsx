interface PostActionsProps {
  likes: string
  comments: string
  reposts: string
}

// Like / comment / repost / share counters row
export default function PostActions({ likes, comments, reposts }: PostActionsProps) {
  const actions = [
    { icon: 'thumb_up_off_alt', label: likes, size: 'md-20' },
    { icon: 'chat_bubble_outline', label: comments, size: 'md-20' },
    { icon: 'repeat', label: reposts, size: 'md-20' },
    { icon: 'share', label: 'Share', size: 'md-18' },
  ]
  return (
    <div className="d-flex align-items-center justify-content-between mb-2">
      {actions.map((action) => (
        <div key={action.icon}>
          <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
            <span className={`material-icons ${action.size} me-2`}>{action.icon}</span>
            <span>{action.label}</span>
          </a>
        </div>
      ))}
    </div>
  )
}
