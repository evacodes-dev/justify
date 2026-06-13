import type { Comment } from '../../types'

export default function CommentItem({ comment }: { comment: Comment }) {
  return (
    <div className="d-flex mb-2">
      <a href="#" className="text-white text-decoration-none">
        <img src={comment.avatar} className="img-fluid rounded-circle" alt="commenters-img" />
      </a>
      <div className="ms-2 small">
        <a href="#" className="text-white text-decoration-none">
          <div className="bg-glass px-3 py-2 rounded-4 mb-1 chat-text">
            <p className="fw-500 mb-0">{comment.author}</p>
            <span className="text-muted">{comment.text}</span>
          </div>
        </a>
        <div className="d-flex align-items-center ms-2">
          <a href="#" className="small text-muted text-decoration-none">Like</a>
          <span className="fs-3 text-muted material-icons mx-1">circle</span>
          <a href="#" className="small text-muted text-decoration-none">Reply</a>
          <span className="fs-3 text-muted material-icons mx-1">circle</span>
          <span className="small text-muted">{comment.time}</span>
        </div>
      </div>
    </div>
  )
}
