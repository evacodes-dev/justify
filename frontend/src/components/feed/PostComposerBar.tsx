import { useUi } from '../layout/UiContext'

// "Post your crypto ideas" input that opens the post modal
export default function PostComposerBar({ wrapperClassName = 'px-lg-3' }: { wrapperClassName?: string }) {
  const { openModal } = useUi()
  return (
    <div className={wrapperClassName}>
      <div
        className="input-group mb-4 shadow-sm rounded-4 overflow-hidden py-2 bg-glass"
        onClick={() => openModal('post')}
      >
        <span className="input-group-text material-icons border-0 bg-transparent text-primary">account_circle</span>
        <input type="text" className="form-control border-0 bg-transparent fw-light ps-1" placeholder="Post your crypto ideas" />
        <a href="#" className="text-decoration-none input-group-text bg-transparent border-0 material-icons text-primary" onClick={(e) => e.preventDefault()}>
          add_circle
        </a>
      </div>
    </div>
  )
}
