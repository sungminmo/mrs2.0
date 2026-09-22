# MRS

## 서비스 정책

현재 구현된 업무 흐름, 상태값, 운영 제약 및 시제품 한계는 [SERVICE_POLICY.md](SERVICE_POLICY.md)를 참고하세요.

## Docker 백엔드 개발 환경

Ubuntu 24.04 서버에서 외부 MySQL 8.4, Hono/Node.js, React/Nginx를 사용합니다.
고객 포털, 관리자 포털, 백엔드는 private GHCR 이미지로 각각 빌드·배포됩니다.
백엔드는 상태 확인, JWT 로그인, 회원가입 및 관리자 회원 승인 API를 제공합니다.

| 구성 | 역할 | 호스트 공개 포트 |
| --- | --- | --- |
| customer / Nginx | `/mrs2.0/`, `/admin/`, `/api/` 공개 gateway | 기본 `127.0.0.1:8080`, `HTTP_BIND`로 변경 |
| admin / Nginx | `/admin/` 관리자 정적 화면 | 없음 |
| backend / Hono | 상태 API, JWT 인증, Prisma/MySQL 연결 | 없음 |
| 외부 MySQL 8.4.11 | `mrs-db`, `dbmasteruser` | 배포 서버에서만 3306 허용 |

MySQL 보안 그룹은 배포 서버의 주소만 허용하고 일반 인터넷에 3306을 공개하지 않습니다.
Nginx에서 DB에 직접 접근하지 않으며 비밀번호는 루트 `.env`에서만 관리합니다.
이미지는 다중 아키텍처 다이제스트, npm 의존성은 lockfile로 고정했습니다.
보안 업데이트 적용 시 이미지 다이제스트도 검토하고 갱신해야 합니다.

현재는 최초 연결을 위해 `dbmasteruser`를 마이그레이션과 런타임에 함께 사용합니다.
운영 안정화 전에는 SELECT/INSERT/UPDATE/DELETE 권한만 가진 전용 앱 계정으로 분리하세요.
TLS가 선택 사항이어도 외부 네트워크를 통과한다면 AWS CA 인증서를 사용한 검증 연결을 권장합니다.

### 서버 최초 실행

아래 작업은 SSH로 접속한 **Ubuntu 서버**에서 실행합니다. 먼저 확인합니다.

```sh
uname -m
docker version
docker compose version
ss -ltn '( sport = :8080 )'
```

Docker 데몬 접근 권한과 Git 저장소 접근 권한이 필요합니다. Docker 권한 오류는
서버 관리자가 처리해야 하며, Docker 소켓을 누구나 쓰도록 권한을 변경하지 마세요.
현재 이미지는 `amd64`와 `arm64`를 지원합니다. 8080이 사용 중이면 아래 `HTTP_PORT`를 변경합니다.

```sh
git clone <저장소_URL> MRS
cd MRS
umask 077
cp .env.example .env
cp .deploy.env.example .deploy.env
chmod 600 .env
chmod 600 .deploy.env
```

`.env`에서 `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`를 확인하고 `DB_PASSWORD`와
`JWT_SECRET`을 설정하세요. `JWT_SECRET`은 `openssl rand -hex 32`로 생성할 수 있으며 최소
32자여야 합니다. 비밀번호는 서버 터미널에서만 취급하고 채팅, Git, 로그에 공유하지 마세요.
빈 비밀번호는 Compose가 거부하며 실제 `.env`는 Git 및 이미지 빌드에서 제외됩니다.

공인 IP로 개발 서버를 공개할 때만 `.env`에 아래 값을 추가하고 Lightsail 방화벽에서 TCP
8080의 소스를 개발자 IP로 제한해 허용하세요. `3000`과 `3306`은 공개하지 않습니다.

```dotenv
HTTP_BIND=0.0.0.0
HTTP_PORT=8080
```

배포 전에 DB 엔진과 네트워크 접근을 확인합니다. 버전이 8.4.11과 다르거나 TCP 연결이
실패하면 마이그레이션을 실행하지 마세요.

