import { useEffect, useRef } from 'react'
import { ClipboardCheck, X } from 'lucide-react'

export default function MarketRegistrationConfirm({ subject, onCancel, onConfirm }: { subject: string; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const confirmed = useRef(false)

  useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={dialog} className="sa-dialog sa-market-confirm" aria-labelledby="market-confirm-title" aria-describedby="market-confirm-description" onCancel={onCancel}>
    <div className="sa-dialog-heading"><h2 id="market-confirm-title">마켓 등록 신청</h2><button type="button" className="sa-icon" aria-label="마켓 등록 확인 닫기" onClick={onCancel}><X size={19} /></button></div>
    <div id="market-confirm-description" className="sa-market-confirm-copy">
      <p><strong>{subject}</strong>의 마켓 등록을 신청하시겠습니까?</p>
      <p>마켓 등록을 위한 검수 작업이 필요합니다. 신청하면 <strong>대기 중</strong> 상태로 전환되며, 검수 후 관리자가 승인하면 <strong>판매 중</strong> 상태로 전환되어 마켓에 등록됩니다.</p>
      <p><strong>마켓에 등록된 후에는 취소할 수 없습니다.</strong></p>
    </div>
    <div className="sa-dialog-actions"><button type="button" className="sa-button" onClick={onCancel}>취소</button><button type="button" className="sa-button sa-primary" onClick={() => { if (confirmed.current) return; confirmed.current = true; onConfirm() }}><ClipboardCheck size={16} />확인하고 진행</button></div>
  </dialog>
}