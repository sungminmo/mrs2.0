import { useState, type ReactNode } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import AdminShell from './AdminShell'
import './Faq.css'

const questions = [
  { category: '자산·보관', question: '검수 전 예상가치와 lot 수량은 어떻게 산정하나요?', answer: '보관 중 자산의 평가 가치는 입고 신청 시 등록한 품목, 규격, 상태와 예상 수량을 바탕으로 산정한 검수 전 참고 금액입니다. 입고 수량의 lot 표시는 검수 전에 파악한 대략적인 묶음 수량이며 실제 재고 수량이나 출고 가능 수량을 확정하지 않습니다. 1차 및 상세 검수에서 품목, 규격, 상태, 실수량을 확인한 결과에 따라 평가 가치와 수량이 변경될 수 있습니다. 판매 가격은 등록된 기준 판매가에 품질 등급별 일괄 할인율(S등급 10%, A등급 30%, B등급 50%)을 적용해 표시하며, 배송비·부가세와 최종 거래 조건은 별도로 확정됩니다.' },
  { category: '자산·보관', question: '새로운 자산은 어떻게 등록하나요?', answer: '내 자산에서 자산 등록을 선택한 후 자산명, 등급, 보관 위치, 수량과 평가 가치를 입력합니다. 신규 자산은 대기 중 상태로 등록됩니다.' },
  { category: '자산·보관', question: '보관 위치와 수량은 어디에서 확인하나요?', answer: '내 자산 목록에서 자재를 선택하면 상세 페이지의 보관 정보와 재고 및 출고 항목에서 확인할 수 있습니다.' },
  { category: '마켓·판매', question: '보관 중인 자산을 판매하려면 어떻게 하나요?', answer: '자산 상세에서 현재 상태를 판매 중으로 선택하고 확인창을 승인하면 판매 등록 양식이 열립니다. 희망가격을 입력해 등록 요청을 작성하면 검수 대기 상태로 변경됩니다. 현재 시제품에서는 실제 검수나 마켓 등록이 진행되지 않습니다.' },
  { category: '마켓·판매', question: '마켓에서 견적을 요청하거나 결제할 수 있나요?', answer: '자재 상세의 견적 요청에서 수량, 담당자명, 회신 이메일과 요청 사항을 작성하고 요청서를 다운로드할 수 있습니다. 현재 시제품은 공급사 전송이나 주문·결제를 지원하지 않습니다.' },
  { category: '마켓·판매', question: '등급 미확인은 어떤 의미인가요?', answer: '등록된 데이터에 품질 등급이 없는 상품입니다. 실제 등급과 규격, 자재 상태는 공급사 확인이 필요합니다. 참고 이미지만으로 등급을 판단하지 마세요.' },
  { category: '정산', question: '판매 수익과 보관 비용은 어디에서 확인하나요?', answer: '정산 관리에서 조회 기간을 선택하면 판매 수익, 보관 비용과 그 차액을 확인할 수 있습니다. 판매 수익 또는 보관 비용으로 내역을 구분하고 조회 결과를 CSV로 내보낼 수 있습니다.' },
  { category: '정산', question: '수익·비용 차액이 실제 입금액인가요?', answer: '아닙니다. 차액은 등록된 판매 정산 금액에서 보관 비용을 차감한 값입니다. 수수료, 세금과 미청구 비용은 반영되지 않습니다. 실제 지급액과 정산 일정은 담당 운영팀 확인이 필요합니다.' },
  { category: '정산', question: '보관 비용은 어떤 기준으로 계산되나요?', answer: '현재 화면은 기존 거래 내역에 등록된 보관 비용을 보여줍니다. 창고별 요율이나 보관 기간에 따른 자동 계산은 연결되어 있지 않습니다. 실제 요율과 청구 기준은 창고 운영팀에 확인해 주세요.' },
  { category: '계정', question: '저장한 데이터는 계속 유지되나요?', answer: '자산 변경, 장바구니와 담당자 정보는 메뉴를 이동해도 유지되지만 새로고침하면 초기화됩니다. 견적 요청서 작성 내용은 상세 페이지를 나가면 초기화되므로 필요한 요청서는 다운로드해 주세요.' },
]

export function Faq({ navigation }: { navigation: ReactNode }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const shown = questions.filter((item) => (category === '전체' || item.category === category) && `${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <AdminShell navigation={navigation}><main className="sa-main faq-page">
    <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 도움말</div><h1>F&Q</h1></div></div>
    <div className="sa-section-title"><h2>자주 묻는 질문</h2><span>{shown.length}건</span></div>
    <label className="op-search"><Search size={18} /><input aria-label="질문 검색" placeholder="질문 또는 키워드 검색" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="sa-icon" aria-label="검색 지우기" onClick={() => setQuery('')}><X size={16} /></button>}</label>
    <div className="sa-tabs op-faq-tabs" aria-label="질문 분류">{['전체', ...new Set(questions.map((item) => item.category))].map((value) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <section className="op-questions" aria-label="질문과 답변">{shown.map((item) => <details key={item.question}><summary><span className="op-question-category">{item.category}</span><span>{item.question}</span><ChevronDown size={17} /></summary><p>{item.answer}</p></details>)}{shown.length === 0 && <div className="sa-empty"><Search size={26} /><h2>검색 결과가 없습니다</h2><button className="sa-button" onClick={() => { setQuery(''); setCategory('전체') }}>전체 질문 보기</button></div>}</section>
  </main></AdminShell>
}