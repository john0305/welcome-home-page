import { createContext, useContext, useState, type ReactNode } from 'react'

interface MobileHeaderState {
  title: string | null
  onBack: (() => void) | null
  actions?: ReactNode
}

interface MobileHeaderContextValue extends MobileHeaderState {
  setMobileHeader: (state: MobileHeaderState) => void
  clearMobileHeader: () => void
}

const MobileHeaderContext = createContext<MobileHeaderContextValue>({
  title: null,
  onBack: null,
  actions: undefined,
  setMobileHeader: () => {},
  clearMobileHeader: () => {},
})

export function MobileHeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MobileHeaderState>({ title: null, onBack: null })

  return (
    <MobileHeaderContext.Provider value={{
      ...state,
      setMobileHeader: setState,
      clearMobileHeader: () => setState({ title: null, onBack: null }),
    }}>
      {children}
    </MobileHeaderContext.Provider>
  )
}

export function useMobileHeader() {
  return useContext(MobileHeaderContext)
}
