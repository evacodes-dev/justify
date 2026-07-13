import { useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { useUi } from '../layout/UiContext'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { createPost } from '../../lib/api'

// "Post your crypto ideas" — a real text post (vogel). On success the feed refreshes
// via the window 'posts:changed' event.
export default function PostModal() {
  const { activeModal, closeModal } = useUi()
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const t = text.trim()
    if (!t || sending) return
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSending(true)
    try {
      await createPost({ address, text: t })
      setText('')
      closeModal()
      window.dispatchEvent(new Event('posts:changed'))
      toast.show('Posted', { kind: 'success' })
    } catch (e) {
      toast.show((e as Error).message || 'Could not post', { kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      show={activeModal === 'post'}
      onHide={closeModal}
      centered
      backdrop="static"
      keyboard={false}
      contentClassName="rounded-4 shadow-sm p-4 border-0 bg-brown-gradient"
    >
      <div className="modal-header d-flex align-items-center justify-content-start border-0 p-0 mb-3">
        <a
          href="#"
          className="text-white text-decoration-none material-icons"
          onClick={(e) => {
            e.preventDefault()
            closeModal()
          }}
        >
          arrow_back_ios_new
        </a>
        <h5 className="modal-title text-primary ms-3 ln-0">
          <span className="material-icons md-32">account_circle</span>
        </h5>
      </div>
      <div className="modal-body p-0 mb-3">
        <div className="form-floating rounded-5 bg-glass">
          <textarea
            className="form-control border-0 shadow-sm"
            placeholder="Leave a comment here"
            id="floatingTextarea2"
            style={{ height: 200 }}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
          ></textarea>
          <label htmlFor="floatingTextarea2" className="h6 text-muted mb-0">
            What's on your mind...
          </label>
        </div>
      </div>
      <div className="modal-footer justify-content-start px-1 py-1 bg-glass shadow-sm rounded-5">
        <div className="rounded-4 m-0 px-3 py-2 d-flex align-items-center justify-content-between w-75">
          <span className="text-muted small">Tip: mention creators with @name</span>
          <span className="text-muted">{text.length}/500</span>
        </div>
        <div className="ms-auto m-0">
          <button
            type="button"
            className="btn btn-primary rounded-5 fw-bold px-3 py-2 fs-6 mb-0 d-flex align-items-center"
            disabled={sending || !text.trim()}
            onClick={() => void submit()}
          >
            <span className="material-icons me-2 md-16">send</span>{sending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
