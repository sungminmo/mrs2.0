import { useEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpDown, Box, Check, ChevronRight, FileText, Grid2X2, Leaf, List, Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import AdminShell from './AdminShell'
import MarketCampaigns from './MarketCampaigns'
import QuoteRequestPage from './QuoteRequestPage'
import type { QuoteItem } from './QuoteRequestPage'
import './AdminAssets.css'
import './ShopifyMarket.css'

type Product = { name: string; price: number; original: number; unit: string; badge: string; category: string; discount: number; grade: 'S' | 'A' | 'B' | null }
type Basket = Record<string, number>
const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`
const materialImages: Record<string, { path: string; file: string; author: string; license: string }> = {
  '철강 / 금속': { path: '5/59/A_bunch_of_rebar_up_close.jpg/500px-A_bunch_of_rebar_up_close.jpg', file: 'A_bunch_of_rebar_up_close.jpg', author: 'W.carter', license: 'CC BY-SA 4.0' },
  '목재 / 합판': { path: 'd/da/Track%2C_Cattle_Grid_and_Lumber_Stack_at_North_Plantation_-_geograph.org.uk_-_5176324.jpg/500px-Track%2C_Cattle_Grid_and_Lumber_Stack_at_North_Plantation_-_geograph.org.uk_-_5176324.jpg', file: 'Track,_Cattle_Grid_and_Lumber_Stack_at_North_Plantation_-_geograph.org.uk_-_5176324.jpg', author: 'Peter Wood', license: 'CC BY-SA 2.0' },
  '콘크리트 / 시멘트': { path: '0/03/Concrete-block%2Cjapan.JPG/500px-Concrete-block%2Cjapan.JPG', file: 'Concrete-block,japan.JPG', author: 'katorisi', license: 'CC BY 2.5' },
  '배관 / 파이프': { path: 'a/a7/120_inch_HDPE_pipe_installation.jpg/500px-120_inch_HDPE_pipe_installation.jpg', file: '120_inch_HDPE_pipe_installation.jpg', author: 'Tomascastelazo', license: 'CC BY-SA 4.0' },
}
const beamImage = { path: '4/40/I-Beam_002.JPG/500px-I-Beam_002.JPG', file: 'I-Beam_002.JPG', author: 'Todd Murray', license: 'CC BY-SA 3.0' }
const imageFor = (product: Pick<Product, 'name' | 'category'>) => product.name.includes('H빔') ? beamImage : materialImages[product.category]

function focusCatalog() {
  requestAnimationFrame(() => {
    const heading = document.getElementById('market-catalog-title')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start' })
  })
}

function ProductImage({ product }: { product: Pick<Product, 'name' | 'category'> }) {
  const [failed, setFailed] = useState(false)
  const image = imageFor(product)
  return image && !failed ? <img src={`https://thumb.wikimedia.org/wikipedia/commons/thumb/${image.path}`} alt={`${product.category} 참고 이미지`} loading="lazy" onError={() => setFailed(true)} /> : <Box size={30} aria-label="이미지 없음" />
}

function ProductGrade({ grade }: { grade: Product['grade'] }) {
  return <span className={`sm-grade sm-grade-${grade?.toLowerCase() ?? 'unknown'}`}>{grade ? `${grade}등급` : '등급 미확인'}</span>
}