```sh
getent hosts ls-4d8314fe62c21831055666ba9a240b70849af398.c54u0ugkgzq5.ap-northeast-2.rds.amazonaws.com
nc -zvw5 ls-4d8314fe62c21831055666ba9a240b70849af398.c54u0ugkgzq5.ap-northeast-2.rds.amazonaws.com 3306
```

파일에 값을 넣은 뒤 다음을 실행합니다.

```sh
docker compose config --quiet
docker compose build
docker compose run --rm --no-deps backend npm run db:migrate
docker compose run --rm --no-deps backend npm run db:status
docker compose up -d --wait
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/ready
```

최초 마이그레이션은 Prisma가 관리하며 사용자, 카테고리, 품목, 자산 관련 테이블을 생성합니다. 샘플 데이터는 만들지 않습니다.
연결 직후 `SELECT VERSION()`, `@@character_set_server`, `@@collation_server`, `@@time_zone`을
확인해 MySQL 8.4.11, utf8mb4, UTC 설정이 맞는지 점검하세요.
상태 API는 `/api/health/live`가 프로세스 생존을, `/api/health/ready`가 실제 `SELECT 1`
성공 여부를 확인합니다. DB 장애나 제한 시간 초과 시 readiness는 `503`을 반환합니다.
DB 복구 후에는 같은 연결 풀에서 자동으로 재연결합니다. Docker의 unhealthy 상태 자체는
컨테이너 재시작을 유발하지 않습니다. 프로세스가 종료됐을 때 restart 정책이 적용됩니다.

### Mac에서 접속

Mac의 별도 터미널에서 아래 SSH 터널을 열고 유지합니다.

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L 127.0.0.1:8080:127.0.0.1:8080 <SSH_사용자>@<서버_주소>
```

- 화면: http://localhost:8080/mrs2.0/
- 준비 상태: http://localhost:8080/api/health/ready
- 관리자: http://localhost:8080/admin/#/admin/dashboard

Mac의 8080이 사용 중이면 `-L 127.0.0.1:8081:127.0.0.1:8080`으로 바꾸고
브라우저에서는 8081로 접속합니다. 서버의 `HTTP_PORT`를 바꿨다면 마지막 포트도 맞춰주세요.
80, 443, 3000, 3306의 방화벽 개방은 필요하지 않습니다. 서버 공인 IP로는 화면에 접근할 수 없습니다.
서버의 다른 로컬 사용자도 루프백 주소에 접근할 수 있으므로 신뢰하는 서버에서만 사용하세요.

### Mac 개발

Node.js 24 LTS를 권장합니다. 프론트엔드와 백엔드 의존성은 별도로 설치합니다.

```sh
npm ci
npm --prefix backend ci
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
npx tsc -b
npx oxlint src backend/src backend/test
```

프런트 전체 빌드는 고객과 관리자 산출물을 각각 `dist/customer`, `dist/admin`에 생성합니다.

```sh
npm run build
npm run build:customer
npm run build:admin
```

상태 API 단위 테스트는 DB 없이 실행됩니다. Mac에서 로컬 MySQL 8.4.11을 포함한 전체 환경은
두 Compose 파일을 함께 사용합니다. 로컬 DB는 `mysql-data` 볼륨을 사용하며 기존 MariaDB
`db-data` 볼륨을 재사용하지 않습니다.

```sh
docker compose -f compose.yaml -f compose.local.yaml config --quiet
docker compose -f compose.yaml -f compose.local.yaml build
docker compose -f compose.yaml -f compose.local.yaml up -d --wait db
docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run db:migrate
docker compose -f compose.yaml -f compose.local.yaml up -d --wait
curl --fail http://127.0.0.1:8080/api/health/ready
```

이때는 SSH 터널 없이 루프백 주소로 접근합니다.
호스트에서 실행하는 `npm --prefix backend run dev`는 별도로 접근 가능한 DB 환경변수를
주입해야 합니다. 로컬 override는 DB를 호스트에 공개하지 않으므로 컨테이너 빌드로 통합 검증합니다.

새 마이그레이션은 로컬 MySQL을 실행한 상태에서 Prisma 스키마를 변경한 뒤 생성합니다.

```sh
docker compose -f compose.yaml -f compose.local.yaml build backend
docker compose -f compose.yaml -f compose.local.yaml up -d --wait db
docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run db:dev -- --name 변경_설명
```

스키마 파일은 `backend/prisma/schema/`에 도메인별로 분리되어 있고, 생성된 SQL은
`backend/prisma/migrations/`에 저장됩니다. 이미 배포한 마이그레이션 파일은 수정하지 마세요.

### GitHub Actions 자동 배포

`main` push 시 변경 경로에 따라 고객, 관리자, 백엔드 workflow가 각각 private GHCR 이미지를
commit SHA 태그로 발행하고 Lightsail에서 해당 서비스만 교체합니다. 고객 데모는 별도의 Pages
workflow가 `dist/customer`만 배포합니다. GitHub 저장소의 `production` Environment에 아래
secret을 등록하세요.

| Secret | 값 |
| --- | --- |
| `DEPLOY_HOST` | Lightsail 공인 IP 또는 호스트명 |
| `DEPLOY_USER` | SSH 사용자, 기본 구성은 `ubuntu` |
| `DEPLOY_SSH_KEY` | 배포 전용 SSH 개인키 |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -H <호스트>` 결과를 별도 신뢰 경로에서 검증한 값 |

