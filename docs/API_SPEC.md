### 개인 장바구니

`GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/{id}`, 단일·선택 `DELETE /api/cart/items`, `POST /api/cart/sync`는 활성 고객 회원의 개인 계정별 장바구니 API다. [요청·응답 및 동기화 계약](CART_API.md)을 참고한다. 비회원은 가격 없는 localStorage 데이터만 편집하며 로그인 시 수량을 합산한다. 최신 가격·재고·판매 상태를 매 조회마다 검증하지만 장바구니 자체는 재고를 예약하지 않는다. 선택 상품의 구매 견적 요청은 아래 별도 API를 사용하며 결제는 제공하지 않는다.

### 구매 견적 요청

`POST /api/customer/quotes/preview`, `POST /api/customer/quotes`, `GET /api/customer/quotes`, `GET /api/customer/quotes/{id}`를 제공한다. 고객사 공유 내역, 서버 가격 재검증·변경 재확인, 멱등 접수와 선택 장바구니 삭제, 관리자 `scope=quotes` 조회 계약은 [PURCHASE_QUOTES.md](PURCHASE_QUOTES.md)를 참고한다. 접수는 재고 예약이나 확정 견적을 의미하지 않는다.

### 판매 승인 및 마켓 진열

견적 회신·승인·출고는 [출고 정책](OUTBOUND_POLICY.md)과 [스키마·후속 API 계약안](OUTBOUND_SCHEMA.md)을 추가한 설계 단계다. 해당 경로는 아직 실행 OpenAPI에 등록하지 않았고 결제 API는 만들지 않는다. 기존 접수 계약은 유지한다.

`POST /api/admin/sale-requests/{id}/approve`는 활성 관리자만 사용할 수 있다. `{expectedUpdatedAt: 자산 updatedAt, unitPrice: 1~1000000000000 정수 원 단가, reason: 1~500자}`를 받는다. 검수 완료·승인 대기·활성 고객사·보관중·판매대기·상세 정보 등록·현재 수량 일치를 재검증한다. Serializable 트랜잭션으로 요청 `APPROVED`, 자산 `ON_SALE`, 상품 `AVAILABLE` 및 자산·고객·마켓 감사 이력을 저장한다. 상품 ID는 `PRD-{자산번호}`이며 할인율 0, 판매 수량은 요청 전체 수량, 최초 진열 시각을 기록한다. 최소 주문 수량은 1 또는 전체 수량이 1보다 작을 때 그 전체 수량이다. 성공은 `data.request = {id, status: "APPROVED", productId}`를 반환한다. 미완료 검수·중복 처리·상품 연결·버전 변경은 409, 정보 누락은 400, 요청 없음은 404이다. 실제 재고 차감·구매·출고·정산·고객 통지는 실행하지 않는다.

`GET /api/market/products?page=1&size=20&q=상품명`은 비회원용 공개 상품 목록이다. size는 최대 100, page는 최대 100000이다. `data`에 `products, categories, campaigns, page, size, total`을 반환한다. 판매 중·진열 시각 존재·보관중/판매중 S/A/B 자산·활성 고객사·양수 가용 수량 상품만 조회한다. 가용 수량은 판매 등록 수량에서 예약·판매 수량을 차감한다. 상품 ID·상품명·분류 경로·규격·브랜드·등급·수량·공개 사진을 반환하며 `unitPrice`, `originalUnitPrice` 및 고객사·신청자·입고 내역은 공개하지 않는다. 할인율은 공개한다.

`GET /api/customer/market/products`는 활성 고객 회원 인증을 요구하며 같은 목록에 원 단가 `unitPrice`, 할인 전 단가 `originalUnitPrice`를 포함한다. 회원 가격은 화면뿐 아니라 API에서 보호하며 두 경로 모두 `Cache-Control: private, no-store`를 사용한다. 회원 가격 조회는 마켓 전체 상품 대상이며 자사 자산 조회와 별개다.

두 경로 모두 `categoryId`(상품의 하위 분류 포함), `grade`(S/A/B), `campaignId`, `discountOnly=true`(40% 이상), `sort=campaign|latest|discount`를 지원한다. 기본 `campaign`은 선택 기획전의 저장된 편성 순서이며 기획전 미선택 시 최신순이다. 회원만 `sort=price`를 사용할 수 있다. 검색·정렬·페이지 처리는 전체 DB 결과에 적용한다. 기획전 자체에는 카테고리가 없고 직접 편성 상품만 포함한다. enabled·시작 시각 포함·종료 시각 제외 조건과 노출 가능 상품 최소 1종을 충족해야 고객에게 노출한다. 없는/비노출 기획전은 빈 결과이다. 기획전 응답에는 카테고리 없이 `id,title,description,imageUrl,enabled,order,startsAt,endsAt`을 반환한다.

### 관리자 기획전 편성

관리 화면은 **콘텐츠 관리 > 배너 관리 > 기획전 타입**이다. 이미지 타입은 기존 위치별 PC·모바일 이미지, 링크, 기간, 순서를 관리한다. 기존 기획전 편성 데이터·API·고객 마켓 노출은 보존하며 관리자 메뉴만 통합한다. 기획전 타입 경로는 `#/admin/content?tab=banners&type=campaign`, 이미지 타입은 `type=image`이다. 구 `#/admin/market?tab=campaigns` 주소는 ID·편집 모드·검색 조건을 보존해 새 경로로 이동한다.

- `GET /api/admin/campaign-products?page=1&rows=20&q=상품명&status=DRAFT`: 상품 선택 검색. `q`는 상품번호·상품명·규격 검색, `status`는 `DRAFT|AVAILABLE|OUT_OF_STOCK`, rows 최대 100. 상품별 현재 가격·수량·사진·노출 가능 여부와 pagination을 반환한다.
- `POST /api/admin/campaigns`: `{name,placementCode,placementName,description,enabled,order,startsAt,endsAt,productIds,reason}`으로 생성하며 서버가 ID를 발급한다. 201 `{campaign}` 반환. `placementCode`는 공백 제거 후 정확히 3자리 텍스트, `placementName`은 1~120자 필수 영역명이다. 마켓 상단 영역은 `MKT` / `고객포탈 마켓 상단 기획전`이다. 다른 영역 코드는 마켓 배너 조회·선택에 포함하지 않는다.
- `PUT /api/admin/campaigns/:id`: 위 필드와 조회한 `version`을 전달한다. 200 `{campaign}` 반환. 오래된 버전은 409이며 변경 사유와 편성 전후를 원자적으로 감사 기록한다.
- 관리자 인증이 필요하며 응답은 `private, no-store`. 최대 100종, 한 기획전 내 중복 금지, 기획전 간 중복 허용. 비노출 빈 편성은 허용하고 노출 빈 편성은 400. 카테고리 입력은 허용하지 않는다.
- 관리자 조회의 기획전 DTO는 `productIds`(순서 유지), `products`, `productCount`, `visibleProductCount`, `version`을 포함한다. 판매 불가 상품도 관리 편성에 유지되며 고객 화면에서만 숨긴다.

### 상세 검수 완료 API

