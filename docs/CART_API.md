# 개인 장바구니 API

모든 경로는 활성 CUSTOMER + 활성 연결 고객사 인증이 필요하다. VIEWER/MANAGER 모두 개인 장바구니를 사용할 수 있으며 소유자는 Bearer 인증에서 결정한다. `Cache-Control: private, no-store`. 비회원 장바구니는 이 API를 호출하지 않는다.

| 메서드·경로 | 입력 | 의미 |
| --- | --- | --- |
| GET `/api/cart` | 없음 | 최신 가격·재고·판매 상태로 재검증 |
| POST `/api/cart/items` | `{operationId,productId,quantity}` | 기존 수량에 더하기 |
| PATCH `/api/cart/items/:id` | `{quantity,expectedVersion}` | 최종 절대 수량 저장 |
| DELETE `/api/cart/items/:id?version=0` | 항목 버전 | 단일 삭제 |
| DELETE `/api/cart/items` | `{items:[{id,expectedVersion}]}` | 선택 항목 원자 삭제 |
| POST `/api/cart/sync` | `{operationId,items:[{productId,quantity}]}` | 비회원 수량 합산 |

`operationId`, 항목 `id`는 UUID이며 상품 ID는 최대 20자이다. 수량은 양수 decimal 문자열, 최대 10억·소수 3자리. EA/BOX/PIECE는 정수. 장바구니·요청 최대 100종, 병합 입력 중복 상품 ID 금지, body 최대 32KB. 가격·소유자 등 임의 입력 필드는 허용하지 않는다.

응답은 `{success:true,data:{id,version,items}}`. 아직 생성되지 않은 빈 장바구니의 id는 null이다. 각 항목에는 `id,productId,quantity,version,name,unit,grade,category,imageUrl,availableQuantity,minimumOrderQuantity,unitPrice,originalUnitPrice,issues,total`이 포함된다. 금액은 원 정수 문자열이며 최신 할인 단가와 수량을 정확한 decimal half-up으로 계산한다. issues는 판매 중단·재고 부족·최소 주문 수량 미달 등이다. 문제가 있어도 요청 수량은 유지하며 클라이언트 선택 합계에서 제외한다.

추가·병합은 같은 operationId/입력 재시도 시 다시 합산하지 않는다. 동일 ID에 다른 입력은 409. PATCH/DELETE의 오래된 expectedVersion은 409이며 최신 조회 후 명시적으로 재시도한다. 존재하지 않거나 다른 계정의 항목은 404. 입력 오류400, 인증401, 계정/고객사 접근403. 부분 병합은 없으며 실패한 트랜잭션은 전체 롤백한다.

클라이언트는 Zustand에 비회원 로컬 데이터·UI 선택·회원 임시 수량만 두고, React Query가 통신·회원 캐시·재시도를 담당한다. 수량 클릭은 즉시 표시, 항목별 750ms 디바운스 후 PATCH. 진행 중 추가 클릭은 다음 요청으로 직렬화하며 오래된 응답이 최신 입력을 제거하지 않는다. 실패 시 서버 수량으로 복구하고 사용자 입력은 재시도용으로 유지한다. 회원 데이터와 토큰은 localStorage에 저장하지 않는다.

로그인 즉시 guest 목록을 내구성 있는 operationId 묶음으로 고정하고 sync한다. 성공한 묶음만 비우며 실패 시 동일 ID로 재시도한다. 다른 계정에는 실패 묶음을 자동 전송하지 않는다. 로그아웃은 수량 저장 완료를 기다리며 실패 항목이 있으면 재시도를 안내한다. 모달을 닫으면 대기 수량을 즉시 전송한다. 탭 종료 전 미저장 경고는 제공하지만 종료 이후 저장 완료는 보장하지 않는다.

견적 제출·주문·결제·재고 예약/차감·재고 확보 보장은 이 API 범위에 포함되지 않는다.