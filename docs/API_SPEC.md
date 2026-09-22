# MRS 고객 포털 API 명세서

- 버전: 1.0.0-draft
- 기준일: 2026-09-22
- Base URL: `/api`
- 인증: JWT Bearer (`Authorization: Bearer <accessToken>`)
- Content-Type: `application/json`
- 시간: ISO 8601 UTC (`2026-09-22T01:23:45.000Z`)
- 금액: 원 단위 정수 문자열. 예: `"1375000"`

## 1. 공통 규칙

로그인을 제외한 모든 API는 인증이 필요합니다. 고객 API는 토큰의 사용자와 연결된 고객사 소유 데이터만 조회하거나 변경할 수 있습니다. URL이나 요청 본문의 고객 ID를 신뢰하지 않습니다.

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
    "id": "CAT-010",
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

### GET `/products/{productId}`

판매 가능한 상품 상세를 조회합니다. 비공개·판매 종료 상품은 고객에게 `404`로 응답합니다.

응답 `200`의 `data`:

```json
{
  "id": "PRD-000002",
  "assetId": "AST-000002",
  "name": "회수 참나무 구조목",
  "category": {
    "id": "CAT-010",
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
| `sort` | enum | `updatedDesc` | `updatedDesc`, `valueDesc`, `receivedDesc` |

항목 예시:

```json
{
  "id": "AST-000002",
  "itemId": "ITM-000002",
  "name": "회수 참나무 구조목",
  "category": { "id": "CAT-010", "name": "구조목", "path": "목재 > 구조재 > 구조목" },
  "specification": "38 x 89 mm, 2.4 m",
  "brand": "",
  "grade": "S",
  "quantity": "80.000",
  "unit": "M",
  "appraisalValue": "3480000",
  "storageStatus": "STORED",
  "saleStatus": "ON_SALE",
  "location": { "id": "LOC-A03", "name": "A-03 창고" },
  "thumbnailUrl": null,
  "activeSaleStatusRequest": null,
  "createdAt": "2026-09-02T01:00:00.000Z",
  "updatedAt": "2026-09-21T03:30:00.000Z"
}
```

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
    "assetId": "AST-000002",
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
    "assetId": "AST-000002",
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

1. `User.businessRegistrationNumber` 추가 및 사용자와 고객사 소유권 연결
2. `Product`: 자산, 가격, 공개 상태, 판매 가능 수량, 특가 정보·기간
3. `PurchaseRequest`, `PurchaseRequestItem`: 요청자, 상품 스냅샷, 배송·연락처, 상태
4. `SaleStatusRequest`: `START_SALE`/`CANCEL_SALE`, 승인 상태, 희망 금액, 사유
5. `Transaction`: 유형, 금액, 상태, 업무 리소스 참조
6. `RevokedToken` 또는 세션 저장소: JWT `jti`, 만료 시각, 폐기 시각
7. `IdempotencyRecord`: 사용자, 경로, 키, 요청 hash, 응답, 만료 시각

현재 `Asset.customerId`는 `User` 외래키가 아닙니다. API 구현 전에 로그인 사용자와 고객사 및 자산 소유권을 서버에서 신뢰할 수 있도록 관계를 추가해야 합니다.

## 8. 보안 및 동시성

- 모든 ID 조회는 인증 사용자 소유권 조건을 SQL 조회에 포함합니다.
- 상품 가격, 할인율, 재고, 거래 금액은 서버 계산값만 사용합니다.
- 구매 요청 시 상품 행을 트랜잭션 안에서 재조회합니다.
- 자산 판매 요청은 자산 버전 또는 조건부 갱신으로 중복 요청을 차단합니다.
- 관리자 승인 API는 고객 API와 분리하고 `ADMIN` 역할을 강제합니다.
- 로그인 응답과 로그에 비밀번호, password hash, 전체 JWT를 기록하지 않습니다.
- 사업자등록번호는 응답·로그·백업 접근 정책에서 개인정보로 취급합니다.