`POST /api/admin/sale-requests/{id}/inspection/complete`는 활성 관리자 인증과 `{expectedUpdatedAt: 조회 자산의 updatedAt}`을 요구한다. 승인 대기·상세 검수 대기 요청에 한해 품목·카테고리·규격·브랜드·S/A/B 등급·평가금액 등록, 보관중·판매대기 상태, 요청 수량 양수 및 현재 수량 일치를 검증한다. 평가금액 0원은 등록값이며 NULL은 완료 전 보완 대상이다(일반 자산 편집에서는 NULL 허용).

성공 시 `data.request = {id, inspection: "COMPLETED"}`를 반환한다. 조건 누락 400, 요청 없음 404, 자산 버전 변경·이미 완료·승인 상태 변경은 409이다. Serializable 트랜잭션에서 검수 상태와 자산/고객 감사 이력을 원자 저장하며 담당자·완료 시각은 감사 이력에 남긴다. 판매 승인 상태·자산 수량·상품은 변경하지 않는다. 관리자 조회의 완료 상태와 수량 확인 완료 표시로 결과를 확인한다.

## 관리자 자산 편집

### 고객 판매 요청

`POST /api/assets/{id}/sale-requests`는 활성 고객사 소속 고객 인증을 요구한다. `{desiredAmount: 1~1000000000000 정수, expectedQuantity: 조회한 수량 문자열}`을 받으며 자사 보관중·판매대기 S/A/B 자산 전체 수량을 `승인 대기`, `상세 검수 대기`로 저장한다. 품목·카테고리·평가금액은 선택이다. 성공 201은 `data.request.id`를 반환한다. 중복·상품 연결·변경된 수량·판매 불가 상태는 409, 타사 또는 없는 자산은 404다. 자산 상태·수량·상품은 변경하지 않으며 요청과 고객/자산 이력을 같은 Serializable 트랜잭션으로 저장한다. 고객 자산 상세의 `saleRequest`, `canRequestSale`로 접수 상태를 확인한다. 관리자는 `GET /api/admin/data?scope=sales`로 페이지·검색·승인 상태·고객·월 필터 및 `id` 상세 조회를 사용한다. 상세 검수 완료와 판매 승인은 별도 관리자 API를 사용한다. 접수만으로 상품을 생성하지 않는다.

`PUT /api/admin/assets/{id}`는 활성 관리자 인증이 필요하다. 자산 상세의 수정 화면에서 이름·규격·브랜드·선택 카테고리·수량·등급·위치·보관/판매 상태·개당 평가금액을 편집한다. 요청은 `expectedUpdatedAt`(조회 응답의 `updatedAt`), 필수 `reason`(1~500자)과 편집 필드를 포함한다. `appraisal`은 0~1조원 정수 또는 null이며 생략하면 기존값을 유지한다. 상세 검수 화면의 평가금액 저장도 이 API를 사용한다. 자산번호·품목·단위·입고·소유 고객은 이 API로 변경하지 않으며 이미지는 기존 별도 저장 API를 사용한다. 빈 카테고리는 null, 빈 규격은 빈 문자열이다.

카테고리는 생략하거나 비울 수 있으며 활성 1·2·3차 분류 어느 단계든 저장할 수 있다. 새로 지정하는 분류와 그 상위 분류는 사용 중이어야 한다. 상태별 수량, 정수 단위와 위치를 서버에서 검증한다. 연결 상품이 있으면 수량·등급·보관/판매 상태 변경은 409로 차단한다. 낙관적 잠금과 Serializable 트랜잭션을 사용하며 변경 사유·전후 값은 `asset_changes`에 원자 저장한다. 검수 스냅샷은 변경하지 않는다. 따라서 검수 확정 후 자산을 편집하면 해당 검수 결과의 후속 변경 보호가 작동한다. 성공 응답은 갱신된 `data.asset`이다.

### 개당 평가금액 정책

품목 입고단가에서 S 10%·A 20%·B 40% 할인 후 원 단위 반올림한다. 1차 검수 행 `appraisal`은 0~1조원 정수 문자열 또는 null이다. 생략 시 품목·등급으로 자동 계산하고, 명시적 null은 미평가로 보존하며 수동 입력은 자동값보다 우선한다. 품목·입고단가가 없거나 F등급이면 자동값은 null이다. 평가금액은 필수값이 아니다.

`Asset.appraisal` 및 고객 목록·상세 `appraisalValue`는 개당 금액이다. 총액은 개당 금액 × 현재 수량으로 계산하고 DB에 저장하지 않는다. 고객 집계 `appraisalValue`와 `valueDesc` 정렬은 계산 총액 기준이며 출고완료는 보유 집계에서 제외한다. 기존 총액 데이터는 단가 전환 마이그레이션이 필요하다.
# 1차 검수·폐기 대상·로케이션 (구현)

2026-10-02 구현 계약. 상세 검수·폐기 실행·비용 산정·청구·알림 발송은 포함하지 않는다. 아래의 과거 설계 예시와 충돌하면 이 절과 실행 OpenAPI를 우선한다.

| 메서드 | 경로 | 요청·결과 |
| --- | --- | --- |
| POST | `/api/admin/receivings/{id}/receive` | `{receivedAt,reason}`. 승인 건에 실제 입고시각을 기록하고 `RECEIVED`와 대기 검수증을 원자 생성. 미래 시각 금지 |
| GET | `/api/admin/inspections/{id}` | `data.inspection`. 초안 또는 결과, 버전, 자산 링크, 수정 가능 여부 |
| PUT | `/api/admin/inspections/{id}/draft` | `{version,rows,reason}`. 대기 검수만, 미완성 입력 허용. 자산·폐기 생성 및 고객 공개 없음 |
| POST | `/api/admin/inspections/{id}/confirm` | 같은 입력. 결과와 자산·사진·폐기 대상·감사 이력 원자 저장 |
| PUT | `/api/admin/inspections/{id}/result` | 같은 입력. 허용된 확정 결과 정정만 |
| GET | `/api/customer/inspections` | `page=1,size=20,q`. 확정된 자사 결과만 `{data,meta}` 페이지 조회, 최대 100건 |
| GET | `/api/customer/inspections/{id}` | 자사 확정 결과. 다른 회사·초안·없는 결과 모두 404 |
| POST | `/api/customer/inspections/{id}/acknowledge` | MANAGER, `{version}`. 결과 확인 및 검수 종료. 폐기 동의와 별개 |
| POST | `/api/customer/inspections/{id}/disposal-consent` | MANAGER, `{version,agreed:true}`. 확인된 결과의 자재·수량 폐기 동의만 기록 |
| GET | `/api/admin/locations` | `page=1,size=20,q,enabled=true\|false`. `data.locations`, `data.pagination`, 실제 보관 자산 수 |
| POST | `/api/admin/locations` | `{name,zone,enabled,reason}`. 서버 위치코드 자동 생성, 이름 중복 금지 |
| PATCH | `/api/admin/locations/{id}` | 같은 입력과 `{version}`. 사용 중지 후 기존 자산 유지, 신규 배치 금지 |

