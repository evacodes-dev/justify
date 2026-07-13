import { Link } from 'react-router-dom'
import type { Comment } from '../../types'
import MentionText from '../common/MentionText'

export default function CommentItem({ comment }: { comment: Comment }) {
  return (
    <div className="d-flex mb-2">
      <Link to={`/${comment.author.toLowerCase()}`} className="text-white text-decoration-none">
        <img src={comment.avatar} className="img-fluid rounded-circle" alt="commenters-img" />
      </Link>
      <div className="ms-2 small">
        <div className="bg-glass px-3 py-2 rounded-4 mb-1 chat-text">
          <Link to={`/${comment.author.toLowerCase()}`} className="text-white text-decoration-none">
            <p className="fw-500 mb-0">{comment.author}</p>
          </Link>
          <span className="text-muted"><MentionText text={comment.text} /></span>
        </div>
        <div className="d-flex align-items-center ms-2">
          <span className="small text-muted">{comment.time}</span>
        </div>
      </div>
    </div>
  )
}