서버 저장소는 `/home/ubuntu/MRS`에 있어야 하며 `main`을 `git pull --ff-only` 할 수 있어야
합니다. private GHCR pull 권한이 있는 classic PAT(`read:packages`)를 서버 터미널에서만 입력해
최초 1회 로그인합니다. 토큰을 명령 인수나 저장소 파일에 넣지 마세요.

```sh
docker login ghcr.io -u <GitHub_사용자>
cd /home/ubuntu/MRS
cp -n .deploy.env.example .deploy.env
chmod 600 .env .deploy.env
```

workflow는 `scripts/deploy-service.sh <customer|admin|backend> <image-tag>`를 호출합니다.
스크립트는 배포를 직렬화하고 새 이미지를 pull한 뒤 Compose health와 서비스 경로를 확인합니다.
실패하면 `.deploy.env`의 이전 이미지 태그로 자동 복귀합니다. 백엔드는 교체 전에 Prisma
migration을 적용하므로 migration은 이전 애플리케이션과 호환되게 작성해야 하며 DB 스키마
자체는 자동으로 되돌리지 않습니다.

기존 2-service 구성에서 처음 고객 포털을 배포할 때는 스크립트가 8080을 점유한 구형
`frontend` 컨테이너를 제거합니다. 이 최초 서비스명 전환만 구형 이미지 자동 복귀가 불가능하며,
첫 `customer` 배포가 성공한 이후부터 이미지 태그 rollback이 적용됩니다.

서버에서 수동으로 같은 배포를 실행할 수도 있습니다.

```sh
./scripts/deploy-service.sh customer <commit-sha>
./scripts/deploy-service.sh admin <commit-sha>
./scripts/deploy-service.sh backend <commit-sha>
```

이미 실행된 마이그레이션 파일은 수정하지 마세요. 컨테이너 교체 중 짧은 연결 중단은 있을 수
있으므로 이 구성은 무중단 배포를 보장하지 않습니다.

### 진단과 데이터 보존

```sh
docker compose ps
docker compose logs --tail=100 backend admin customer
docker compose exec customer nginx -t
docker compose exec admin nginx -t
docker compose down
docker compose up -d --wait
```

운영 Compose의 `down`은 외부 MySQL 데이터를 삭제하지 않습니다. 로컬 환경에서
`docker compose -f compose.yaml -f compose.local.yaml down`은 컨테이너만 제거하고
`mysql-data` 볼륨을 보존합니다. **로컬에서 `down -v`와 볼륨 삭제 명령은 DB를 삭제하므로
사용하지 마세요.** 기존 MariaDB의 `db-data` 볼륨은 자동 변환되지 않으며 MySQL 컨테이너에
연결하면 안 됩니다. 필요한 데이터가 있다면 논리 백업과 복구 절차를 별도로 수행하세요.