검수 행은 `{id,itemId,name,specification,brand,categoryId,unit,grade,received,usable,disposal,reason,locationId,photos}`다. `id`는 안정된 UUID, `itemId`는 선택 6자리 코드 또는 빈 문자열, 사진은 최대 8장의 `{id,name,url}`이며 지정 공개 S3 주소만 허용한다. 단위는 Prisma `ItemUnit` 값(`EA,SET,BOX,M,KG,...`)으로 전송한다. 이름·단위·등급은 확정 시 필수다. 규격·카테고리 코드는 선택값이며 빈 문자열을 허용한다. 규격은 최대 500자, 카테고리를 입력하면 활성 3차 코드여야 한다. 미입력 카테고리는 자산·검수 행에서 null이며 고객 자산 API의 category도 null, 화면은 미분류다. 선택 품목의 단위는 마스터와 일치해야 한다. XLSX의 규격·카테고리코드 열은 기존 순서대로 유지하되 셀을 비워도 된다.

수량은 정수 또는 소수 3자리 이하 문자열, 0~10억이며 `입고 > 0`, `입고 = 재사용 + 폐기`다. EA·BOX·PIECE는 정수만 허용한다. F등급 재사용 수량은 0, 폐기 양수 행은 사유 필수다. 재사용 양수 행에는 활성 위치가 필요하다. 전체 전량 폐기 결과서는 제외하지만 개별 F행은 지원한다. 최대 1000행, 검수 JSON 요청은 10MB 이하, 확정 트랜잭션은 최대 120초다.

자산은 재사용 양수 행에만 생성하며 초기 `STORED/PENDING`, 미평가다. 품목 미선택은 `Asset.itemId=null`이며 가상 품목을 만들지 않는다. 코드는 KST 실제 입고일 `YYMMDD-NNNN`, 날짜별 최대 9999개다. 폐기 대상이 없으면 폐기 헤더를 만들지 않는다. 대상이 있으면 `UNPROCESSED/UNESTIMATED`, 예상·확정 금액과 실제 처리 수량은 null이다.

정정은 고객 확인·동의 전이며 자산 후속 수정·상품 연결·판매·출고·폐기 진행이 없는 경우만 허용한다. 행 추가·삭제·순서 변경, 품목·단위 변경, 재사용 0/양수 전환은 금지한다. 자산번호와 실제 입고일을 유지한다. 이미 연결된 미사용 카테고리·위치는 그대로 유지 가능하다. 과거 검수에 자산 기준 스냅샷이 없으면 안전하게 읽기 전용이다.

동의 문구: **검수 결과에 표시된 자재와 수량의 폐기에 동의합니다. 이 동의에는 비용 청구 동의가 포함되지 않습니다.** 비용 미산정이어도 동의 가능하며, 동의는 실제 처리나 비용 청구를 실행하지 않는다. 회사 단위 확인·동의를 행위자와 대상 스냅샷으로 감사한다. 동일 최신 버전의 완료 동작은 중복 이력 없이 반환하며 오래된 버전은 409다. 매 쓰기에서 활성 계정·회사·세션·권한을 재검사한다.

관리자 `입고 신청 > 승인 건 > 입고 완료 등록`, `1차 검수 > 초안·확정·정정`과 고객 `검수·폐기 내역`에서 사용한다. 위치는 관리자 자산 관리에서 DB 등록·수정·사용 중지하며 점유 자산은 실제 자산 목록으로 조회한다. 위치 이동·요금·삭제 API는 제공하지 않는다.

엑셀 양식은 `1차검수` 시트 한 개의 XLSX, 최대 5MB·1000행이다. 열 순서는 `품목코드(선택), 자산명, 규격, 브랜드(선택), 카테고리코드, 단위, 등급, 입고수량, 재사용수량, 폐기수량, 폐기사유, 로케이션코드`. 코드 문자열의 앞자리 0을 보존하며 숫자 코드 셀은 허용 범위에서 6자리로 보정한다. 파일 손상·열/시트 불일치·매크로·외부 링크・압축 해제 제한(총 64MB/개별 8MB)은 전체 업로드를 거절한다. 셀 수식·링크 및 행별 입력 오류는 해당 행만 제외하고 행 번호와 사유를 표시한다. 워커는 15초에 중단한다. 정상 행만 기존 행에 추가 또는 행·사진 대체를 선택한다. 확정 결과에는 엑셀 행 재편성을 제공하지 않는다. 실제 코드 유효성은 확정 시 서버에서 재검사하며 사진은 별도 첨부한다.

초안/최초 확정 요청의 선택 필드 `skipInvalidRowIds`는 엑셀에서 적용된 행 UUID 배열(최대 1000개, 기본 `[]`)이다. 최초 확정에서는 이 목록에 있는 행의 업무 검증 오류(품목·분류·단위·위치·수량 등)만 제외하고 유효한 행을 한 트랜잭션으로 저장한다. 응답 `inspection.skippedRows`와 감사 기록에 `{id,row,message}`를 남기며 `row`는 확정 요청 내 1부터 시작하는 검수 행 번호다. 유효한 재사용 자산이 없으면 저장하지 않는다. 요청 스키마·권한·동시 수정·DB 장애는 전체 실패하고, 수동 입력 행 및 확정 후 정정에는 부분 등록을 적용하지 않는다. 초안에는 업로드 행 UUID도 저장해 재조회 후 유지한다.

`20261002000000_first_inspection_locations` 마이그레이션이 필요하다. 기존 위치코드는 미사용 위치로 보존하고 빈 문자열만 null로 정리하며 기존 자산·고객사 귀속을 유지한다. 관리자·고객·백엔드를 함께 반영해야 한다. 운영 DB 마이그레이션·배포는 별도 승인 대상이다.

규격·카테고리 선택값 변경에는 `20261002001000_optional_asset_category`도 필요하다. 기존 자산 분류는 보존하며 `assets.categoryId`만 nullable로 변경한다. 가상 미분류 마스터를 생성하지 않는다.

# 고객 입고 신청 (구현)

