import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Camera, Check, ClipboardCheck, MessageSquare, X } from 'lucide-react'
import { disposalCostLabel, type DisposalAction, type DisposalRecord } from './disposals'
import './InspectionDisposals.css'

export default function InspectionDisposals({ records, selectedId, onSelect, onUpdate }: { records: DisposalRecord[]; selectedId: string | null; onSelect: (id: string | null) => void; onUpdate: (id: string, action: DisposalAction) => void }) {
  const record = records.find((item) => item.id === selectedId)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [selectedId])
  return <div className="inspection-page">
    <p className="inspection-disclaimer">검수·폐기 프로세스 확인용 예시입니다. 실제 발송·폐기·청구는 진행되지 않으며, 기존 재고와 별도의 입고 기록입니다. 입력 내용은 새로고침 시 초기화됩니다.</p>
    {record ? <><div className="sa-section-title"><button className="sa-button" onClick={() => onSelect(null)}><ArrowLeft size={16} />검수·폐기 목록</button><span>입고일 {record.receivedAt}</span></div><h2 ref={heading} tabIndex={-1}>입고 {record.id}</h2><DisposalDetail key={record.id} record={record} onUpdate={(action) => onUpdate(record.id, action)} /></> : <>
      <h2 ref={heading} tabIndex={-1}>검수·폐기 내역</h2>
      <div className="sa-table-scroll"><table className="sa-table inspection-list-table"><thead><tr><th>입고번호</th><th>입고일</th><th>현장명</th><th>입고물량</th><th>처리 상태</th><th>검수 결과 안내일</th><th>상세</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.receivedAt}</td><td>{item.siteName}</td><td>{item.materials.map((material) => <div key={material.code}>{material.name}<small className="inspection-subtext">{material.received.toLocaleString('ko-KR')} {material.unit}</small></div>)}</td><td><span className={`sa-badge ${item.status === '처리 완료' ? 'selling' : 'pending'}`}>{item.status}</span>{item.status === '고객 확인 대기' && <small className="inspection-subtext">{item.acknowledgedAt ? '결과 확인 완료 · 폐기 동의 대기' : '검수 결과 확인 필요'}</small>}</td><td>{item.notifiedAt}</td><td><button className="sa-button" aria-label={`${item.id} 검수 상세보기`} onClick={() => onSelect(item.id)}>상세보기<ArrowRight size={15} /></button></td></tr>)}</tbody></table></div>
      {!records.length && <div className="sa-empty"><ClipboardCheck size={28} /><h2>검수·폐기 내역이 없습니다</h2></div>}
    </>}
  </div>
}

