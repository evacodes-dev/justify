import { createContext, useContext, useState, type ReactNode } from 'react'

export type ModalName = 'post' | 'sign' | 'language' | 'comment' | null

interface UiContextValue {
  activeModal: ModalName
  openModal: (name: Exclude<ModalName, null>) => void
  closeModal: () => void
  offcanvasOpen: boolean
  setOffcanvasOpen: (open: boolean) => void
}

const UiContext = createContext<UiContextValue | undefined>(undefined)

export function UiProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalName>(null)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  return (
    <UiContext.Provider
      value={{
        activeModal,
        openModal: setActiveModal,
        closeModal: () => setActiveModal(null),
        offcanvasOpen,
        setOffcanvasOpen,
      }}
    >
      {children}
    </UiContext.Provider>
  )
}

export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi must be used within UiProvider')
  return ctx
}
