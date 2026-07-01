import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react'
import { Toast, ToastType } from '../components/ui/Toast'

interface ToastState {
  message: string
  type: ToastType
  id: number
}

interface ToastContextValue {
  showToast: (message: string, type: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const counter = useRef(0)

  const showToast = useCallback((message: string, type: ToastType) => {
    counter.current += 1
    setToast({ message, type, id: counter.current })
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onHide={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}