export default function ShopifyMarket({ products, navigation, basket, onBasketChange, isGuest = false, onLogin = () => {} }: { products: string[][]; navigation: ReactNode; basket: Basket; onBasketChange: Dispatch<SetStateAction<Basket>>; isGuest?: boolean; onLogin?: () => void }) {
  const catalog: Product[] = products.map(([name, price, original, unit, badge, category, grade]) => {
    const currentPrice = Number(price.replaceAll(',', ''))
    const originalPrice = Number(original.replaceAll(',', ''))
    return { name, price: currentPrice, original: originalPrice, unit, badge, category, discount: Math.round((1 - currentPrice / originalPrice) * 100), grade: grade === 'S' || grade === 'A' || grade === 'B' ? grade : null }
  })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체 자재')
  const [offer, setOffer] = useState('전체')
  const [sort, setSort] = useState('recommended')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [detail, setDetail] = useState<Product | null>(null)
  const [detailQuantity, setDetailQuantity] = useState(1)
  const [quote, setQuote] = useState<{ items: QuoteItem[]; source: 'product' | 'basket' } | null>(null)
  const [message, setMessage] = useState('')
  const listScroll = useRef(0)
  const basketDialog = useRef<HTMLDialogElement>(null)
  const categories = [...new Set(catalog.map((product) => product.category))]
  const shown = catalog.filter((product) =>
    `${product.name} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (category === '전체 자재' || product.category === category) &&
    (offer === '전체' || (offer === '40% 이상 할인' ? product.discount >= 40 : product.badge === '재고정리')),
  ).sort((first, second) => sort === 'price' ? first.price - second.price : sort === 'discount' ? second.discount - first.discount : 0)
  const basketProducts = catalog.filter((product) => basket[product.name] > 0)
  const basketCount = basketProducts.reduce((sum, product) => sum + basket[product.name], 0)
  const basketTotal = basketProducts.reduce((sum, product) => sum + product.price * basket[product.name], 0)
  const savings = basketProducts.reduce((sum, product) => sum + (product.original - product.price) * basket[product.name], 0)
  const maxDiscount = Math.max(...catalog.map((product) => product.discount), 0)
  const reset = () => { setQuery(''); setCategory('전체 자재'); setOffer('전체') }
  const openProduct = (product: Product) => { listScroll.current = window.scrollY; setMessage(''); setDetailQuantity(1); setDetail(product) }
  const openQuote = (items: { product: Product; quantity: number }[], source: 'product' | 'basket') => {
    if (!items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999)) return
    basketDialog.current?.close()
    setMessage('')
    setQuote({ source, items: items.map(({ product, quantity }) => ({ ...product, quantity, image: imageFor(product) ? `https://thumb.wikimedia.org/wikipedia/commons/thumb/${imageFor(product).path}` : undefined })) })
  }
  const closeQuote = () => {
    const source = quote?.source
    setQuote(null)
    if (source === 'basket') requestAnimationFrame(() => basketDialog.current?.showModal())
  }
  const closeProduct = () => {
    const name = detail?.name
    setDetail(null)
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('.sm-product-name, .sm-product-list .sa-asset-link')
      Array.from(buttons).find((button) => button.textContent === name)?.focus({ preventScroll: true })
      window.scrollTo(0, listScroll.current)
    })
  }
  const setBasketQuantity = (name: string, value: number) => onBasketChange((current) => {
    const next = { ...current }
    if (value <= 0) delete next[name]
    else next[name] = Math.min(9999, Math.floor(value))
    return next
  })
  const addProduct = (product: Product, count = 1) => {
    onBasketChange((current) => ({ ...current, [product.name]: Math.min(9999, (current[product.name] || 0) + count) }))
    setMessage(`${product.name}을 장바구니에 담았습니다.`)
  }
  function exportBasket() {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = [['상품명', '카테고리', '단가', '수량', '단위', '금액'], ...basketProducts.map((product) => [product.name, product.category, product.price, basket[product.name], product.unit, product.price * basket[product.name]])]
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'EcoMatX-market-quote.csv'
    link.click()
    URL.revokeObjectURL(url)
    setMessage('견적 목록을 CSV로 내보냈습니다.')
  }

  if (isGuest) return <GuestMarket products={catalog.map(({ name, category, unit, grade }) => ({ name, category, unit, grade }))} navigation={navigation} onLogin={onLogin} />

  return <AdminShell navigation={navigation} className="sm-market" search={detail || quote ? undefined : <label className="sa-global-search"><Search size={18} /><input aria-label="마켓 상품 검색" placeholder="자재명 또는 카테고리 검색" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="sa-icon" aria-label="검색 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>}>
    <main className="sa-main">
      {quote ? <QuoteRequestPage items={quote.items} onBack={closeQuote} backLabel={quote.source === 'basket' ? '장바구니로 돌아가기' : '상품 상세로 돌아가기'} /> : detail ? <MarketDetail key={detail.name} product={detail} initialQuantity={detailQuantity} onBack={closeProduct} onRequest={(quantity) => { setDetailQuantity(quantity); openQuote([{ product: detail, quantity }], 'product') }} /> : <>
      <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 마켓</div><h1>자재 마켓 <span>{catalog.length}</span></h1></div><button className="sa-button sa-primary" onClick={() => basketDialog.current?.showModal()}><ShoppingCart size={16} />장바구니 <span className="sm-cart-count">{basketCount}</span></button></div>
      <MarketCampaigns renderImage={(category) => <ProductImage key={category} product={{ name: '', category }} />} onSelect={(category) => { reset(); setCategory(category); setSort('recommended'); focusCatalog() }} />
      <section className="sm-summary" aria-label="마켓 현황"><div><span>등록 자재</span><strong>{catalog.length}<small>종</small></strong></div><div><span>자재 카테고리</span><strong>{categories.length}<small>개</small></strong></div><div><span>최대 할인율</span><strong className="sm-green">{maxDiscount}<small>%</small></strong></div><div><span>장바구니 예상 금액</span><strong>{money(basketTotal)}</strong></div></section>
      <div className="sm-catalog-heading"><h2 id="market-catalog-title" tabIndex={-1} style={{ scrollMarginTop: 76 }}>{category}</h2><span>{shown.length}종의 자재</span></div>
      <div className="sm-toolbar"><div className="sa-tabs" aria-label="상품 구분">{['전체', '40% 이상 할인', '재고정리'].map((item) => <button key={item} aria-pressed={offer === item} onClick={() => setOffer(item)}>{item}</button>)}</div><div className="sm-view" aria-label="상품 보기 방식"><button className="sa-icon" title="카드 보기" aria-label="카드 보기" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button className="sa-icon" title="목록 보기" aria-label="목록 보기" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div></div>
      <div className="sm-filterbar"><label>카테고리<select aria-label="상품 카테고리" value={category} onChange={(event) => setCategory(event.target.value)}>{['전체 자재', ...categories].map((item) => <option key={item}>{item}</option>)}</select></label><label className="sa-sort"><ArrowUpDown size={14} /><select aria-label="상품 정렬" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">추천순</option><option value="price">낮은 가격순</option><option value="discount">할인율 높은순</option></select></label>{(query || category !== '전체 자재' || offer !== '전체') && <button className="sa-text-button" onClick={reset}>필터 초기화<X size={13} /></button>}</div>
      {shown.length === 0 ? <div className="sa-empty"><Search size={28} /><h2>일치하는 자재가 없습니다</h2><button className="sa-button" onClick={reset}>전체 자재 보기</button></div> : view === 'grid' ? <div className="sm-product-grid">{shown.map((product) => <article className="sm-product" key={product.name}><button className="sm-product-image" aria-label={`${product.name} 상세 보기`} onClick={() => openProduct(product)}><ProductImage product={product} /><span className="sm-discount">{product.discount}% 할인</span></button><div className="sm-product-body"><div className="sm-product-meta"><span>{product.category}</span>{product.badge === '재고정리' && <span className="sm-clearance">재고정리</span>}</div><button className="sm-product-name" onClick={() => openProduct(product)}>{product.name}</button><ProductGrade grade={product.grade} /><div className="sm-price"><del>{money(product.original)}</del><strong>{money(product.price)}<small> / {product.unit}</small></strong></div><div className="sm-product-actions"><span>{basket[product.name] ? `${basket[product.name]} ${product.unit} 담김` : `단위당 ${money(product.original - product.price)} 절약`}</span><button className="sa-button" aria-label={`${product.name} 담기`} onClick={() => addProduct(product)}><Plus size={15} />담기</button></div></div></article>)}</div> : <div className="sa-inventory sm-product-list"><div className="sa-table-scroll"><table className="sa-table"><thead><tr><th>자재</th><th>카테고리</th><th>등급</th><th>할인율</th><th className="sa-numeric">기존 가격</th><th className="sa-numeric">판매 가격</th><th>구매</th></tr></thead><tbody>{shown.map((product) => <tr key={product.name}><td><button className="sa-asset-link" onClick={() => openProduct(product)}><span className="sa-thumbnail"><ProductImage product={product} /></span><b>{product.name}</b></button></td><td>{product.category}</td><td><ProductGrade grade={product.grade} /></td><td><span className="sa-badge selling">{product.discount}% 할인</span></td><td className="sa-numeric"><del>{money(product.original)}</del></td><td className="sa-numeric sa-value">{money(product.price)} / {product.unit}</td><td><button className="sa-button" aria-label={`${product.name} 담기`} onClick={() => addProduct(product)}><Plus size={15} />담기</button></td></tr>)}</tbody></table></div></div>}
      <div className="sm-results-footer"><span>총 {catalog.length}종 중 {shown.length}종 표시</span><span>판매 가격 · 원화 기준</span></div>
      </>}
      <footer className="sa-page-footer"><span><Leaf size={15} />자재의 다음 가치를 연결합니다.</span></footer>
      <details className="sa-photo-credits"><summary>참고 이미지 출처</summary><p>자재 종류를 보여주는 참고 이미지이며, 실제 판매 상품의 규격이나 외관과 다를 수 있습니다.</p>{[...Object.values(materialImages), beamImage].map((image) => <a key={image.file} href={`https://commons.wikimedia.org/wiki/File:${image.file}`} target="_blank" rel="noreferrer">{image.author} · {image.license} · Wikimedia Commons (화면에 맞게 자름)</a>)}</details>
    </main>
    <dialog ref={basketDialog} className="sa-dialog sm-basket-dialog" aria-label="마켓 장바구니"><div className="sa-dialog-heading"><h2>장바구니 <span>{basketProducts.length}종</span></h2><button className="sa-icon" aria-label="장바구니 닫기" onClick={() => basketDialog.current?.close()}><X size={18} /></button></div>{basketProducts.length === 0 ? <div className="sa-empty"><ShoppingCart size={30} /><h2>장바구니가 비어 있습니다</h2><button className="sa-button" onClick={() => basketDialog.current?.close()}>자재 둘러보기</button></div> : <>{basketProducts.map((product) => <div className="sm-basket-row" key={product.name}><span className="sa-thumbnail"><ProductImage product={product} /></span><div className="sm-basket-item"><b>{product.name}</b><small>{money(product.price)} / {product.unit}</small><div className="sm-quantity"><button className="sa-icon" aria-label={`${product.name} 수량 줄이기`} disabled={basket[product.name] <= 1} onClick={() => setBasketQuantity(product.name, basket[product.name] - 1)}><Minus size={14} /></button><input type="number" min="1" max="9999" aria-label={`${product.name} 수량`} value={basket[product.name]} onChange={(event) => setBasketQuantity(product.name, Math.max(1, Number(event.target.value) || 1))} /><button className="sa-icon" aria-label={`${product.name} 수량 늘리기`} disabled={basket[product.name] >= 9999} onClick={() => setBasketQuantity(product.name, basket[product.name] + 1)}><Plus size={14} /></button></div></div><div className="sm-basket-price"><button className="sa-icon" title="상품 삭제" aria-label={`${product.name} 삭제`} onClick={() => setBasketQuantity(product.name, 0)}><Trash2 size={16} /></button><strong>{money(product.price * basket[product.name])}</strong></div></div>)}<dl className="sm-basket-total"><div><dt>기존 가격 합계</dt><dd>{money(basketTotal + savings)}</dd></div><div><dt>할인 금액</dt><dd className="sm-green">-{money(savings)}</dd></div><div><dt>예상 상품 금액</dt><dd>{money(basketTotal)}</dd></div></dl><p className="sa-form-note">장바구니는 메뉴 이동 시 유지되며 새로고침 시 초기화됩니다. 배송비·세금은 별도 확인이 필요하며 주문이나 결제는 진행되지 않습니다.</p><div className="sa-dialog-actions"><button className="sa-button" onClick={() => basketDialog.current?.close()}>계속 둘러보기</button><div><button className="sa-button" onClick={exportBasket}><ArrowDownToLine size={15} />견적 목록 다운로드</button><button className="sa-button sa-primary" onClick={() => openQuote(basketProducts.map((product) => ({ product, quantity: basket[product.name] })), 'basket')}><FileText size={16} />견적 요청</button></div></div></>}</dialog>
    {message && <div className="sa-notice" role="status"><Check size={17} /><span>{message}</span><button className="sa-icon" aria-label="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}
  </AdminShell>
}

type PublicProduct = Pick<Product, 'name' | 'category' | 'unit' | 'grade'>

function GuestMarket({ products, navigation, onLogin }: { products: PublicProduct[]; navigation: ReactNode; onLogin: () => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체 자재')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [detail, setDetail] = useState<PublicProduct | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }) }, [detail])
  const shown = products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase()) && (category === '전체 자재' || product.category === category))
  return <AdminShell navigation={navigation} className="sm-market" isGuest search={detail ? undefined : <label className="sa-global-search"><Search size={18} /><input aria-label="마켓 상품 검색" placeholder="자재명 또는 카테고리 검색" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="sa-icon" aria-label="검색 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>}>
    <main className="sa-main">
      {detail ? <article className="sm-detail-page"><div className="sm-detail-title"><button className="sa-icon" aria-label="마켓 목록으로" title="마켓 목록으로" onClick={() => setDetail(null)}><ArrowLeft size={18} /></button><h1 tabIndex={-1} ref={heading}>{detail.name}</h1></div><div className="sm-detail-layout"><div><figure className="sm-material-figure"><div><ProductImage product={detail} /></div><figcaption>자재 종류 참고 이미지</figcaption></figure><section className="sm-material-section"><h2>자재 정보</h2><dl className="sm-material-fields">{[['카테고리', detail.category], ['거래 단위', detail.unit], ['품질 등급', detail.grade ? `${detail.grade}등급` : '등급 미확인'], ['규격', '공급사 확인 필요']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div><aside className="sm-quote-panel"><h2>가격 및 견적</h2><p className="sm-guest-price">로그인 후 가격 확인</p><button className="sa-button sa-primary" onClick={onLogin}><FileText size={16} />로그인하고 견적 요청</button></aside></div></article> : <>
        <div className="sa-heading"><div><div className="sa-breadcrumb">둘러보기 <span>/</span> 마켓</div><h1 ref={heading} tabIndex={-1}>자재 마켓 <span>{products.length}</span></h1></div><button className="sa-button sa-primary" onClick={onLogin}>로그인</button></div>
        <div className="sm-guest-notice"><span>상품 가격은 로그인 후 확인할 수 있습니다.</span><button className="sa-text-button" onClick={onLogin}>로그인<ArrowRight size={15} /></button></div>
        <MarketCampaigns renderImage={(category) => <ProductImage key={category} product={{ name: '', category }} />} onSelect={(category) => { setQuery(''); setCategory(category); focusCatalog() }} />
        <div className="sm-toolbar"><h2 id="market-catalog-title" tabIndex={-1} style={{ scrollMarginTop: 76 }} className="sm-guest-heading">{category} · {shown.length}종</h2><div className="sm-view"><button className="sa-icon" title="카드 보기" aria-label="카드 보기" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button className="sa-icon" title="목록 보기" aria-label="목록 보기" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div></div>
        <div className="sm-filterbar"><label>카테고리<select aria-label="상품 카테고리" value={category} onChange={(event) => setCategory(event.target.value)}>{['전체 자재', ...new Set(products.map((product) => product.category))].map((item) => <option key={item}>{item}</option>)}</select></label></div>
        {!shown.length ? <div className="sa-empty"><Search size={28} /><h2>일치하는 자재가 없습니다</h2><button className="sa-button" onClick={() => { setQuery(''); setCategory('전체 자재') }}>전체 자재 보기</button></div> : view === 'grid' ? <div className="sm-product-grid">{shown.map((product) => <article className="sm-product" key={product.name}><button className="sm-product-image" aria-label={`${product.name} 상세 보기`} onClick={() => setDetail(product)}><ProductImage product={product} /></button><div className="sm-product-body"><div className="sm-product-meta">{product.category}</div><button className="sm-product-name" onClick={() => setDetail(product)}>{product.name}</button><ProductGrade grade={product.grade} /><p className="sm-guest-price">로그인 후 가격 확인</p><button className="sa-button" onClick={onLogin}>로그인</button></div></article>)}</div> : <div className="sa-inventory"><div className="sa-table-scroll"><table className="sa-table"><thead><tr><th>자재</th><th>카테고리</th><th>등급</th><th>거래 단위</th><th>가격</th></tr></thead><tbody>{shown.map((product) => <tr key={product.name}><td><button className="sa-asset-link" onClick={() => setDetail(product)}><span className="sa-thumbnail"><ProductImage product={product} /></span><b>{product.name}</b></button></td><td>{product.category}</td><td><ProductGrade grade={product.grade} /></td><td>{product.unit}</td><td><button className="sa-text-button" onClick={onLogin}>로그인 후 확인</button></td></tr>)}</tbody></table></div></div>}
      </>}
      <footer className="sa-page-footer"><span><Leaf size={15} />자재의 다음 가치를 연결합니다.</span></footer>
      <details className="sa-photo-credits"><summary>참고 이미지 출처</summary>{[...Object.values(materialImages), beamImage].map((image) => <a key={image.file} href={`https://commons.wikimedia.org/wiki/File:${image.file}`} target="_blank" rel="noreferrer">{image.author} · {image.license} · Wikimedia Commons</a>)}</details>
    </main>
  </AdminShell>
}

function MarketDetail({ product, initialQuantity, onBack, onRequest }: { product: Product; initialQuantity: number; onBack: () => void; onRequest: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(String(initialQuantity))
  const heading = useRef<HTMLHeadingElement>(null)
  const count = Number(quantity)
  const validQuantity = Number.isInteger(count) && count >= 1 && count <= 9999
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }) }, [])
  return <article className="sm-detail-page">
    <div className="sm-detail-breadcrumb"><button onClick={onBack}>마켓</button><ChevronRight size={13} /><span>{product.category}</span><ChevronRight size={13} /><span>자재 상세</span></div>
    <div className="sm-detail-title"><button className="sa-icon" title="마켓 목록으로" aria-label="마켓 목록으로" onClick={onBack}><ArrowLeft size={18} /></button><div><h1 ref={heading} tabIndex={-1}>{product.name}</h1><div className="sm-detail-tags"><span>{product.category}</span><ProductGrade grade={product.grade} /><span className="sa-badge selling">{product.discount}% 할인</span>{product.badge === '재고정리' && <span className="sa-badge pending">재고정리</span>}</div></div></div>
    <div className="sm-detail-layout">
      <div className="sm-detail-content">
        <figure className="sm-material-figure"><div><ProductImage product={product} /></div><figcaption>자재 종류 참고 이미지 · 실제 판매 상품의 규격이나 외관과 다를 수 있습니다.</figcaption></figure>
        <section className="sm-material-section"><h2>자재 정보</h2><dl className="sm-material-fields">{[['자재명', product.name], ['카테고리', product.category], ['거래 단위', product.unit], ['판매 단가', `${money(product.price)} / ${product.unit}`], ['품질 등급', product.grade ? `${product.grade}등급` : '등급 미확인'], ['규격', '공급사 확인 필요'], ['재고 및 출고 일정', '견적 협의 시 확인']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="sm-material-section"><h2>납품 및 견적 안내</h2><dl className="sm-delivery-fields"><div><dt>납품 조건</dt><dd>희망 수량과 납품 장소에 따라 운송비 및 출고 가능 일정을 확인합니다.</dd></div><div><dt>가격 기준</dt><dd>표시 금액은 등록 단가 기준입니다. 배송비와 부가세 포함 여부, 최종 공급가는 별도 확인이 필요합니다.</dd></div><div><dt>품질 확인</dt><dd>실제 규격, 등급, 자재 상태는 공급사 확인 후 결정해 주세요.</dd></div></dl></section>
      </div>
      <aside className="sm-quote-panel" aria-label="견적 정보">
        <h2>견적 정보</h2><span className="sm-unit-price-label">등록 단가</span><div className="sm-price"><del>{money(product.original)}</del><strong>{money(product.price)}<small> / {product.unit}</small></strong></div><p className="sm-unit-saving">단위당 {money(product.original - product.price)} 절약</p>
        <form onSubmit={(event) => { event.preventDefault(); if (validQuantity) onRequest(count) }}>
          <div className="sm-quote-quantity"><label htmlFor="sm-quote-quantity">견적 수량 ({product.unit})</label><div className="sm-quantity"><button type="button" className="sa-icon" title="수량 줄이기" aria-label="견적 수량 줄이기" disabled={count <= 1} onClick={() => setQuantity(String(Math.max(1, (validQuantity ? count : 1) - 1)))}><Minus size={15} /></button><input id="sm-quote-quantity" type="number" required min="1" max="9999" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><button type="button" className="sa-icon" title="수량 늘리기" aria-label="견적 수량 늘리기" disabled={count >= 9999} onClick={() => setQuantity(String(Math.min(9999, (validQuantity ? count : 0) + 1)))}><Plus size={15} /></button></div></div>
          <div className="sm-quote-total"><span>예상 자재 금액</span><strong aria-live="polite">{validQuantity ? money(product.price * count) : '-'}</strong></div><p className="sa-form-note">배송비·부가세 별도 확인. 주문이나 결제는 진행되지 않습니다.</p>
          <button type="submit" className="sa-button sa-primary sm-quote-cta"><FileText size={17} />견적 요청</button>
        </form>
      </aside>
    </div>
  </article>
}