- 승인된 활성 고객사 소속 활성 계정은 `VIEWER`와 `MANAGER` 모두 신청할 수 있다. 비회원·관리자 토큰은 사용할 수 없다. 다른 업무의 조회자 권한은 변경하지 않는다.
- `POST /api/customer/receivings`: 고객 Bearer 토큰, `multipart/form-data`. 필수 문자열 `siteName`(1~120자), `managerName`(1~80자), `managerPhone`(1~30자), `volume`(`UNDER_ONE_TON|TWO_POINT_FIVE_TONS|FIVE_TONS_OR_MORE`), `disposalTerms=true`. 선택 `note`(최대 1000자), 반복 `photos`(0~5장). 파일은 각 5MB 이하 정지 JPEG/PNG/WebP, 20MP 이하이며 최대 2400px WebP로 변환한다. HEIC는 지원하지 않는다. 요청 총 크기는 26MB로 제한한다.
- `customerId`, 채널(`PORTAL`), 상태(`REQUESTED`), 신청번호·시각, 동의 규정 버전·원문은 서버가 결정한다. 고객 입력으로 소속·상태·채널을 바꿀 수 없다. `siteId`는 미지정이며 예상 물량을 자산 수량으로 환산하지 않는다.
- 성공은 신청·사진·신청자 감사 이력의 DB 트랜잭션 완료 후 `201 {success:true,data:{receiving:...}}`. 사진 없는 신청은 S3 접근 없이 저장한다. 검증 `400`, 인증 `401`, 소속/권한 `403`, 크기 `413`, 요청 제한 `429`, S3 저장 장애 `503`, DB 장애 `500`이며 실패에는 접수 완료를 표시하지 않는다. 계정별 10분당 30회, 고객사별 100회, 프로세스별 동시 신청 처리 2회로 제한한다.
- `GET /api/customer/receivings`: `page`(기본 1), `size`(기본 20, 최대 100), `q`(신청번호·현장명·담당자), `status=REQUESTED|APPROVED|RECEIVED|REJECTED|CANCELLED`. 응답 `{data:[...],meta:{page,size,totalElements,totalPages}}`, 최신 신청순. 같은 고객사 소속 계정은 회사 전체 내역을 조회한다. 목록에는 사진 본문을 포함하지 않는다.
- `GET /api/customer/receivings/{id}`: `data.receiving`으로 현장·담당자·물량·메모·상태·일정·약관 기록·정렬된 사진을 반환한다. 타 고객사 신청과 없는 신청은 모두 `404`로 처리한다. `GET /api/customer/receivings/terms`는 현재 규정의 `{version,text}`를 반환한다. 조회는 `Cache-Control: no-store`다.
- 사진은 `receivings/{고객사ID}/{신청자ID}/{UUID}.webp`의 공개 S3 URL이다. URL을 아는 사람은 로그인 없이 볼 수 있으므로 개인정보·민감한 내용은 등록하지 않는다. 임의 URL을 신청서에 첨부하는 API는 제공하지 않는다. 필요한 IAM 권한은 이 prefix의 `s3:PutObject`, 실패 정리용 `s3:DeleteObject`, 공개 읽기 정책의 `s3:GetObject`이다. 기존 관리자 이미지 prefix 권한만 있는 계정은 입고 업로드가 실패할 수 있다.
- 업로드 또는 DB 실패 시 생성한 객체를 best-effort 삭제한다. 삭제 권한이 없거나 S3 장애가 계속되면 미참조 객체가 남을 수 있으며 서버에 `receiving.image.cleanup_failed`를 기록한다. S3와 DB 사이의 완전한 원자성은 보장하지 않는다.
- 고객 로그인 후 상단 버튼으로 신청하고 `입고 신청 내역`에서 목록·상세를 확인한다. 관리자 `입고 관리 > 입고 신청`은 기존 `/api/admin/data?scope=receivings`를 사용하며 `id` 상세에서 사진과 동의 원문, 처리 결과를 제공한다. 관리자 취소 저장, 배차·알림·검수·폐기 자동 실행, 고객 수정·취소는 구현 범위 밖이다. 목업 모드의 신청은 DB에 저장하지 않는다.
- 네트워크 응답을 확인하지 못했을 때 POST를 자동 재시도하지 않는다. 신청 내역을 먼저 확인해야 한다. 중복 클릭은 화면에서 차단하지만 별도 멱등성 키 계약은 제공하지 않는다.
- 신규 마이그레이션은 없으며 기존 입고·고객사 마이그레이션이 적용된 DB가 필요하다. 적용 시 고객·관리자·백엔드와 고객 프록시 설정을 함께 반영한다.

# 관리자 입고 승인·반려 (구현)

- `POST /api/admin/receivings/{id}/review`: 활성 관리자 Bearer 토큰과 JSON `{action:"approve"|"reject",reason:"처리 사유"}`. 사유는 앞뒤 공백 제거 후 1~1000자이며 고객 상세에도 표시한다. 기존 업무 권한 정책대로 관리자 역할 계정 모두 처리할 수 있다.
- `REQUESTED`만 `APPROVED` 또는 `REJECTED`로 변경한다. 상태와 `receiving_changes`의 처리자·시각·사유·상태 전후 값을 Serializable 트랜잭션으로 저장한다. 이력 저장 실패 시 상태도 롤백된다. 이미 처리된 건과 동시 처리 충돌은 `409`이며 재승인·반려 취소·재심사는 지원하지 않는다.
- 성공 `200 data.receiving`, 검증 `400`, 인증 `401`, 권한 `403`, 없는 신청 `404`, 충돌 `409`. 고객 토큰은 사용할 수 없다. 상태 변경은 일정·입고 시각·견적·검수증·자산을 자동 생성하거나 변경하지 않으며 별도 알림을 발송하지 않는다.
- 관리자 상세에서 승인·반려를 선택하고 사유 입력 후 확정한다. 성공 후 DB 데이터를 재조회하며 중복 클릭을 차단한다. 실패 시 사유를 유지한다. 결과를 확인하지 못했거나 `409`인 경우 새로고침으로 최신 상태를 확인한다.
- 관리자·고객 상세에 `decision={status,reason,at}` 또는 `null`을 반환한다. 고객 응답에는 내부 이력과 관리자 식별자를 노출하지 않는다. 목록에는 기존 상태가 표시된다. 스키마 변경 없이 기존 입고·감사 테이블을 사용한다.

# 관리자 품목 수정

`PUT /api/admin/items/{id}`는 관리자 Bearer 토큰이 필요하며 현재 품목코드를 URL에 전달한다. 요청은 품목의 `id`, `name`, `category`, `specification`, `brand`, `unit`, `inboundPrice`, `outboundPrice`, `standardPrice`, `enabled`, `note`, `images`를 포함한다. `images`는 최대 한 장의 `{id,name,url}` 배열이다. 기본정보와 이미지를 하나의 트랜잭션으로 수정하고 성공 시 `200 data.item`으로 저장된 레코드를 반환한다.

품목코드는 숫자 6자리이며 변경 시 연결 자산과 이미지의 외래키도 함께 갱신된다. 기존 자산의 단가·이름·규격은 소급 변경하지 않는다. 연결 자산이 있으면 기준 단위 변경은 `409`로 거절된다. 등록된 기존 이미지는 그대로 유지할 수 있으며 새 이미지는 지정 S3 버킷 주소만 허용한다. 없는 품목은 `404`, 잘못된 입력·참조는 `400`, 중복 코드·동시 충돌은 `409`로 반환한다. 수정 전후 값과 작업자를 감사 이력에 저장한다.

관리자 등록·수정 성공 시 완료 토스트를 표시하며 실패한 요청에는 성공 알림을 표시하지 않는다. 이미지 업로드만으로는 DB 저장 완료 알림을 표시하지 않는다. 기존 품목 수정은 새로고침 후에도 유지된다. 이번 변경은 다른 메뉴의 미구현 DB 쓰기 기능을 새로 구현하지 않으며 임시저장 관련 화면 문구만 제거한다. 스키마 변경은 없고 적용 시 관리자·백엔드를 함께 배포한다.

# 관리자 이미지 S3 업로드