관리형 DB 백업 정책과 별개로 복구 가능한 논리 백업 절차를 마련하세요. 아래 예시는 `.env`를
컨테이너에 직접 주입하고 저장소 밖에 MySQL 논리 백업을 만듭니다. 명령줄에 비밀번호를 넣지 않습니다.

```sh
umask 077
mkdir -p "$HOME/mrs-backups"
docker run --rm --env-file .env mysql:8.4.11 sh -c \
  'MYSQL_PWD="$DB_PASSWORD" exec mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --single-transaction --routines --events --triggers --set-gtid-purged=OFF "$DB_NAME"' \
  > "$HOME/mrs-backups/mrs-db-$(date +%Y%m%d-%H%M%S).sql"
```

명령 종료 성공 여부를 확인하고 별도 환경에서 복구 테스트를 수행하세요. 백업에는 민감한
데이터가 포함될 수 있으므로 접근 제한과 암호화된 별도 보관이 필요합니다.
확장된 `docker compose config`나 `docker inspect` 출력은 비밀번호를 포함할 수 있습니다.
설정 확인에는 `docker compose config --quiet`를 사용하고 진단 출력은 공유 전 검토하세요.

고객·관리자 진입은 JWT 역할로 구분되지만 HTTPS, 계정별 DB 최소 권한, 비밀 관리, 자동 백업과
모니터링은 운영 전에 별도로 구성해야 합니다.

## Administrator Prototype

Open `/admin/#/admin/dashboard`, or use the administrator link in the homepage footer or customer sidebar. The header links back to `/mrs2.0/`. Hash routes support direct entry, reload, history navigation, tabs, filters, and record detail links without server rewrites. Customer anchors such as `#services` remain unchanged.

This is an independent prototype with fictional data as of September 14, 2026 (KST). JWT login and the ADMIN role protect the entry point, while categories, master items, inventory and market operations still use temporary in-memory editing and other menus remain read-only. Operational persistence, real approval processing, email delivery, billing execution and customer-data synchronization are not implemented. Reloading resets the prototype edits, images and history.

Menus: dashboard; receiving requests and schedules; inspections and disposal; master item management; category management; asset management with inventory and locations; sales requests, products, purchase quotes and campaigns; storage invoices, payouts and disposal invoices; customers, sites and inquiries; reference grades, units, rates and policies.

### Three-Level Categories

- `/admin/#/admin/categories?tab=tree` provides first-, second- and third-level browsing, creation, renaming, same-depth parent moves, numeric sibling ordering and active/inactive status. The old `#/admin/settings?tab=categories` route redirects here. Category codes are automatically assigned, immutable references; names are not relation keys. Physical deletion is not supported.
- [src/categories.ts](src/categories.ts) owns the shared category seed, path resolution and hierarchy policies. Parent references must exist; cycles, fourth-level descendants, depth changes, blank names and duplicate sibling names are rejected. Same names in different branches are allowed. Tied order values use name/code ordering.
- Master items and inventory must reference a third-level category. An inactive category or ancestor blocks new selections, including new assets linked to items in that branch. Existing references and records remain viewable/editable without forced recategorization. Re-enabling a parent preserves each child's own active/inactive setting.
- Category names and parent moves update the displayed paths of all referencing admin items, assets, products and campaigns. Item recategorization still does not overwrite existing asset snapshots; an asset's category change is recorded with before/after paths and codes in its own history. Marketplace products derive their category from the linked asset.
- Item, asset and admin product/campaign filters support all three levels. Selecting an ancestor includes its descendants; changing the parent clears lower selections. Campaign membership includes active descendant asset categories instead of matching category names. Disabled category products remain visible in administration but are excluded from campaign previews.
- The member and guest markets use the same three-level seed and filters. Product details, basket CSV and quotation snapshots carry the full category path; campaign image selection uses stable root codes. Admin edits remain isolated temporary data and do not synchronize into the customer demo or backend.
- Policy regression tests: `node --test tests/categories.test.mjs` (Node.js 24 recommended). Run with `npx tsc -b` and the existing source lint checks.

