import Dropdown from 'react-bootstrap/Dropdown'
import { useToast } from './Toast'

// Share menu (X / Telegram / copy link / native share on mobile). `url` may be a
// site-relative path — it's expanded against the current origin.
export default function ShareButton({ url, text }: { url: string; text: string }) {
  const toast = useToast()
  const full = url.startsWith('http') ? url : `${window.location.origin}${url}`
  const enc = encodeURIComponent
  const canNative = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      toast.show('Link copied', { kind: 'success' })
    } catch {
      toast.show('Could not copy the link', { kind: 'error' })
    }
  }

  return (
    <Dropdown align="end">
      {/* NB: no custom onClick here — it would override react-bootstrap's own toggle handler */}
      <Dropdown.Toggle
        as="a"
        href="#"
        bsPrefix="no-caret"
        className="text-muted text-decoration-none d-flex align-items-start fw-light"
      >
        <span className="material-icons md-18 me-2">share</span>
        <span>Share</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="fs-13 dropdown-menu-end bg-light-glass">
        <Dropdown.Item className="text-dark" href={`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(full)}`} target="_blank" rel="noreferrer">
          <span className="material-icons md-13 me-1">open_in_new</span>Share on X
        </Dropdown.Item>
        <Dropdown.Item className="text-dark" href={`https://t.me/share/url?url=${enc(full)}&text=${enc(text)}`} target="_blank" rel="noreferrer">
          <span className="material-icons md-13 me-1">send</span>Share on Telegram
        </Dropdown.Item>
        <Dropdown.Item className="text-dark" onClick={copy}>
          <span className="material-icons md-13 me-1">content_copy</span>Copy link
        </Dropdown.Item>
        {canNative && (
          <Dropdown.Item className="text-dark" onClick={() => (navigator as any).share({ title: text, url: full }).catch(() => {})}>
            <span className="material-icons md-13 me-1">ios_share</span>More…
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
  )
}