- `POST /api/admin/images/{kind}`: 관리자 Bearer 토큰, `kind=items|assets|banners|inspections`, multipart `file` 한 장. 응답 `201 data.image={id,name,url}`.
- 파일당 5MB 이하 정지 JPG/PNG/WebP만 지원한다. 서버에서 실제 형식과 최대 2천만 픽셀을 검사하고 방향 보정, 최대 2400px 리사이즈, 메타데이터 제거 후 WebP로 저장한다. UUID 키를 사용하며 원본 파일명은 객체 키에 사용하지 않는다.
- 버킷 `bucket-mrs`, 리전 `ap-northeast-2`, 키 `{kind}/{관리자ID}/{UUID}.webp`. DB에는 공개 HTTPS URL과 원래 파일명을 저장한다. ACL을 지정하지 않으며 버킷의 공개 읽기 정책을 사용한다.
- 관리자별 10분당 100회, 프로세스별 동시 처리 2회 제한. 실패는 검증 `400`, 요청 크기 `413`, 제한 `429`, S3 장애 `503`으로 반환한다. 브라우저에 AWS 자격 증명을 전달하지 않는다.
- `PUT /api/admin/items/{id}/images` 및 `PUT /api/admin/assets/{id}/images`: `{images,expected,reason}`. 이미지 목록은 `{id,name,url}` 배열, 품목 최대 1장/자산 최대 8장. 현재 DB 목록과 `expected`가 다르면 `409`이며 변경 사유와 감사 이력을 트랜잭션으로 저장한다. 기존 비-S3 이미지는 변경 없이 유지할 수 있고, 새 주소는 지정 버킷의 정지 이미지 경로만 허용한다.
- 기존 품목·자산은 상세/편집 화면의 **이미지 DB 저장** 버튼으로 저장한다. 기본정보 임시 저장과 분리된다. 신규 품목은 업로드 후 품목 등록으로 URL을 함께 저장한다. 자산은 1차 검수 확정으로 생성하며 독립적인 수동 자산 생성 API는 제공하지 않는다. 검수 사진은 초안·확정과 함께 저장한다. 고객 입고 사진은 고객 신청 API에서 직접 업로드·저장한다. 배너 이미지는 업로드 후 **편성 저장**으로 기존 배너 API에 저장한다.
- 이미지 삭제는 DB 연결만 제거한다. 원본 S3 객체는 삭제하지 않는다. 업로드 후 저장 취소·실패한 객체는 남을 수 있으므로 미참조 객체 정리를 별도 운영해야 한다. 전체 prefix에 일괄 만료 정책을 적용하면 참조 중 이미지도 삭제될 수 있다.

## AWS 인증과 배포

백엔드 AWS SDK 기본 credential provider chain을 사용한다. IAM 역할을 우선 사용하고 Docker 컨테이너에서 자격 증명 엔드포인트에 접근할 수 있는지 확인한다. Lightsail에서 역할을 사용할 수 없는 경우 서버 전용 `.env`에 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, 임시 자격 증명이면 `AWS_SESSION_TOKEN`을 설정한다. Compose는 이 값들을 백엔드에만 전달한다. 공유 프로파일 파일은 컨테이너에 자동 전달되지 않는다. 키를 Git, 프론트엔드 환경변수, 채팅에 넣지 않는다.

필요한 최소 쓰기 권한 예시:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject"],
    "Resource": [
      "arn:aws:s3:::bucket-mrs/items/*",
      "arn:aws:s3:::bucket-mrs/assets/*",
      "arn:aws:s3:::bucket-mrs/banners/*",
      "arn:aws:s3:::bucket-mrs/inspections/*"
    ]
  }]
}
```

별도 버킷 정책에서 위 prefix의 익명 `s3:GetObject` 읽기를 허용해야 이미지가 보인다. SSE-KMS 버킷이면 키 정책과 `kms:GenerateDataKey` 권한도 필요하다. 서버가 S3로 업로드하므로 브라우저 업로드용 CORS 설정은 필요 없다. 공개 URL은 고객 소유권 API를 우회해 접근할 수 있으므로 개인정보·민감한 현장 사진을 업로드하지 않는다. URL 저장에는 스키마 변경이 없고 프론트엔드/백엔드를 함께 배포해야 한다.

# MRS 고객 포털 API 명세서

- 버전: 1.0.0-draft
- 기준일: 2026-09-22
- Base URL: `/api`
- 인증: JWT Bearer (`Authorization: Bearer <accessToken>`)
- 고객과 관리자는 로그인 API·세션·JWT audience를 분리한다. 관리자 로그인은 `/api/admin/auth/login`, 고객 로그인은 `/api/auth/login`이며 서로의 계정·토큰을 사용할 수 없다.
- Content-Type: `application/json`
- 시간: ISO 8601 UTC (`2026-09-22T01:23:45.000Z`)
- 금액: 원 단위 정수 문자열. 예: `"1375000"`
- OpenAPI 3.1: `/api/openapi.json`
- Scalar API Reference: `/api/docs`

## 관리자 계정 관리 (구현)

### 관리자 목록 페이지 조회

- 관리자 진입 시 업무·회원·고객사 전체 목록을 미리 조회하지 않는다. 현재 메뉴에서 필요한 API만 호출한다.
- `/api/admin/data?scope=items&page=1&rows=25`는 선택 업무 목록과 카테고리 기준정보만 반환한다. `scope`: `items`, `assets`, `receivings`, `inspections`, `disposals`, `products`, `campaigns`, `categories`, `locations`, `dashboard`. 미지정 시 품목 1페이지다.
- `page`는 1부터, `rows`는 기본 25·최대 100이다. 응답 `data.pagination`은 `{ page, rows, total }`. 페이지 크기 초과·잘못된 페이지·미지원 scope는 400이다. 업무별 `q`, `status`, `category`, `customer`, 자산 `grade`, `saleStatus`, `itemId`, `locationId`, 기록 `period=YYYY-MM`, `sort=recent|name`을 DB에서 적용한다. `id`는 페이지와 관계없이 해당 레코드만 조회한다.
- 고객사·회원·고객사 신청·관리자·배너 목록 API도 `page`, `rows`와 전체 건수 응답을 사용한다. 고객사·회원·신청·관리자는 `q`, `status`, `id`, 관리자는 `role` 필터를 지원한다. 회원 API는 고객 회원만, 관리자 API는 관리자만 조회하며 기존 인증·시스템 관리자 제한은 유지한다.
- 배너 목록에서는 이미지 본문을 제외하고 `id` 상세 조회에서 편성 이미지를 가져온다. 자산 목록은 대표 이미지 1장과 이력 없는 데이터를, 상세는 최대 8장·최근이 아닌 기존 정렬의 이력 최대 100건을 반환한다.
- 대시보드는 입고·검수 건수 집계와 입고 10건·기획전 5건 미리보기만 조회한다. 로케이션은 실제 DB 마스터를 페이징하며 점유 자산 수와 선택 위치의 자산을 조회한다. 판매 요청·구매 견적·명세·현장·문의·기준정보 등 DB 미연결 예시 목록은 기존 로컬 페이지 표시를 유지한다. 카테고리는 계층 탐색·분류 선택용 트리 기준정보로 조회하며 업무 레코드 전체를 가져오지 않는다.
- 목록 조회 중 공통 테이블 스켈레톤과 접근성 상태를 표시한다. 이전 요청은 메뉴·페이지 변경 시 취소하며 `prefers-reduced-motion`에서는 스켈레톤 애니메이션을 끈다. 스키마 마이그레이션은 없다. 관리자 프론트와 백엔드를 함께 배포해야 한다.

- 시스템 관리자만 `/api/admin/accounts`를 조회·생성하고 `/api/admin/accounts/{id}`를 수정할 수 있습니다. 관리자·영업·물류는 이 API에 403을 받습니다. 기존 업무 메뉴별 영업·물류 권한 제한은 이번 변경 범위에 포함하지 않습니다.
- 권한은 `SYSTEM_ADMIN`(시스템 관리자), `ADMIN`(관리자), `SALES`(영업), `LOGISTICS`(물류)입니다. 고객 회원의 `customerRole`과 독립적이며 공개 가입으로 관리자 계정을 만들 수 없습니다.
- `GET /api/admin/accounts`: `{ accounts: [...] }`. 각 항목은 `id`, `email`(로그인 아이디), `managerName`, `managerPhone`, `adminRole`, `status`, `sessionVersion`, `createdAt`, `updatedAt`입니다. 비밀번호·해시는 반환하지 않습니다.
- `POST /api/admin/accounts`: `loginId`, `password`, `name`, `phone`, `adminRole`, `status`, `reason`을 전달합니다. 아이디는 3~254자 영문·숫자·`@._-`로 제한하고 소문자 정규화합니다. 비밀번호는 8~128자, 상태는 `ACTIVE` 또는 `SUSPENDED`입니다. 고객과도 아이디 중복을 허용하지 않습니다.
- `PATCH /api/admin/accounts/{id}`: `name`, `phone`, `adminRole`, `status`, `reason`, `version`(조회한 `sessionVersion`) 및 선택적 `password`를 전달합니다. 아이디 변경·고객 계정 전환·삭제는 지원하지 않습니다.
- 모든 수정은 기존 로그인 세션을 폐기합니다. 마지막 활성 시스템 관리자 정지·권한 해제 및 동시 수정 충돌은 409입니다. 변경과 감사 이력은 Serializable 트랜잭션으로 함께 저장하며 비밀번호는 이력에도 포함하지 않습니다.
- 배포 전에 `20261001000000_add_admin_roles` 마이그레이션이 필요합니다. 기존 `ADMIN` 계정은 호환성을 위해 시스템 관리자로 이관하고 기존 관리자 세션을 폐기합니다. 이관할 기존 계정을 사전 검토하고 불필요한 권한은 회수해야 합니다. 고객 계정의 `adminRole`은 null입니다.
- 로컬 전용 `db:seed:admin`은 `admin/admin`을 시스템 관리자로 생성·초기화합니다. 운영 환경에서는 금지되며 일반 관리자 생성 폼은 8자 이상 비밀번호만 허용합니다.

실행 계약의 기준은 코드에서 생성되는 OpenAPI 3.1 문서입니다. 이 문서는 업무 규칙과 예시를 설명하는 보조 명세입니다.

## 1. 공통 규칙

로그인·가입·고객사 정확 검색·공개 배너·공개 마켓 상품·상태 확인·API 문서를 제외한 API는 인증이 필요합니다. 고객 API는 DB에서 확인한 활성 회원과 활성 고객사 소유 데이터만 조회할 수 있습니다. URL이나 요청 본문의 고객 ID를 자산 접근권한으로 신뢰하지 않습니다. 고객사 관리의 현재 계약과 이관 절차는 [CUSTOMER_MANAGEMENT.md](CUSTOMER_MANAGEMENT.md)를 참조합니다. 아래 미구현 업무 API는 향후 설계이며 실행 가능 여부는 OpenAPI 문서로 확인합니다.

성공 응답:

```json
{
  "success": true,
  "data": {}
}
```

목록 성공 응답:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "size": 20,
    "totalElements": 42,
    "totalPages": 3
  }
}
```