function DisposalDetail({ record, onUpdate }: { record: DisposalRecord; onUpdate: (action: DisposalAction) => void }) {
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  const [photoMaterial, setPhotoMaterial] = useState<DisposalRecord['materials'][number] | null>(null)
  const acceptedMaterials = record.materials.filter((material) => material.usable > 0)
  const disposalMaterials = record.materials.filter((material) => material.disposal > 0)
  const now = () => new Date().toLocaleString('ko-KR')
  const cost = record.cost
  function downloadReport() {
    const content = ['MRS 1차 검수 보고서 (예시)', `입고번호: ${record.id}`, `입고일: ${record.receivedAt}`, `현장명: ${record.siteName}`, `결과 안내일: ${record.notifiedAt}`, ...record.materials.map((material) => `${material.name} (${material.code})\n입고물량 ${material.received}${material.unit} / 입고 완료 ${material.usable}${material.unit} / 폐기 대상 ${material.disposal}${material.unit}\n사유: ${material.reason}`), `처리 상태: ${record.status}`, `처리 증빙: ${record.evidence ?? '미등록'}`, `비용: ${disposalCostLabel(cost)}`, '실제 검수 보고서나 폐기 증빙이 아닌 시제품 예시입니다.'].join('\n\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${record.id}-검수보고서-예시.txt`; link.click(); URL.revokeObjectURL(url)
  }
  return <>
    <section className="inspection-section"><div className="sa-section-title"><h3>1차 검수 결과</h3><button className="sa-button" onClick={downloadReport}><ArrowDownToLine size={16} />검수 보고서</button></div>
      <dl className="inspection-fields"><div><dt>현장명</dt><dd>{record.siteName}</dd></div><div><dt>입고물량</dt><dd>{record.materials.map((material) => <div key={material.code}>{material.name} · {material.received.toLocaleString('ko-KR')} {material.unit}</div>)}</dd></div></dl>
      <div className="inspection-result-group"><h4 id="inspection-accepted-title">입고 완료 자산 <span>{acceptedMaterials.length}종</span></h4>
        {acceptedMaterials.length ? <div className="sa-table-scroll"><table className="sa-table" aria-labelledby="inspection-accepted-title"><thead><tr><th>자재</th><th>등급</th><th>입고 완료 수량</th></tr></thead><tbody>{acceptedMaterials.map((material) => <tr key={material.code}><td>{material.name}<small className="inspection-subtext">{material.code}</small></td><td>{material.grade}</td><td>{material.usable.toLocaleString('ko-KR')} {material.unit}</td></tr>)}</tbody></table></div> : <p className="inspection-muted">입고 완료 자산이 없습니다.</p>}
      </div>
      <div className="inspection-result-group"><h4 id="inspection-disposal-title">폐기 대상 자산 <span>{disposalMaterials.length}종</span></h4>
        {disposalMaterials.length ? <div className="sa-table-scroll"><table className="sa-table" aria-labelledby="inspection-disposal-title"><thead><tr><th>자재</th><th>폐기 대상 수량</th><th>폐기 사유</th><th>사진</th></tr></thead><tbody>{disposalMaterials.map((material) => <tr key={material.code}><td>{material.name}<small className="inspection-subtext">{material.code}</small></td><td>{material.disposal.toLocaleString('ko-KR')} {material.unit}</td><td>{material.reason}</td><td><button className="sa-button" aria-label={`${material.name} 폐기 대상 사진 보기`} onClick={() => setPhotoMaterial(material)}><Camera size={16} />사진 보기</button><small className="inspection-subtext">{material.photos.length ? `${material.photos.length}장` : '미등록'}</small></td></tr>)}</tbody></table></div> : <p className="inspection-muted">폐기 대상 자산이 없습니다.</p>}
      </div>
    </section>
    <section className="inspection-section"><h3>고객 안내·확인</h3><dl className="inspection-fields"><div><dt>입고 일자</dt><dd>{record.receivedAt}</dd></div><div><dt>검수 완료 일자</dt><dd>{record.inspectedAt}</dd></div></dl>
      <p>검수 결과 확인은 폐기 또는 비용 청구에 대한 동의가 아닙니다.</p>
      <div className="inspection-actions"><button className="sa-button" disabled={!!record.acknowledgedAt} onClick={() => { onUpdate({ type: 'acknowledge', at: now() }); setMessage('검수 결과 확인을 기록했습니다.') }}><Check size={16} />검수 결과 확인</button><button className="sa-button" onClick={() => setInquiryOpen(true)}><MessageSquare size={16} />문의하기</button></div>
      {record.acknowledgedAt && <p className="inspection-muted">결과 확인 완료 · {record.acknowledgedAt}</p>}
      <div className="inspection-notice">
        <ul>
          <li><p><strong>자동 완료 안내:</strong> 입고 완료일 기준 3일이 경과하면 자동으로 '처리 완료' 상태로 변경됩니다.</p></li>
          <li><p><strong>의견 및 이의 접수:</strong> 검수 내역에 대해 이의사항이 있으실 경우, 3일 이내에 [문의하기]를 통해 남겨주시면 신속히 확인해 드리겠습니다.</p></li>
          <li><p><strong>폐기 비용 청구:</strong> 안내된 폐기 대상 물품 내역에 따라 추후 별도의 폐기 처리 비용이 청구될 수 있습니다.</p></li>
        </ul>
      </div>
    </section>
    {message && <p className="inspection-feedback" role="status">{message}</p>}
    {inquiryOpen && <InspectionInquiry record={record} comment={comment} onComment={setComment} onClose={() => setInquiryOpen(false)} onSubmit={() => { if (!comment.trim() || comment.trim().length > 2000) return; onUpdate({ type: 'comment', at: now(), text: comment }); setComment(''); setInquiryOpen(false); setMessage('문의내역을 시제품에 기록했습니다. 운영팀에 전송되지 않습니다.') }} />}
    {photoMaterial && <DisposalPhotos material={photoMaterial} onClose={() => setPhotoMaterial(null)} />}
  </>
}

function InspectionInquiry({ record, comment, onComment, onClose, onSubmit }: { record: DisposalRecord; comment: string; onComment: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); trigger?.focus() }
  }, [])
  return <dialog ref={dialog} className="sa-dialog inspection-inquiry-dialog" aria-labelledby="inspection-inquiry-title" onCancel={onClose} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
    <div className="sa-section-title"><h2 id="inspection-inquiry-title">검수 결과 문의</h2><button className="sa-button" aria-label="문의 닫기" title="문의 닫기" onClick={onClose}><X size={18} /></button></div>
    <p>{record.id} · {record.siteName}</p>
    <form className="inspection-comment" onSubmit={(event) => { event.preventDefault(); onSubmit() }}><label>문의 내용<textarea required maxLength={2000} rows={6} value={comment} onChange={(event) => onComment(event.target.value)} placeholder="검수 결과에 대한 의견 및 이의사항" /></label><p className="inspection-muted">시제품에만 기록되며 운영팀에 전송되지 않습니다.</p><div className="inspection-actions"><button className="sa-button" type="button" onClick={onClose}>취소</button><button className="sa-button sa-primary" disabled={!comment.trim()} type="submit"><MessageSquare size={16} />문의 남기기</button></div></form>
  </dialog>
}

function DisposalPhotos({ material, onClose }: { material: DisposalRecord['materials'][number]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [failedPhotos, setFailedPhotos] = useState<string[]>([])
  useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); trigger?.focus() }
  }, [])
  return <dialog ref={dialog} className="sa-dialog inspection-photo-dialog" aria-labelledby="inspection-photos-title" onCancel={onClose} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
    <div className="sa-section-title"><h2 id="inspection-photos-title">폐기 대상 사진</h2><button className="sa-button" aria-label="사진 닫기" title="사진 닫기" onClick={onClose}><X size={18} /></button></div>
    <p>{material.name}<small className="inspection-subtext">{material.code} · 폐기 대상 {material.disposal} {material.unit}</small></p>
    <p className="inspection-muted">{material.reason}</p>
    {material.photos.length ? <div className="inspection-photo-list">{material.photos.map((photo, index) => <figure key={`${photo.url}-${index}`}>{failedPhotos.includes(photo.url) ? <p role="status">사진을 불러오지 못했습니다.</p> : <img src={photo.url} alt={photo.caption || `${material.name} 검수 사진 ${index + 1}`} onError={() => setFailedPhotos((previous) => [...previous, photo.url])} />}<figcaption>{photo.caption || `검수 사진 ${index + 1}`}</figcaption></figure>)}</div> : <div className="inspection-photo-empty"><Camera size={24} /><p>등록된 검수 사진이 없습니다.</p></div>}
  </dialog>
}