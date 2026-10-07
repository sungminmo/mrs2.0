# 구매 견적 요청 (2026-10-07)

활성 고객사 소속 활성 CUSTOMER의 VIEWER·MANAGER 모두 요청할 수 있다. 같은 고객사 회원은 요청 내역을 공유하지만 장바구니는 개인별이다. 비회원은 제출·가격 조회 불가이며 관리자는 마켓 운영 > 구매 견적에서 접수 목록·상세만 조회한다. 상태는 `RECEIVED`(접수 완료) 하나이다.

## API

모든 고객 경로는 고객 Bearer 토큰과 `Cache-Control: private, no-store`를 사용한다.

| 메서드 | 경로 | 계약 |
| --- | --- | --- |
| POST | `/api/customer/quotes/preview` | `{source:"cart"\|"product",items:[{productId,quantity,cartItemId?,expectedVersion?}]}` → `data.{company,items,originalTotal,total,snapshot}` |
| POST | `/api/customer/quotes` | 미리보기 입력 + `{operationId,expectedSnapshot,contact:{name,phone,email?},address?,deliveryDate?,note?}` → 201 `data.{quote,replayed:false}`, 동일 요청 재시도 200 `data.{quote,replayed:true}` |
| GET | `/api/customer/quotes` | `page=1,size=20,q`, size 최대 100 → `data.{records,page,size,total}`. 목록 items는 첫 품목 요약만 포함 |
| GET | `/api/customer/quotes/{id}` | 자사 견적 전체 스냅샷. 다른 고객사·없는 ID는 404 |
| GET | `/api/admin/data?scope=quotes` | 기존 관리자 페이지·검색·고객·기간·상태 필터. `id`로 전체 상세 조회. 상태 필터는 `접수 완료` |

items는 중복 없는 1~100종이다. 수량은 0 초과~10억, 소수 3자리 이하 문자열이며 EA·BOX·PIECE는 정수다. cart 출처는 개인 장바구니 행 UUID·버전 필수, product 출처는 두 필드 금지다. 담당자명(80자)·전화(40자)는 필수, 이메일(254자)·주소(300자)·희망납기일·요청사항(1000자)은 선택이다. 날짜는 실제 `YYYY-MM-DD`, KST 오늘 이후만 허용한다. 고객사·행위자·상태·가격·합계는 서버가 결정하며 임의 필드 입력을 거부한다.

제출 시 활성 고객사·계정·세션, 활성 상위 포함 분류, 진열 AVAILABLE 상품, 보관중·판매중 S/A/B 자산, 판매자 활성 상태, 단위·최소수량·가용재고를 다시 확인한다. 단가와 각 행 합계는 Decimal 원 단위 반올림이며 총액은 행 합계의 합이다. 응답 수량·금액은 문자열이다.

가격·상품 스냅샷이 달라지면 409 `{success:false,error:{code:"QUOTE_CHANGED",message},preview}`로 최신 정보를 반환한다. 고객이 최신 금액을 확인한 후 다시 제출해야 하며 자동 재시도하지 않는다. 재고 부족·판매 중단·장바구니 버전 변경은 전체 제출을 차단한다. 기타 충돌은 `error.code=CONFLICT`와 `error.details[].code`의 `CART_CHANGED`, `INVALID_PRODUCT`, `INVALID_QUANTITY`, `OPERATION_CONFLICT`로 구분한다. 인증 실패 401, 트랜잭션 중 권한 변경 403, 입력 오류 400, 요청 크기 초과 413이며 JSON은 최대 64KB이다.

operationId는 UUID이며 같은 고객사·행위자·정규화 입력의 재시도만 원래 접수를 반환한다. 응답 유실 후에도 중복 생성·추가 삭제하지 않는다. 입력이나 가격 재확인 내용이 바뀌면 새 UUID를 사용한다. Serializable 트랜잭션에서 견적·항목 저장과 요청한 선택 행의 버전 조건 삭제를 함께 수행한다. 어느 단계든 실패하면 전부 롤백하며 미선택 행은 유지한다. 상품 상세 직접 요청은 장바구니를 변경하지 않는다.

## 스키마

`backend/prisma/schema/quote.prisma`, 마이그레이션 `20261007001000_add_purchase_quotes`를 사용한다.

| 테이블 | 주요 내용 |
| --- | --- |
| `purchase_quotes` | UUID, 고유 QUO-YYMMDD-8hex 번호, 고객사·행위자 FK, 고유 operationId·SHA256 payloadHash, 회사명·연락처·주소·납기·메모 스냅샷, DECIMAL(24,0) 합계, 접수시각 |
| `purchase_quote_items` | 견적·상품 FK, 정렬 순서, 상품명·분류·규격·브랜드·사진·등급·단위·할인 스냅샷, DECIMAL(18,3) 수량, DECIMAL(19,0) 단가, DECIMAL(24,0) 행 합계 |

견적별 상품·정렬 순서는 각각 unique이며 고객사+접수시각+ID, 상태+접수시각 인덱스를 둔다. 참조 중인 고객사·행위자·상품 삭제는 Restrict, 견적 삭제 시 항목은 Cascade다(삭제 API 없음). SQL CHECK는 수량·금액·할인율·정렬 범위를 방어한다. 상품 변경은 저장된 견적에 소급 반영하지 않는다. payloadHash·operationId는 고객 응답에서 제외한다.

## 화면 및 범위

장바구니의 선택 상품 견적 요청은 미완료 수량 변경을 저장하고 재조회한 뒤 폼을 연다. 상품 상세에서 직접 요청도 가능하다. 고객은 구매 견적 내역에서 목록·상세 및 저장 스냅샷 기반 HTML **구매 견적 요청서**를 다운로드한다. 성공·실패는 화면에서 알리며 이메일·SMS·푸시는 발송하지 않는다.

VAT 포함, 배송비 별도 협의이며 재고 예약·차감은 없다. 확정 견적서·회신·금액 수정·상태 전환·고객 취소·주문·결제·출고는 이번 범위에 포함하지 않는다. 공개 Pages 데모는 실제 접수가 아니다. 외부 DB 마이그레이션과 배포는 별도 승인 대상이다.