오류 응답:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "items.0.quantity", "message": "Must be greater than zero", "code": "too_small" }
    ]
  }
}
```

오류 코드:

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 형식 또는 필수값 오류 |
| 401 | `UNAUTHORIZED` | 로그인 실패, 토큰 누락·만료·폐기 |
| 403 | `FORBIDDEN` | 다른 고객의 데이터 또는 허용되지 않은 역할 |
| 404 | `NOT_FOUND` | 리소스 없음. 타 고객 데이터도 404로 응답 |
| 409 | `CONFLICT` | 상태 전이 불가, 중복 요청, 재고 부족 |
| 429 | `RATE_LIMITED` | 요청 횟수 제한 |
| 503 | `SERVICE_UNAVAILABLE` | DB 등 의존 서비스 장애 |

`POST` 요청 중 구매·판매 상태 변경에는 `Idempotency-Key` 헤더를 필수로 사용합니다. 같은 사용자, 경로, 키, 요청 본문의 재시도는 최초 응답을 반환합니다. 같은 키에 다른 본문을 보내면 `409 CONFLICT`입니다. 키는 최소 24시간 보관합니다.

## 2. 엔드포인트 요약

| 영역 | Method | Path | 설명 |
| --- | --- | --- | --- |
| 로그인 | POST | `/auth/login` | 이메일·비밀번호 로그인 |
| 로그인 | POST | `/auth/logout` | 현재 Access Token 폐기 |
| Products | GET | `/products/specials` | 특가 판매 상품 목록 |
| Products | GET | `/products` | 판매 가능 상품 목록 |
| Products | GET | `/products/{productId}` | 상품 상세 |
| Products | POST | `/purchase-requests` | 상품 구매 요청 |
| Assets | GET | `/assets/summary` | 내 자산 요약 |
| Assets | GET | `/assets` | 내 자산 목록 |
| Assets | POST | `/assets/{assetId}/sale-requests` | 판매 상태 변경 요청 |
| Assets | POST | `/assets/{assetId}/sale-cancellation-requests` | 판매 상태 취소 요청 |
| Profile | GET | `/profile` | 로그인 사용자 정보 |
| Profile | GET | `/profile/transactions` | 로그인 사용자 거래 내역 |

## 3. 로그인

### POST `/auth/login`

인증 없이 호출합니다. 이메일은 소문자와 trim을 적용합니다. 승인된 `ACTIVE` 계정만 로그인할 수 있습니다.

요청:

```json
{
  "email": "customer@example.test",
  "password": "TestPassword123!"
}
```

응답 `200`:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "user": {
      "id": "8f493cf7-8460-4ef5-91b7-27b679fe86a8",
      "email": "customer@example.test",
      "username": "테스트 고객",
      "companyName": "MRS 테스트 고객사",
      "role": "CUSTOMER"
    }
  }
}
```

제한: 사용자·IP 기준 로그인 속도 제한을 적용합니다. 자격 증명 불일치는 상세 사유를 구분하지 않고 `401`로 응답합니다.

### POST `/auth/logout`

현재 Bearer Token의 `jti`를 만료 시각까지 폐기합니다. 여러 기기 전체 로그아웃이 아닙니다.

응답: `204 No Content`

## 4. Products

### GET `/products/specials`

현재 시각에 특가 노출 기간이 유효하고 `AVAILABLE` 상태인 상품만 조회합니다.

