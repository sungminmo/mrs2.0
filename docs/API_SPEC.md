# 관리자 품목 수정

`PUT /api/admin/items/{id}`는 관리자 Bearer 토큰이 필요하며 현재 품목코드를 URL에 전달한다. 요청은 품목의 `id`, `name`, `category`, `specification`, `brand`, `unit`, `inboundPrice`, `outboundPrice`, `standardPrice`, `enabled`, `note`, `images`를 포함한다. `images`는 최대 한 장의 `{id,name,url}` 배열이다. 기본정보와 이미지를 하나의 트랜잭션으로 수정하고 성공 시 `200 data.item`으로 저장된 레코드를 반환한다.

품목코드는 숫자 6자리이며 변경 시 연결 자산과 이미지의 외래키도 함께 갱신된다. 기존 자산의 단가·이름·규격은 소급 변경하지 않는다. 연결 자산이 있으면 기준 단위 변경은 `409`로 거절된다. 등록된 기존 이미지는 그대로 유지할 수 있으며 새 이미지는 지정 S3 버킷 주소만 허용한다. 없는 품목은 `404`, 잘못된 입력·참조는 `400`, 중복 코드·동시 충돌은 `409`로 반환한다. 수정 전후 값과 작업자를 감사 이력에 저장한다.

관리자 등록·수정 성공 시 완료 토스트를 표시하며 실패한 요청에는 성공 알림을 표시하지 않는다. 이미지 업로드만으로는 DB 저장 완료 알림을 표시하지 않는다. 기존 품목 수정은 새로고침 후에도 유지된다. 이번 변경은 다른 메뉴의 미구현 DB 쓰기 기능을 새로 구현하지 않으며 임시저장 관련 화면 문구만 제거한다. 스키마 변경은 없고 적용 시 관리자·백엔드를 함께 배포한다.

# 관리자 이미지 S3 업로드

- `POST /api/admin/images/{kind}`: 관리자 Bearer 토큰, `kind=items|assets|banners`, multipart `file` 한 장. 응답 `201 data.image={id,name,url}`.
- 파일당 5MB 이하 정지 JPG/PNG/WebP만 지원한다. 서버에서 실제 형식과 최대 2천만 픽셀을 검사하고 방향 보정, 최대 2400px 리사이즈, 메타데이터 제거 후 WebP로 저장한다. UUID 키를 사용하며 원본 파일명은 객체 키에 사용하지 않는다.
- 버킷 `bucket-mrs`, 리전 `ap-northeast-2`, 키 `{kind}/{관리자ID}/{UUID}.webp`. DB에는 공개 HTTPS URL과 원래 파일명을 저장한다. ACL을 지정하지 않으며 버킷의 공개 읽기 정책을 사용한다.
- 관리자별 10분당 100회, 프로세스별 동시 처리 2회 제한. 실패는 검증 `400`, 요청 크기 `413`, 제한 `429`, S3 장애 `503`으로 반환한다. 브라우저에 AWS 자격 증명을 전달하지 않는다.
- `PUT /api/admin/items/{id}/images` 및 `PUT /api/admin/assets/{id}/images`: `{images,expected,reason}`. 이미지 목록은 `{id,name,url}` 배열, 품목 최대 1장/자산 최대 8장. 현재 DB 목록과 `expected`가 다르면 `409`이며 변경 사유와 감사 이력을 트랜잭션으로 저장한다. 기존 비-S3 이미지는 변경 없이 유지할 수 있고, 새 주소는 지정 버킷의 정지 이미지 경로만 허용한다.
- 기존 품목·자산은 상세/편집 화면의 **이미지 DB 저장** 버튼으로 저장한다. 기본정보 임시 저장과 분리된다. 신규 품목은 업로드 후 품목 등록으로 URL을 함께 저장한다. 신규 자산의 DB 생성 API와 고객 입고 신청 저장 API는 아직 구현되지 않았으므로 해당 화면에 영구 업로드를 제공하지 않는다. 배너 이미지는 업로드 후 **편성 저장**으로 기존 배너 API에 저장한다.
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
      "arn:aws:s3:::bucket-mrs/banners/*"
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
- 대시보드는 입고·검수 건수 집계와 입고 10건·기획전 5건 미리보기만 조회한다. 로케이션은 자산 위치별 집계와 선택 위치의 페이지 자산을 조회한다. 로케이션 정의·판매 요청·구매 견적·명세·현장·문의·기준정보 등 DB 미연결 예시 목록은 기존 로컬 페이지 표시를 유지한다. 카테고리는 계층 탐색·분류 선택용 트리 기준정보로 조회하며 업무 레코드 전체를 가져오지 않는다.
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

로그인·가입·고객사 정확 검색·공개 배너·상태 확인·API 문서를 제외한 API는 인증이 필요합니다. 고객 API는 DB에서 확인한 활성 회원과 활성 고객사 소유 데이터만 조회할 수 있습니다. URL이나 요청 본문의 고객 ID를 자산 접근권한으로 신뢰하지 않습니다. 고객사 관리의 현재 계약과 이관 절차는 [CUSTOMER_MANAGEMENT.md](CUSTOMER_MANAGEMENT.md)를 참조합니다. 아래 미구현 업무 API는 향후 설계이며 실행 가능 여부는 OpenAPI 문서로 확인합니다.

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
2. `Product`, `Campaign`, `MarketChange`: 스키마 정의 완료. 상품·기획전 관리 API와 구매 요청 연계 구현 필요
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