### Master Items And Assets

- Master items: `/admin/#/admin/items?tab=master`. Create, view, edit and switch between active/inactive. Codes are automatically assigned and immutable (`ITM-000001` onward). Inactive items cannot be linked to new assets; existing links remain valid. Physical deletion is not supported.
- Each item represents a name/category/specification/brand/base-unit combination. Category, specification and brand provide defaults for new asset snapshots. Units use shared codes (EA, Box, kg, ton, m, m³, 본); old inventory `개` is normalized to EA. Units on items with linked assets cannot change; automatic unit conversion is out of scope.
- Inbound, outbound and standard prices are KRW per base unit, VAT included. Blank means unknown, distinct from zero. These reference prices do not recalculate asset appraisals, marketplace prices or past settlement records.
- Assets: `/admin/#/admin/inventory?tab=stock`. The former inventory/location menu is now asset management; old URLs still work. Administrators manually register/edit assets; this does not execute inspection approval or physical receipt. Customer and site come from the linked receiving request. Inventory IDs (`AST-001` onward), receiving references and item references are immutable after registration.
- A record tracks a material batch with one owner, receipt request, item, grade and location. Quantity is the expected amount for pending receipt and current remainder for stored assets. Completed outbound records have zero current quantity; their prior quantity remains in change history. EA/Box/본 require integers; other units accept up to three decimal places. Partial shipment, batch splitting and multiple locations per record are out of scope.
- Grade (S/A/B/F), storage (입고대기/보관중/출고완료) and sale status (판매대기/판매중/판매완료) are independent fields. F-grade and pending-receipt assets cannot be marked selling/sold; selling assets must be stored. Sale approval remains a separate existing request status. Editing these fields does not execute marketplace approval, disposal, shipment or billing.
- Asset edits require a reason and retain timestamps (displayed in KST), changed fields and before/after values, including photos. Historical inspection quantities remain snapshots. Location occupancy and related inventory links use the current in-memory asset records; completed outbound records do not occupy locations.
- Images: one representative item image, up to eight asset photos, JPG/PNG/WebP, up to 5 MB each. Files are decoded for validation and previewed locally; images can be replaced/removed. They are not uploaded to a server or persisted across reloads.
- Lists support search, status filters, sorting and pagination; assets additionally filter by grade, sale status, item, location and customer. Detail/list navigation retains filter conditions. Barcode/QR rendering/scanning, ERP integration and server-side audit records are not implemented.

### Market Operations

- Sales requests (`#/admin/market?tab=sales`): change approval status to 승인 대기, 승인 완료 or 반려 in detail; use checkboxes and the bulk action on the list. Approval does not automatically create a product or start selling.
- Products (`#/admin/market?tab=products`): individual and bulk changes support 판매대기, 판매 중, 재고 없음. 판매취소 is an action that stores 판매대기, not a fourth persisted state. Only 판매 중 products with active categories appear in campaign product previews.
- Bulk selection covers the current page only and resets on search, filters, sort or page changes. A confirmation step shows the selected count and destination state. Cancel leaves all records unchanged.
- Purchase quotes (`#/admin/market?tab=quotes`): detail supports 접수 대기, 견적 회신 and 출고 완료. Status changes do not send quotes, deduct inventory quantities, change asset statuses or execute settlement.
- Campaigns (`#/admin/market?tab=campaigns`): add/edit title, description, category at any depth, KST start/end date and time, display order and exposure flag. Codes are automatically assigned and immutable. End must be later than start, order must be an integer from 0 to 9,999, and category/title/description are required. Inactive categories cannot be newly assigned or enabled; existing campaigns can be disabled while retaining their category.
- Changes update admin lists, details, approval dashboard counts and related projections immediately. Customer banners remain independent; no backend persistence, publication or synchronization is performed. Exposure status still uses the fixed example reference date.
- Policy tests: `node --test tests/adminMarket.test.mjs tests/categories.test.mjs`.