Query:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page` | integer | `1` | 1 이상 |
| `size` | integer | `20` | 1~100 |
| `categoryId` | string | - | 선택 카테고리와 하위 카테고리 포함 |
| `sort` | enum | `dealOrder` | `dealOrder`, `priceAsc`, `priceDesc`, `newest` |

응답의 항목은 아래 `ProductSummary`를 사용합니다.

### GET `/products`

판매 가능 수량이 있고 `AVAILABLE` 상태인 상품을 조회합니다.

Query:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page` | integer | `1` | 1 이상 |
| `size` | integer | `20` | 1~100 |
| `q` | string | - | 상품명·규격·브랜드 검색 |
| `categoryId` | string | - | 선택 카테고리와 하위 카테고리 포함 |
| `grade` | enum | - | `S`, `A`, `B` |
| `sort` | enum | `newest` | `newest`, `priceAsc`, `priceDesc` |

`ProductSummary` 예시:

```json
{
  "id": "PRD-000002",
  "name": "회수 참나무 구조목",
  "category": {
    "id": "020101",
    "name": "구조목",
    "path": "목재 > 구조재 > 구조목"
  },
  "grade": "S",
  "unit": "M",
  "unitPrice": "43500",
  "originalUnitPrice": "65000",
  "availableQuantity": "80.000",
  "thumbnailUrl": "https://cdn.example.com/products/PRD-000002/main.jpg",
  "deal": {
    "label": "재고정리",
    "discountRate": 33,
    "endsAt": "2026-09-30T14:59:59.000Z"
  },
  "createdAt": "2026-09-05T01:00:00.000Z",
  "updatedAt": "2026-09-21T03:30:00.000Z"
}
```

특가가 아니면 `originalUnitPrice`와 `deal`은 `null`입니다.

`unitPrice`는 상품의 `originalUnitPrice`와 `discountRate`로 계산하고, `availableQuantity`는 `listedQuantity - reservedQuantity - soldQuantity`로 계산합니다. 진행 중인 기획전이 여러 개면 `sortOrder`, 종료 시각, 기획전 ID 순으로 첫 기획전을 `deal`에 사용합니다.

### GET `/products/{productId}`

판매 가능한 상품 상세를 조회합니다. 비공개·판매 종료 상품은 고객에게 `404`로 응답합니다.

응답 `200`의 `data`:

```json
{
  "id": "PRD-000002",
  "assetId": "260902-0001",
  "name": "회수 참나무 구조목",
  "category": {
    "id": "020101",
    "name": "구조목",
    "path": "목재 > 구조재 > 구조목"
  },
  "specification": "38 x 89 mm, 2.4 m",
  "brand": "",
  "grade": "S",
  "unit": "M",
  "unitPrice": "43500",
  "originalUnitPrice": "65000",
  "availableQuantity": "80.000",
  "minimumOrderQuantity": "1.000",
  "status": "AVAILABLE",
  "deal": null,
  "images": [
    { "id": "img-1", "url": "https://cdn.example.com/products/PRD-000002/1.jpg", "sortOrder": 0 }
  ],
  "deliveryNotice": "배송비와 출고 일정은 구매 요청 검토 후 안내합니다.",
  "createdAt": "2026-09-05T01:00:00.000Z",
  "updatedAt": "2026-09-21T03:30:00.000Z"
}
```

### POST `/purchase-requests`

하나 이상의 상품에 대해 구매 견적을 요청합니다. 상품 가격과 재고는 서버가 다시 조회하며 요청 본문의 금액을 신뢰하지 않습니다.

Header: `Idempotency-Key: <UUID>`

요청:

```json
{
  "items": [
    { "productId": "PRD-000002", "quantity": "10.000" },
    { "productId": "PRD-000003", "quantity": "30.000" }
  ],
  "delivery": {
    "address": "경기도 수원시 예시로 1",
    "requestedDate": "2026-10-05"
  },
  "contact": {
    "name": "홍길동",
    "phone": "010-1234-5678",
    "email": "buyer@example.com"
  },
  "note": "일괄 배송과 운반비 확인 요청"
}
```

응답 `202`:

```json
{
  "success": true,
  "data": {
    "id": "PUR-20260922-000001",
    "status": "RECEIVED",
    "items": [
      {
        "productId": "PRD-000002",
        "name": "회수 참나무 구조목",
        "quantity": "10.000",
        "unit": "M",
        "unitPriceSnapshot": "43500"
      }
    ],
    "estimatedMaterialAmount": "435000",
    "requestedAt": "2026-09-22T02:10:00.000Z"
  }
}
```

상태: `RECEIVED`, `REVIEWING`, `QUOTED`, `FULFILLED`, `CANCELED`. 이 요청은 주문·결제가 아니며 재고를 즉시 차감하지 않습니다.

## 5. Assets

### GET `/assets/summary`

로그인한 고객이 소유한 자산만 집계합니다. 금액이 없는 자산은 금액 합계에서 제외하고 `unvaluedAssetCount`에 포함합니다.

응답 `200`:

```json
{
  "success": true,
  "data": {
    "totalInboundAssetValue": "6104000",
    "itemCount": 5,
    "updatedAt": "2026-09-21T03:30:00.000Z",
    "storedAssetValue": "2234000",
    "onSaleAssetValue": "3480000",
    "unvaluedAssetCount": 1
  }
}
```

집계 정의:

- `totalInboundAssetValue`: 출고 완료 전 자산의 현재 평가금액 합계
- `itemCount`: 출고 완료 전 서로 다른 `itemId` 수
- `updatedAt`: 대상 자산 중 가장 최근 `updatedAt`; 자산이 없으면 `null`
- `storedAssetValue`: `storageStatus=STORED`이면서 `saleStatus!=ON_SALE`인 평가금액 합계
- `onSaleAssetValue`: `storageStatus=STORED`이면서 `saleStatus=ON_SALE`인 평가금액 합계

### GET `/assets`

