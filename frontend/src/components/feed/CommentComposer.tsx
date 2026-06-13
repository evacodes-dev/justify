export default function CommentComposer() {
  return (
    <div className="d-flex align-items-center mb-3">
      <span className="material-icons bg-transparent border-0 text-primary pe-2 md-36">account_circle</span>
      <input
        type="text"
        className="form-control form-control-sm rounded-3 fw-light bg-glass form-control-text"
        placeholder="Write Your comment"
      />
    </div>
  )
}
