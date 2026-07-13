import { Link } from 'react-router-dom'
import type { UserPost } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import MentionText from '../common/MentionText'

// A text post ("vogel") card in the feed / profile Vogel tab.
export default function UserPostCard({ post }: { post: UserPost }) {
  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass p-3 feed-item rounded-4 shadow-sm">
        <div className="d-flex align-items-center mb-2">
          <Link to={`/${post.name}`}>
            <img src={post.avatar} className="img-fluid rounded-circle" style={{ width: 40, height: 40 }} alt="avatar" />
          </Link>
          <div className="ms-2 flex-grow-1" style={{ minWidth: 0 }}>
            <Link to={`/${post.name}`} className="text-decoration-none d-flex align-items-center">
              <span className="fw-bold text-body">{post.name}</span>
              {post.verified && (
                <span className="ms-1 material-icons bg-primary p-0 md-14 fw-bold text-white rounded-circle ov-icon">done</span>
              )}
              <small className="text-muted ms-2">@{post.name}</small>
            </Link>
          </div>
          <small className="text-muted">{timeAgo(post.ts)}</small>
        </div>
        <p className="text-body mb-0" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><MentionText text={post.text} /></p>
      </div>
    </div>
  )
}
