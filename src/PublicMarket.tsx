import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpDown, Box, ChevronDown, ChevronLeft, ChevronRight, FileText, Grid2X2, Leaf, List, Minus, Plus, RefreshCw, RotateCcw, Search, ShoppingCart, SlidersHorizontal, X } from 'lucide-react'
import { appraisalMoney, appraisalTotal } from './appraisal'
import { authenticatedFetch } from './authSession'
import CategorySelect from './CategorySelect'
import { categoryMatches, categoryPath, type MaterialCategory } from './categories'
import MarketCampaigns, { type MarketCampaign } from './MarketCampaigns'
import { useHistoryState } from './useHistoryState'
import './AdminAssets.css'
import './ShopifyMarket.css'
import './PublicMarket.css'

type Product = { id: string; name: string; unitPrice?: string; originalUnitPrice?: string; discountRate: number; quantity: string; minimumOrderQuantity: string; unit: string; category: { id: string; name: string; path: string } | null; grade: string; brand: string; specification: string; imageUrl: string | null; deliveryNotice: string }
type Catalog = { products: Product[]; categories: MaterialCategory[]; campaigns: MarketCampaign[]; page: number; size: number; total: number }
type Filters = { q: string; categoryId: string; grade: string; campaignId: string }
const emptyFilters: Filters = { q: '', categoryId: '', grade: '', campaignId: '' }
const unitLabels: Record<string, string> = { SET: 'Set', ROLL: '롤', BAR: '봉', SURFACE: '면', BOX: 'Box', PIECE: '본', PAIR: '켤레', GROUP: '조', SHEET: '장', SETUP: '식', CASE: '건', CONTAINER: '통', BUNDLE: '묶음', UNIT: '대', BAG: '포', PACK: '곽', CARTON: '갑', OTHER: '기타', KG: 'kg', TON: 'ton', M3: 'm³' }
const unit = (product: Product) => unitLabels[product.unit] ?? product.unit
const price = (value?: string) => value === undefined ? '미등록' : appraisalMoney(value)