### Data Relationships

- [src/admin/adminData.ts](src/admin/adminData.ts): independent typed seed entities, numeric quantities/money, ISO timestamps, explicit status unions and reference IDs.
- Customer → site → receiving request → inspection → inventory → location. Vehicle-based receiving estimates are not converted into inventory quantities.
- Inventory → sale request/product → purchase quote lines. Quote lines retain product-name and price snapshots. Requested total sale value and product unit price are distinct.
- Invoices reference customers and optionally receipts or locations; historical payout examples do not deduct current inventory. Inquiries link customers to receiving requests, inspections or purchase quotes.
- [src/admin/adminViews.ts](src/admin/adminViews.ts): list/detail projections and related-record links rebuilt from current in-memory categories, inventory, items and market records. Dashboard counts use the same live projections. Search, filters, sorting and pagination only affect views.
- Inspection closure and physical disposal completion are separate. Three-day automatic closure is a reference policy, not an implemented scheduler. Unknown quantities and amounts remain `null`; they are not displayed as zero. Only issued invoices enter billing totals, excluding the 48,000 KRW disposal estimate.
- Campaigns are category-based. Exposure uses the fixed example date, inclusive start and exclusive end. Location capacity and rate formulas are not established; no fictional utilization percentage or automatic fee calculation is shown.
- Missing inspection photos/documents are shown as unregistered. Product reference photographs retain their original credits and are not disposal evidence.

Source checks: `npx tsc -b` and `npx oxlint src`. `dist` is a local build artifact and is excluded from Git; GitHub Pages and Docker both build it from source during deployment.

## Inspection And Disposal Prototype

- My Assets includes asset overview and receipt-level inspection/disposal views. Sample receipts in `src/disposals.ts` are separate historical snapshots and do not subtract from live inventory or appraisal values.
- Inspection detail separates accepted assets (including grade) from disposal candidates. Customer guidance shows receipt and inspection-completion dates, acknowledgement, and an inquiry modal. Acknowledgement does not grant disposal consent. Disposal processing/cost sections and consent controls are not shown in this view.
- Inquiries are recorded locally, without an inline history. Guidance requests inquiries within two days after inspection completion and notes that disposal costs may be charged separately; the prototype does not enforce a submission deadline or deliver inquiries.
- Processing and cost states are independent. Unknown amounts are `null`, never zero. Only billed disposal costs enter settlement totals, period filters, and CSV exports. The demo includes one 65,000 KRW invoice (tax included); the 48,000 KRW estimate is excluded.
- Notification, inspection detail, and settlement links share the receipt ID. Read status and saved acknowledgement/consent/comments survive navigation but reset on reload. Unsaved drafts are local to the detail view.
- Reports and processing evidence are examples. No real photos, email delivery, objection submission, payments, or backend persistence are connected. Production requires authenticated operator updates, actual evidence uploads, delivery logs, versioned consent and cost records, and server-side authorization/audit history.

## Market Campaign Configuration

Customer market banners are configured in the `campaigns` array in [src/MarketCampaigns.tsx](src/MarketCampaigns.tsx). The administrator campaign editor operates on separate temporary demo data; customer banner configuration still requires deployment and has no backend persistence.

- Keep `id` unique and stable. Edit `title` and `description` for campaign copy.
- Set `category` to an existing catalog category. The CTA clears search and offer filters, selects that category, and focuses the product list. Images use the existing category reference photos and credits.
- Use `enabled` to publish or hide a campaign, and `order` for ascending display priority.
- Set `startsAt` and `endsAt` to ISO timestamps with an explicit timezone, for example `2026-10-01T00:00:00+09:00`. `null` means no boundary. Start is inclusive; end is exclusive. Visibility refreshes every 30 seconds using the device clock.
- If the selected campaign expires, the first active campaign is shown. If none are active, the banner is hidden.
- Members and guests share the campaigns. Guest banners contain no prices or discount amounts; existing login requirements remain in place.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
