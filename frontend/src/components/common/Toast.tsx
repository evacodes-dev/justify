import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'info' | 'success' | 'error'
interface Toast {
  id: number
  kind: ToastKind
  message: string
  href?: string
  hrefLabel?: string
}

interface ToastApi {
  show: (message: string, opts?: { kind?: ToastKind; href?: string; hrefLabel?: string; timeout?: number }) => void
}

const ToastContext = createContext<ToastApi | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const show = useCallback<ToastApi['show']>((message, opts) => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, kind: opts?.kind ?? 'info', message, href: opts?.href, hrefLabel: opts?.hrefLabel }])
    const timeout = opts?.timeout ?? 6000
    if (timeout > 0) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeout)
  }, [])

  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1080, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-brown-gradient rounded-4 shadow-sm p-3 border-0 text-body"
            style={{ borderLeft: `4px solid ${t.kind === 'success' ? '#3fb950' : t.kind === 'error' ? '#e5484d' : '#0d6efd'}` }}
          >
            <div className="d-flex align-items-start">
              <span className="me-2">{t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : 'ℹ️'}</span>
              <div className="flex-grow-1 small" style={{ wordBreak: 'break-word' }}>
                {t.message}
                {t.href && (
                  <div className="mt-1">
                    <a href={t.href} target="_blank" rel="noreferrer" className="text-primary text-decoration-none">
                      {t.hrefLabel ?? 'View ↗'}
                    </a>
                  </div>
                )}
              </div>
              <button
                className="btn-close btn-close-white ms-2"
                style={{ fontSize: 10 }}
                aria-label="Close"
                onClick={() => remove(t.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