export default function PublicMarket({ member = false, onLogin = () => {} }: { member?: boolean; onLogin?: () => void }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [draft, setDraft] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('latest')
  const [discountOnly, setDiscountOnly] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [revision, setRevision] = useState(0)
  const [loadedCatalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, selectProduct, backProduct] = useHistoryState<string | null>(member ? 'member-market-product' : 'public-market-product', null)
  const [error, setError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const listScroll = useRef(0)
  const params = new URLSearchParams({ page: String(page), size: '20', sort })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  if (discountOnly) params.set('discountOnly', 'true')
  const requestQuery = params.toString()
  const loadKey = `${member}/${requestQuery}/${revision}`
  const loading = loadedKey !== loadKey
  const catalog = loading ? null : loadedCatalog
  useEffect(() => {
    const controller = new AbortController()
    const request = member ? authenticatedFetch : fetch
    request(`${member ? '/api/customer/market/products' : '/api/market/products'}?${requestQuery}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? '상품을 불러오지 못했습니다.')
      if (!controller.signal.aborted) { setCatalog(body.data); setError('') }
    }).catch((failure) => { if (!controller.signal.aborted) { setCatalog(null); setError(failure instanceof Error ? failure.message : '조회 실패') } }).finally(() => { if (!controller.signal.aborted) setLoadedKey(loadKey) })
    return () => controller.abort()
  }, [member, requestQuery, revision, loadKey])
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [selected])
  const product = catalog?.products.find((entry) => entry.id === selected)
  const categories = loadedCatalog?.categories ?? []
  const campaigns = loadedCatalog?.campaigns ?? []
  const apply = (next: Filters) => { setFilters(next); setPage(1) }
  const reset = () => { setDraft(emptyFilters); apply(emptyFilters); setDiscountOnly(false) }
  const open = (entry: Product) => { listScroll.current = window.scrollY; selectProduct(entry.id); window.scrollTo(0, 0) }
  const back = () => { backProduct(); requestAnimationFrame(() => window.scrollTo(0, listScroll.current)) }
  return <section className="public-market" aria-label="마켓 상품">
    {selected ? <>
      {!product && <button className="sa-button" onClick={back}><ArrowLeft size={16} />마켓 목록으로</button>}
      {product && <MarketProductDetail key={product.id} product={product} member={member} onBack={back} onLogin={onLogin} />}
      {!loading && !error && !product && <div className="sa-empty"><Box size={28} /><h2>현재 판매 가능한 상품을 찾을 수 없습니다</h2></div>}
    </> : <>
      <div className="sa-heading"><div><div className="sa-breadcrumb">{member ? '워크스페이스' : '둘러보기'} <span>/</span> 마켓</div><h1 ref={heading} tabIndex={-1}>자재 마켓 <span>{catalog?.total ?? loadedCatalog?.total ?? 0}</span></h1></div><div className="customer-heading-actions"><button className="sa-icon" aria-label="상품 새로고침" title="상품 새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button>{member ? <button className="sa-button sa-primary" disabled title="장바구니 기능 준비 중"><ShoppingCart size={16} />장바구니 <span className="sm-cart-count">0</span></button> : <button className="sa-button sa-primary" onClick={onLogin}>로그인</button>}</div></div>
      {!member && <div className="sm-guest-notice"><span>상품 가격은 로그인 후 확인할 수 있습니다.</span><button className="sa-text-button" onClick={onLogin}>로그인<ChevronRight size={15} /></button></div>}
      <MarketCampaigns campaigns={campaigns} categories={categories} renderImage={(category) => { const entry = loadedCatalog?.products.find((item) => categoryMatches(categories, item.category?.id ?? '', category)); return entry ? <ProductImage key={entry.imageUrl} product={entry} /> : <Box size={30} aria-label="등록된 기획전 사진 없음" /> }} onSelect={(campaign) => { const next = { ...emptyFilters, campaignId: campaign.id }; setDraft(next); apply(next); setDiscountOnly(false); document.getElementById('public-market-catalog')?.scrollIntoView({ block: 'start' }) }} />
      <form className="sa-detail-search sm-market-search" onSubmit={(event) => { event.preventDefault(); apply(draft) }}><div className="sa-detail-search-heading"><div><h2>상세 검색</h2></div><button type="button" className="sa-filter-toggle" aria-expanded={expanded} aria-controls="public-market-filter" onClick={() => { if (!expanded) setDraft(filters); setExpanded(!expanded) }}><SlidersHorizontal size={14} />상세 필터{[filters.categoryId, filters.grade, filters.campaignId].filter(Boolean).length > 0 && <span className="sa-filter-count">{[filters.categoryId, filters.grade, filters.campaignId].filter(Boolean).length}</span>}<ChevronDown size={14} className="sa-chevron" /></button></div><div className="sa-detail-search-bar"><label className="sa-detail-keyword"><Search size={15} /><input aria-label="마켓 상세 검색어" placeholder="자재명 또는 카테고리 검색" maxLength={160} value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} />{draft.q && <button type="button" className="sa-icon sa-detail-keyword-clear" aria-label="검색어 지우기" onClick={() => setDraft({ ...draft, q: '' })}><X size={13} /></button>}</label><div className="sa-detail-search-buttons"><button className="sa-button" type="button" onClick={reset}><RotateCcw size={13} />초기화</button><button className="sa-button sa-primary"><Search size={14} />검색</button></div></div><div id="public-market-filter" className={`sa-filter-panel${expanded ? ' is-open' : ''}`} inert={!expanded}><div className="sa-filter-panel-inner"><CategorySelect categories={categories} value={draft.categoryId} onChange={(categoryId) => setDraft({ ...draft, categoryId })} /><div className="sm-search-fields"><label>등급<select value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value })}><option value="">전체</option>{['S', 'A', 'B'].map((grade) => <option key={grade}>{grade}</option>)}</select></label><label>기획전<select value={draft.campaignId} onChange={(event) => setDraft({ ...draft, campaignId: event.target.value })}><option value="">전체 기획전</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label></div></div></div></form>
      <div className="sm-catalog-heading"><h2 id="public-market-catalog">{filters.categoryId ? categoryPath(categories, filters.categoryId) : '전체 자재'}</h2><span>{catalog?.total ?? 0}종의 자재</span></div><div className="sm-toolbar sm-catalog-toolbar"><div className="sa-tabs" aria-label="상품 구분">{[false, true].map((discount) => <button key={String(discount)} aria-pressed={discountOnly === discount} onClick={() => { setDiscountOnly(discount); setPage(1) }}>{discount ? '40% 이상 할인' : '전체'}</button>)}</div><div className="sa-table-controls"><div className="sm-view" aria-label="상품 보기 방식"><button className="sa-icon" aria-label="카드 보기" title="카드 보기" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button className="sa-icon" aria-label="목록 보기" title="목록 보기" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div><label className="sa-sort"><ArrowUpDown size={14} /><select aria-label="상품 정렬" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="latest">최신순</option>{member && <option value="price">낮은 가격순</option>}<option value="discount">할인율 높은순</option></select></label></div></div>
      {catalog && (catalog.products.length ? view === 'grid' ? <div className="sm-product-grid">{catalog.products.map((entry) => <article className="sm-product" key={entry.id}><button className="sm-product-image" aria-label={`${entry.name} 상세 보기`} onClick={() => open(entry)}><ProductImage product={entry} />{entry.discountRate > 0 && <span className="sm-discount">{entry.discountRate}% 할인</span>}</button><div className="sm-product-body"><div className="sm-product-meta">{entry.category?.path ?? '미분류'}</div><button className="sm-product-name" onClick={() => open(entry)}>{entry.name}</button><ProductGrade product={entry} /><ProductPrice product={entry} member={member} /><div className="sm-product-actions"><span>판매 가능 {entry.quantity} {unit(entry)}</span>{member ? <button className="sa-button" disabled title="장바구니 기능 준비 중" aria-label={`${entry.name} 담기`}><Plus size={15} />담기</button> : <button className="sa-button" onClick={onLogin}>로그인</button>}</div></div></article>)}</div> : <div className="sa-inventory sm-product-list"><div className="sa-table-scroll"><table className="sa-table"><thead><tr>{['자재', '카테고리', '등급', '할인율', '판매 가능 수량', '판매 가격', '구매'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{catalog.products.map((entry) => <tr key={entry.id}><td><button className="sa-asset-link" aria-label={`${entry.name} 상세 보기`} onClick={() => open(entry)}><span className="sa-thumbnail"><ProductImage product={entry} /></span><b>{entry.name}</b></button></td><td>{entry.category?.path ?? '미분류'}</td><td><ProductGrade product={entry} /></td><td>{entry.discountRate > 0 ? `${entry.discountRate}% 할인` : '-'}</td><td>{entry.quantity} {unit(entry)}</td><td>{member ? `${price(entry.unitPrice)} / ${unit(entry)}` : <button className="sa-text-button" onClick={onLogin}>로그인 후 확인</button>}</td><td><button className="sa-button" disabled title="장바구니 기능 준비 중"><Plus size={14} />담기</button></td></tr>)}</tbody></table></div></div> : <div className="sa-empty"><Search size={28} /><h2>조건에 맞는 자재가 없습니다</h2><button className="sa-button" onClick={reset}>전체 자재 보기</button></div>)}
      {catalog && <><div className="sm-results-footer"><span>총 {catalog.total}종 중 {catalog.products.length}종 표시</span><span>{member ? '판매 단가 · VAT 포함' : '가격은 로그인 후 확인'}</span></div><div className="customer-pagination"><button className="sa-icon" aria-label="이전 상품 페이지" title="이전 상품 페이지" disabled={catalog.page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={20} /></button><span>{catalog.page} / {Math.max(1, Math.ceil(catalog.total / catalog.size))}</span><button className="sa-icon" aria-label="다음 상품 페이지" title="다음 상품 페이지" disabled={catalog.page * catalog.size >= catalog.total} onClick={() => setPage(page + 1)}><ChevronRight size={20} /></button></div></>}
    </>}
    {loading && <p className="public-market-loading" role="status">상품을 불러오는 중...</p>}{!loading && error && <p className="customer-error" role="alert">{error}<button className="sa-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />다시 조회</button></p>}
    <footer className="sa-page-footer"><span><Leaf size={15} />자재의 다음 가치를 연결합니다.</span></footer>
  </section>
}

function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  return product.imageUrl && !failed ? <img src={product.imageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} /> : <span className="public-market-no-image"><Box size={30} />{failed ? '사진 조회 실패' : '등록된 사진 없음'}</span>
}

function ProductGrade({ product }: { product: Product }) {
  return <span className={`sm-grade sm-grade-${product.grade.toLowerCase()}`}>{product.grade}등급</span>
}

function ProductPrice({ product, member }: { product: Product; member: boolean }) {
  return member ? <div className="sm-price">{product.discountRate > 0 && <del>{price(product.originalUnitPrice)}</del>}<strong>{price(product.unitPrice)}<small> / {unit(product)}</small></strong></div> : <p className="sm-guest-price">로그인 후 가격 확인</p>
}

function MarketProductDetail({ product, member, onBack, onLogin }: { product: Product; member: boolean; onBack: () => void; onLogin: () => void }) {
  const [quantity, setQuantity] = useState(product.minimumOrderQuantity)
  const heading = useRef<HTMLHeadingElement>(null)
  const count = Number(quantity)
  const integerUnit = ['EA', 'BOX', 'PIECE'].includes(product.unit)
  const step = integerUnit ? 1 : 0.001
  const valid = /^\d+(?:\.\d{1,3})?$/.test(quantity) && (!integerUnit || Number.isInteger(count)) && count >= Number(product.minimumOrderQuantity) && count <= Number(product.quantity)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  return <article className="sm-detail-page"><div className="sm-detail-breadcrumb"><button onClick={onBack}>마켓</button><ChevronRight size={13} /><span>{product.category?.path ?? '미분류'}</span><ChevronRight size={13} /><span>자재 상세</span></div><div className="sm-detail-title"><button className="sa-icon" aria-label="마켓 목록으로" title="마켓 목록으로" onClick={onBack}><ArrowLeft size={18} /></button><div><h1 ref={heading} tabIndex={-1}>{product.name}</h1><div className="sm-detail-tags"><span>{product.category?.path ?? '미분류'}</span><ProductGrade product={product} />{product.discountRate > 0 && <span className="sa-badge selling">{product.discountRate}% 할인</span>}</div></div></div><div className="sm-detail-layout"><div className="sm-detail-content"><figure className="sm-material-figure"><div><ProductImage product={product} /></div><figcaption>{product.name}</figcaption></figure><section className="sm-material-section"><h2>자재 정보</h2><dl className="sm-material-fields">{[['자재명', product.name], ['상품번호', product.id], ['카테고리', product.category?.path ?? '미분류'], ['거래 단위', unit(product)], ['품질 등급', `${product.grade}등급`], ['규격', product.specification || '미등록'], ['브랜드', product.brand || '미등록'], ['판매 가능 수량', `${product.quantity} ${unit(product)}`], ['최소 주문 수량', `${product.minimumOrderQuantity} ${unit(product)}`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="sm-material-section"><h2>납품 안내</h2><dl className="sm-delivery-fields"><div><dt>배송 및 출고</dt><dd>{product.deliveryNotice || '납품 조건 및 출고 일정은 별도 협의'}</dd></div><div><dt>가격 기준</dt><dd>등록 판매 단가는 VAT 포함이며 배송비는 별도 협의합니다.</dd></div></dl></section></div><aside className="sm-quote-panel" aria-label="견적 정보"><h2>{member ? '견적 정보' : '가격 및 견적'}</h2>{member ? <><span className="sm-unit-price-label">등록 단가 · VAT 포함</span><ProductPrice product={product} member />{product.discountRate > 0 && product.originalUnitPrice && product.unitPrice && <p className="sm-unit-saving">단위당 {appraisalMoney(String(BigInt(product.originalUnitPrice) - BigInt(product.unitPrice)))} 절약</p>}<div className="sm-quote-quantity"><label htmlFor="public-market-quantity">견적 수량 ({unit(product)})</label><div className="sm-quantity"><button className="sa-icon" aria-label="견적 수량 줄이기" title="견적 수량 줄이기" disabled={!valid || count <= Number(product.minimumOrderQuantity)} onClick={() => setQuantity(String(Math.max(Number(product.minimumOrderQuantity), Math.round((count - step) * 1000) / 1000)))}><Minus size={15} /></button><input id="public-market-quantity" type="number" min={product.minimumOrderQuantity} max={product.quantity} step={step} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={!valid} /><button className="sa-icon" aria-label="견적 수량 늘리기" title="견적 수량 늘리기" disabled={!valid || count >= Number(product.quantity)} onClick={() => setQuantity(String(Math.min(Number(product.quantity), Math.round((count + step) * 1000) / 1000)))}><Plus size={15} /></button></div></div><div className="sm-quote-total"><span>예상 자재 금액</span><strong aria-live="polite">{valid ? price(appraisalTotal(product.unitPrice, quantity) ?? undefined) : '-'}</strong></div><div className="sm-detail-actions"><button className="sa-button" disabled title="장바구니 기능 준비 중"><ShoppingCart size={16} />장바구니 담기</button><button className="sa-button sa-primary" disabled title="견적 요청 기능 준비 중"><FileText size={17} />견적 요청</button></div></> : <><ProductPrice product={product} member={false} /><button className="sa-button sa-primary" onClick={onLogin}><FileText size={16} />로그인하고 견적 요청</button></>}</aside></div></article>
}