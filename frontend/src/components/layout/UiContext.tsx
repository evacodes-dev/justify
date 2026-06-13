import { createContext, useContext, useState, type ReactNode } from 'react'

export type ModalName = 'post' | 'language' | 'comment' | 'trade' | 'onboard' | null

// Target for the trade modal: a real on-chain market + the chosen side.
export interface TradeTarget {
  address: `0x${string}`
  question: string
  side: 0 | 1
  yesPct: number
}

interface UiContextValue {
  activeModal: ModalName
  openModal: (name: Exclude<ModalName, null>) => void
  closeModal: () => void
  offcanvasOpen: boolean
  setOffcanvasOpen: (open: boolean) => void
  tradeTarget: TradeTarget | null
  openTrade: (target: TradeTarget) => void
}

const UiContext = createContext<UiContextValue | undefined>(undefined)

export function UiProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalName>(null)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [tradeTarget, setTradeTarget] = useState<TradeTarget | null>(null)
  return (
    <UiContext.Provider
      value={{
        activeModal,
        openModal: setActiveModal,
        closeModal: () => setActiveModal(null),
        offcanvasOpen,
        setOffcanvasOpen,
        tradeTarget,
        openTrade: (target) => {
          setTradeTarget(target)
          setActiveModal('trade')
        },
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
