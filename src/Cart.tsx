import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AlertCircle,
  Box,
  CheckCircle2,
  FileText,
  Minus,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react'
import { useCart } from './cartContext'
import { useCartStore, validQuantity, type CartItem } from './cartStore'
import { appraisalMoney, appraisalTotal } from './appraisal'
import './Cart.css'

function Quantity({
  item,
  change,
  disabled
}: {
  item: CartItem
  change: (id: string, value: string) => void
  disabled: boolean
}) {
  const [draftState, setDraftState] = useState({
    base: item.quantity,
    value: item.quantity
  })
  if (draftState.base !== item.quantity)
    setDraftState({ base: item.quantity, value: item.quantity })
  const draft = draftState.value
  const setDraft = (value: string) =>
    setDraftState({ base: item.quantity, value })
  const [invalid, setInvalid] = useState(false)
  const commit = (value: string) => {
    if (!validQuantity(value, item.unit)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    change(item.id, value)
  }
  const step = ['EA', 'BOX', 'PIECE'].includes(item.unit) ? 1 : 0.001
  return (
    <div>
      <div className="sm-quantity">
        <button
          className="sa-icon"
          aria-label={`${item.name} 수량 줄이기`}
          disabled={disabled || Number(item.quantity) <= step}
          onClick={() =>
            commit(
              String(Math.round((Number(item.quantity) - step) * 1000) / 1000)
            )
          }
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min={step}
          max="1000000000"
          step={step}
          aria-label={`${item.name} 수량`}
          aria-invalid={invalid}
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value)
            if (validQuantity(event.target.value, item.unit))
              commit(event.target.value)
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(draft)
            }
          }}
        />
        <button
          className="sa-icon"
          aria-label={`${item.name} 수량 늘리기`}
          disabled={disabled || Number(item.quantity) >= 1e9}
          onClick={() =>
            commit(
              String(Math.round((Number(item.quantity) + step) * 1000) / 1000)
            )
          }
        >
          <Plus size={14} />
        </button>
      </div>
      {invalid && (
        <small className="cart-warning">올바른 수량을 입력해 주세요.</small>
      )}
    </div>
  )
}
function Photo({ item }: { item: CartItem }) {
  const [failed, setFailed] = useState(false)
  return item.imageUrl && !failed ? (
    <img src={item.imageUrl} alt={item.name} onError={() => setFailed(true)} />
  ) : (
    <Box size={24} />
  )
}
export function CartButton() {
  const cart = useCart()
  return (
    <button
      className="sa-button sa-primary"
      onClick={() => useCartStore.getState().setOpen(true)}
    >
      <ShoppingCart size={16} />
      장바구니 <span className="sm-cart-count">{cart.data.items.length}</span>
    </button>
  )
}
export default function Cart({ onLogin }: { onLogin: () => void }) {
  const cart = useCart()
  const open = useCartStore((state) => state.open)
  const selected = useCartStore((state) => state.selected)
  const intents = useCartStore((state) => state.intents)
  const notice = useCartStore((state) => state.notice)
  const noticeVersion = useCartStore((state) => state.noticeVersion)
  const noticeKind = useCartStore((state) => state.noticeKind)
  const batch = useCartStore((state) => state.batch)
  const dialog = useRef<HTMLDialogElement>(null)
  const all = useRef<HTMLInputElement>(null)
  const previous = useRef<string[]>([])
  const rows = cart.data.items.map((item) => ({
    ...item,
    issues: [
      ...item.issues.filter(
        (issue) => issue !== '재고 부족' && issue !== '최소 주문 수량 미달'
      ),
      ...(cart.member && Number(item.quantity) > Number(item.availableQuantity)
        ? ['재고 부족']
        : []),
      ...(cart.member &&
      Number(item.quantity) < Number(item.minimumOrderQuantity)
        ? ['최소 주문 수량 미달']
        : [])
    ]
  }))
  const eligible = rows.filter((item) => !item.issues.length)
  const chosen = eligible.filter((item) => selected.includes(item.id))
  const selectedRows = rows.filter((item) => selected.includes(item.id))
  const total = chosen.reduce(
    (sum, item) =>
      sum +
      BigInt(appraisalTotal(item.unitPrice ?? null, item.quantity) ?? '0'),
    0n
  )
  const original = chosen.reduce(
    (sum, item) =>
      sum +
      BigInt(
        appraisalTotal(item.originalUnitPrice ?? null, item.quantity) ?? '0'
      ),
    0n
  )
  const ids = rows.map((item) => item.id).join('|')
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current?.close()
  }, [open])
  useEffect(() => {
    if (!notice || noticeKind === 'error') return
    const timer = setTimeout(() => useCartStore.getState().message(''), 4500)
    return () => clearTimeout(timer)
  }, [notice, noticeVersion, noticeKind])
  const syncSelection = useEffectEvent(() => {
    const current = useCartStore.getState().selected
    useCartStore
      .getState()
      .select([
        ...current.filter((id) => rows.some((item) => item.id === id)),
        ...eligible
          .filter((item) => !previous.current.includes(item.id))
          .map((item) => item.id)
      ])
    previous.current = rows.map((item) => item.id)
  })
  useEffect(() => {
    syncSelection()
  }, [ids])
  useEffect(
    () => () => {
      previous.current = []
    },
    []
  )
  const allSelected = eligible.length > 0 && chosen.length === eligible.length
  useEffect(() => {
    if (all.current)
      all.current.indeterminate = chosen.length > 0 && !allSelected
  }, [chosen.length, allSelected])
  const toggle = (id: string) =>
    useCartStore
      .getState()
      .select(
        selected.includes(id)
          ? selected.filter((value) => value !== id)
          : [...selected, id]
      )
  const unsaved = Object.keys(intents).length > 0
  const failed = Object.values(intents).some((intent) => intent.error)
  return (
    <>
      <div
        className="cart-toast-region"
        role={noticeKind === 'error' ? 'alert' : 'status'}
        aria-live={noticeKind === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {notice && !open && (
          <div
            key={noticeVersion}
            className={`cart-toast${noticeKind === 'error' ? ' cart-toast-error' : ''}`}
          >
            {noticeKind === 'error' ? (
              <AlertCircle size={20} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={20} aria-hidden="true" />
            )}
            <span>{notice}</span>
            {noticeKind === 'success' && (
              <button
                className="sa-text-button"
                onClick={() => useCartStore.getState().setOpen(true)}
              >
                장바구니 보기
              </button>
            )}
            <button
              className="sa-icon"
              aria-label="장바구니 알림 닫기"
              title="알림 닫기"
              onClick={() => useCartStore.getState().message('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      <dialog
        ref={dialog}
        className="sa-dialog sm-basket-editor-dialog cart-dialog"
        aria-label="장바구니 편집"
        onCancel={(event) => {
          event.preventDefault()
          cart.close()
        }}
        onClose={() => {
          if (useCartStore.getState().open) cart.close()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect()
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              cart.close()
          }
        }}
      >
        <div className="sm-basket-editor">
          <div className="sa-dialog-heading">
            <div>
              <h2>장바구니</h2>
              <span>
                {rows.length}종
                {cart.refreshing
                  ? ' · 최신 정보 확인 중'
                  : failed
                    ? ' · 저장 실패'
                    : unsaved
                      ? ' · 변경 저장 중'
                      : ''}
              </span>
            </div>
            <div className="cart-heading-actions">
              {cart.member && (
                <button
                  className="sa-icon"
                  aria-label="장바구니 새로고침"
                  title="장바구니 새로고침"
                  disabled={cart.busy}
                  onClick={cart.refresh}
                >
                  <RefreshCw size={17} />
                </button>
              )}
              <button
                className="sa-icon"
                aria-label="장바구니 닫기"
                onClick={cart.close}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          {notice && noticeKind !== 'error' && <p role="status">{notice}</p>}
          {cart.error && (
            <div className="customer-error" role="alert">
              {cart.error}
              <button
                className="sa-button"
                onClick={batch ? cart.merge : cart.refresh}
              >
                <RefreshCw size={14} />
                다시 시도
              </button>
              {batch && (
                <button
                  className="sa-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        '아직 병합하지 못한 비회원 장바구니를 삭제할까요?'
                      )
                    ) {
                      useCartStore.getState().finishMerge(batch.operationId)
                      cart.refresh()
                    }
                  }}
                >
                  <Trash2 size={14} />
                  비회원 장바구니 삭제
                </button>
              )}
            </div>
          )}
          {cart.loading ? (
            <p role="status">장바구니를 불러오는 중...</p>
          ) : rows.length === 0 ? (
            <div className="sa-empty sm-basket-empty">
              <ShoppingCart size={30} />
              <h2>장바구니가 비어 있습니다</h2>
              <button className="sa-button sa-primary" onClick={cart.close}>
                자재 둘러보기
              </button>
            </div>
          ) : (
            <div className="sm-basket-layout">
              <section
                className="sm-basket-products"
                aria-label="장바구니 상품"
              >
                <div className="sm-basket-section-heading">
                  <label className="sm-basket-select-all">
                    <input
                      ref={all}
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        useCartStore
                          .getState()
                          .select(
                            allSelected ? [] : eligible.map((item) => item.id)
                          )
                      }
                    />
                    <span>전체 선택</span>
                  </label>
                  <div>
                    <span>{selectedRows.length}종 선택</span>
                    <button
                      className="sa-text-button"
                      disabled={!selectedRows.length || cart.busy}
                      onClick={() =>
                        cart.remove(selectedRows.map((item) => item.id))
                      }
                    >
                      <Trash2 size={13} />
                      선택 삭제
                    </button>
                  </div>
                </div>
                {rows.map((item) => (
                  <div
                    className={`sm-basket-page-row${selected.includes(item.id) ? ' is-selected' : ''}`}
                    key={item.id}
                  >
                    <input
                      className="sm-basket-check"
                      type="checkbox"
                      aria-label={`${item.name} 선택`}
                      checked={selected.includes(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                    <div className="sm-basket-product">
                      <span className="sa-thumbnail">
                        <Photo item={item} />
                      </span>
                      <span>
                        <b>{item.name}</b>
                        <small>
                          {item.category} · {item.grade}등급
                        </small>
                        <small>
                          {cart.member
                            ? `${appraisalMoney(item.unitPrice ?? null)} / ${item.unit}`
                            : '가격은 로그인 후 확인'}
                        </small>
                        <small>
                          {cart.member ? '판매 가능' : '담을 당시 수량'}{' '}
                          {item.availableQuantity} {item.unit} · 최소{' '}
                          {item.minimumOrderQuantity}
                        </small>
                        {item.issues.length > 0 && (
                          <small className="cart-warning" role="status">
                            {item.issues.join(' · ')}
                          </small>
                        )}
                      </span>
                    </div>
                    <div className="sm-basket-row-controls">
                      <Quantity
                        item={item}
                        change={cart.change}
                        disabled={!!batch && cart.member}
                      />
                      {cart.member && (
                        <strong>
                          {appraisalMoney(
                            appraisalTotal(
                              item.unitPrice ?? null,
                              item.quantity
                            )
                          )}
                        </strong>
                      )}
                      <button
                        className="sa-icon"
                        title="상품 삭제"
                        aria-label={`${item.name} 삭제`}
                        disabled={cart.busy}
                        onClick={() => cart.remove([item.id])}
                      >
                        <Trash2 size={16} />
                      </button>
                      {intents[item.id]?.error && (
                        <small className="cart-warning" role="alert">
                          {intents[item.id].error}
                          <button
                            className="sa-text-button"
                            onClick={() =>
                              cart.change(item.id, intents[item.id].quantity)
                            }
                          >
                            재시도
                          </button>
                        </small>
                      )}
                    </div>
                  </div>
                ))}
              </section>
              <aside
                className="sm-basket-summary"
                aria-label="장바구니 금액 요약"
              >
                <h2>
                  예상 견적 <span>{chosen.length}종 선택</span>
                </h2>
                {cart.member ? (
                  <>
                    <dl className="sm-basket-total">
                      <div>
                        <dt>기존 가격 합계</dt>
                        <dd>{appraisalMoney(String(original))}</dd>
                      </div>
                      <div>
                        <dt>할인 금액</dt>
                        <dd className="sm-green">
                          -{appraisalMoney(String(original - total))}
                        </dd>
                      </div>
                      <div>
                        <dt>예상 상품 금액</dt>
                        <dd>{appraisalMoney(String(total))}</dd>
                      </div>
                    </dl>
                    <p className="sa-form-note">VAT 포함 · 배송비 별도 협의</p>
                    {rows.some((item) => item.issues.length) && (
                      <p className="cart-warning">
                        재고·판매 조건 확인이 필요한 상품은 금액에서 제외됩니다.
                      </p>
                    )}
                    <button
                      className="sa-button sa-primary"
                      disabled
                      title="견적 요청 기능 준비 중"
                    >
                      <FileText size={15} />
                      선택 상품 견적 요청
                    </button>
                  </>
                ) : (
                  <>
                    <p>로그인 후 가격 확인</p>
                    <button
                      className="sa-button sa-primary"
                      onClick={() => {
                        cart.close()
                        onLogin()
                      }}
                    >
                      로그인
                    </button>
                  </>
                )}
              </aside>
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