Query:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page` | integer | `1` | 1 이상 |
| `size` | integer | `20` | 1~100 |
| `q` | string | - | 자산명·코드·규격·브랜드 검색 |
| `storageStatus` | enum | - | `PENDING`, `STORED`, `RELEASED` |
| `saleStatus` | enum | - | `PENDING`, `ON_SALE`, `SOLD` |
| `grade` | enum | - | `S`, `A`, `B`, `F` |
| `categoryId` | string | - | 카테고리와 하위 카테고리 포함 |
| `locationId` | string | - | 보관 위치 코드 |
| `receivedFrom` | date | - | 입고일 시작, `YYYY-MM-DD` |
| `receivedTo` | date | - | 입고일 종료, `YYYY-MM-DD` |
| `storageDaysFrom` | integer | - | 최소 보관 일수, 0 이상 |
| `storageDaysTo` | integer | - | 최대 보관 일수, 0 이상 |
| `sort` | enum | `updatedDesc` | `updatedDesc`, `valueDesc`, `receivedDesc`, `nameAsc` |

`receivedFrom`은 `receivedTo`보다 늦을 수 없고, `storageDaysFrom`은 `storageDaysTo`보다 클 수 없습니다. 범위가 잘못되면 `400 VALIDATION_ERROR`를 반환합니다.

항목 예시:

```json
{
  "id": "260902-0001",
  "itemId": "000002",
  "name": "회수 참나무 구조목",
  "category": { "id": "020101", "name": "구조목", "path": "목재 > 구조재 > 구조목" },
  "specification": "38 x 89 mm, 2.4 m",
  "brand": "",
  "grade": "S",
  "quantity": "80.000",
  "unit": "M",
  "appraisalValue": "3480000",
  "storageStatus": "STORED",
  "saleStatus": "ON_SALE",
  "locationId": "LOC-A03",
  "thumbnailUrl": null,
  "receivedAt": "2026-09-02T01:00:00.000Z",
  "storageDays": 19,
  "createdAt": "2026-09-02T01:00:00.000Z",
  "updatedAt": "2026-09-21T03:30:00.000Z"
}
```

현재 별도 입고 확정 시각과 위치 마스터 관계가 없으므로 `receivedAt`은 `Asset.createdAt`의 API 별칭이며 보관 일수도 이 시각을 기준으로 계산합니다. 위치는 `locationId`만 반환합니다. `appraisalValue`가 없는 자산은 `null`입니다.

로그인한 `CUSTOMER` 계정의 `User.customerId`와 일치하는 자산만 조회합니다. 활성 계정에 고객 코드가 연결되지 않은 경우 빈 목록 대신 `403 FORBIDDEN`을 반환합니다.

### POST `/assets/{assetId}/sale-requests`

판매 대기 자산을 판매 중 상태로 변경해 달라고 요청합니다. 자산 상태는 승인 전까지 바꾸지 않습니다.

허용 조건:

- 요청자가 해당 자산 소유자
- `storageStatus=STORED`
- `saleStatus=PENDING`
- 등급 `S`, `A`, `B`
- 동일 자산에 처리 중인 판매 상태 요청 없음

Header: `Idempotency-Key: <UUID>`

요청:

```json
{
  "desiredAmount": "3750000",
  "note": "전체 수량 판매 요청"
}
```

응답 `202`:

```json
{
  "success": true,
  "data": {
    "id": "SAL-20260922-000001",
    "assetId": "260902-0001",
    "action": "START_SALE",
    "status": "PENDING",
    "desiredAmount": "3750000",
    "requestedAt": "2026-09-22T02:20:00.000Z"
  }
}
```

관리자 승인 시 자산 `saleStatus`가 `ON_SALE`이 되고 상품이 생성·공개됩니다. 반려 시 기존 상태를 유지합니다.

### POST `/assets/{assetId}/sale-cancellation-requests`

현재 판매 중인 자산의 판매 취소를 요청합니다. 승인 전까지 상품은 계속 판매 중입니다.

허용 조건:

- 요청자가 해당 자산 소유자
- `saleStatus=ON_SALE`
- 구매 처리 중이거나 판매 완료된 자산이 아님
- 동일 자산에 처리 중인 취소 요청 없음

Header: `Idempotency-Key: <UUID>`

요청:

```json
{
  "reason": "다음 현장 재사용 일정 확정"
}
```

응답 `202`:

```json
{
  "success": true,
  "data": {
    "id": "SAL-20260922-000002",
    "assetId": "260902-0001",
    "action": "CANCEL_SALE",
    "status": "PENDING",
    "reason": "다음 현장 재사용 일정 확정",
    "requestedAt": "2026-09-22T02:25:00.000Z"
  }
}
```

관리자 승인 시 연관 상품을 비공개 처리하고 자산 `saleStatus`를 `PENDING`으로 변경합니다.

## 6. Profile

### GET `/profile`

응답 `200`:

```json
{
  "success": true,
  "data": {
    "id": "8f493cf7-8460-4ef5-91b7-27b679fe86a8",
    "username": "홍길동",
    "email": "customer@example.test",
    "businessRegistrationNumber": "123-45-67890",
    "companyName": "MRS 테스트 고객사",
    "role": "CUSTOMER"
  }
}
```

`username`은 현재 사용자 모델의 `managerName`에 대응합니다.

### GET `/profile/transactions`

Query:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page` | integer | `1` | 1 이상 |
| `size` | integer | `20` | 1~100 |
| `type` | enum | - | `PURCHASE`, `SALE`, `STORAGE`, `DISPOSAL` |
| `status` | enum | - | `PENDING`, `COMPLETED`, `CANCELED` |
| `from` | date | - | 거래일 시작, `YYYY-MM-DD` |
| `to` | date | - | 거래일 종료, `YYYY-MM-DD` |
| `sort` | enum | `occurredDesc` | `occurredDesc`, `occurredAsc` |

항목 예시:

```json
{
  "id": "TRX-20260908-000001",
  "type": "PURCHASE",
  "title": "재활용 철근 외 2건",
  "amount": "-1450000",
  "currency": "KRW",
  "status": "COMPLETED",
  "referenceType": "PURCHASE_REQUEST",
  "referenceId": "PUR-20260908-000001",
  "occurredAt": "2026-09-08T05:30:00.000Z"
}
```

금액 부호는 고객 관점입니다. 지급은 음수, 판매 정산 수입은 양수입니다.

## 7. 데이터 및 구현 선행사항

현재 Prisma 스키마에는 아래 확장이 필요합니다.

1. `User.businessRegistrationNumber` 추가. 자산 소유권은 `User.customerId`와 기존 고객 코드를 연결해 조회하며, 고객사 엔터티 분리는 후속 과제
2. `Product`, `Campaign`, `CampaignProduct`, `MarketChange`: 스키마 정의 및 기획전 직접 편성 API 구현 완료. 상품 편집·주문 연계의 추가 구현은 별도 범위
3. `PurchaseRequest`, `PurchaseRequestItem`: 요청자, 상품 스냅샷, 배송·연락처, 상태
4. `SaleStatusRequest`: `START_SALE`/`CANCEL_SALE`, 승인 상태, 희망 금액, 사유
5. `Transaction`: 유형, 금액, 상태, 업무 리소스 참조
6. `RevokedToken` 또는 세션 저장소: JWT `jti`, 만료 시각, 폐기 시각
7. `IdempotencyRecord`: 사용자, 경로, 키, 요청 hash, 응답, 만료 시각

`Asset.customerId`는 기존 고객 코드이며 `User` 외래키가 아닙니다. 동일 고객사의 여러 계정은 같은 `User.customerId`를 사용할 수 있습니다. migration 적용 후 기존 활성 고객 계정에는 운영 데이터의 고객 코드를 명시적으로 매핑해야 하며, 미연결 계정은 자산 API를 호출할 수 없습니다.

## 8. 보안 및 동시성

- 모든 ID 조회는 인증 사용자 소유권 조건을 SQL 조회에 포함합니다.
- 상품 가격, 할인율, 재고, 거래 금액은 서버 계산값만 사용합니다.
- 구매 요청 시 상품 행을 트랜잭션 안에서 재조회합니다.
- 자산 판매 요청은 자산 버전 또는 조건부 갱신으로 중복 요청을 차단합니다.
- 관리자 승인 API는 고객 API와 분리하고 `ADMIN` 역할을 강제합니다.
- 로그인 응답과 로그에 비밀번호, password hash, 전체 JWT를 기록하지 않습니다.
- 사업자등록번호는 응답·로그·백업 접근 정책에서 개인정보로 취급합니다.