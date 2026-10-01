import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export default function AdminToast() {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const receive = (event: Event) => {
      const value: unknown = (event as CustomEvent).detail
      if (typeof value !== 'string' || !value) return
      if (timer.current) clearTimeout(timer.current)
      setMessage(value)
      timer.current = setTimeout(() => setMessage(''), 4500)
    }
    window.addEventListener('mrs-admin-toast', receive)
    return () => { window.removeEventListener('mrs-admin-toast', receive); if (timer.current) clearTimeout(timer.current) }
  }, [])
  return <div className="adm-toast-region" role="status" aria-live="polite" aria-atomic="true">{message && <div className="adm-toast"><CheckCircle2 size={20} aria-hidden="true" /><span>{message}</span><button type="button" className="adm-icon" aria-label="알림 닫기" title="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}</div>
}