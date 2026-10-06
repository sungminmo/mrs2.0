import { useEffect, useState } from 'react'
import { ArrowLeft, Box, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { appraisalMoney } from './appraisal'

type Product = { id: string; name: string; unitPrice: string; originalUnitPrice: string; discountRate: number; quantity: string; minimumOrderQuantity: string; unit: string; category: { id: string; name: string } | null; grade: string; brand: string; specification: string; imageUrl: string | null; deliveryNotice: string }
type Catalog = { products: Product[]; page: number; size: number; total: number }

export default function PublicMarket() {
  const [query, setQuery] = useState({ page: 1, q: '' })
  const [revision, setRevision] = useState(0)
  const [loadedCatalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const loadKey = `${query.page}/${query.q}/${revision}`
  const loading = loadedKey !== loadKey
  const catalog = loading ? null : loadedCatalog
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/market/products?${new URLSearchParams({ page: String(query.page), size: '20', q: query.q })}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? '상품을 불러오지 못했습니다.')
      if (!controller.signal.aborted) { setCatalog(body.data); setError('') }
    }).catch((failure) => { if (!controller.signal.aborted) { setCatalog(null); setError(failure instanceof Error ? failure.message : '조회 실패') } }).finally(() => { if (!controller.signal.aborted) setLoadedKey(loadKey) })
    return () => controller.abort()
  }, [query.page, query.q, revision, loadKey])
  const product = catalog?.products.find((entry) => entry.id === selected)
  return <section aria-label="마켓 상품"><form className="customer-filters" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setSelected(null); setQuery({ page: 1, q: String(form.get('q') ?? '').trim() }) }}><label className="customer-search">상품 검색<input name="q" maxLength={160} defaultValue={query.q} placeholder="상품명" /></label><button className="sa-button sa-primary"><Search size={16} />검색</button><button className="sa-icon" type="button" aria-label="상품 새로고침" title="상품 새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></form>
    {loading && <p role="status">상품을 불러오는 중...</p>}{!loading && error && <p className="customer-error" role="alert">{error}<button className="sa-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />다시 조회</button></p>}
    {product ? <section className="customer-section"><button className="sa-button" onClick={() => setSelected(null)}><ArrowLeft size={16} />상품 목록</button><h2>{product.name}</h2><ProductImage product={product} /><dl className="customer-data">{[['상품번호', product.id], ['분류', product.category?.name ?? '미분류'], ['판매 단가', appraisalMoney(product.unitPrice)], ['판매 가능 수량', `${product.quantity} ${product.unit}`], ['최소 주문 수량', `${product.minimumOrderQuantity} ${product.unit}`], ['등급', product.grade], ['규격', product.specification], ['브랜드', product.brand], ['배송 안내', product.deliveryNotice || '별도 협의']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section> : catalog && <><p className="customer-result-heading">{catalog.total.toLocaleString()}개 상품</p><div className="customer-market-grid">{catalog.products.map((entry) => <article key={entry.id}><ProductImage product={entry} /><button className="sa-asset-link" onClick={() => setSelected(entry.id)}>{entry.name}</button><p>{entry.category?.name ?? '미분류'} · {entry.grade}등급</p><strong>{appraisalMoney(entry.unitPrice)} / {entry.unit}</strong><p>판매 가능 {entry.quantity} {entry.unit}</p></article>)}</div>{!catalog.products.length && <p className="customer-empty">현재 조회 가능한 상품이 없습니다.</p>}<div className="customer-pagination"><button className="sa-icon" aria-label="이전 상품 페이지" title="이전 상품 페이지" disabled={catalog.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}><ChevronLeft size={20} /></button><span>{catalog.page} / {Math.max(1, Math.ceil(catalog.total / catalog.size))}</span><button className="sa-icon" aria-label="다음 상품 페이지" title="다음 상품 페이지" disabled={catalog.page * catalog.size >= catalog.total} onClick={() => setQuery({ ...query, page: query.page + 1 })}><ChevronRight size={20} /></button></div></>}
  </section>
}

function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  return <div className="customer-market-image">{product.imageUrl && !failed ? <img src={product.imageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} /> : <span><Box size={32} />{failed ? '사진 조회 실패' : '등록된 사진 없음'}</span>}</div>
}