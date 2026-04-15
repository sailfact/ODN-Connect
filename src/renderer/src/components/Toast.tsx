import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} })

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

let nextId = 0

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 200)
    }, 3500)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info
  const color =
    toast.type === 'success'
      ? 'text-accent-success'
      : toast.type === 'error'
        ? 'text-accent-danger'
        : 'text-accent-primary'

  return (
    <div
      className={`flex items-center gap-2.5 bg-bg-secondary border border-border rounded-lg px-4 py-3 shadow-lg text-sm transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      <span className="text-text-primary flex-1">{toast.message}</span>
      <button
        onClick={() => {
          setVisible(false)
          setTimeout(onDismiss, 200)
        }}
        className="text-text-muted hover:text-text-primary shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={() => dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
