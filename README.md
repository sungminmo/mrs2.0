# MRS

건설자재의 입고, 검수, 보관 자산 및 판매 요청을 관리하는 고객·관리자 포털입니다.
아래 구현 범위는 2026-10-06 현재 소스 기준이며, 환경별 배포 상태는 별도로 확인해야 합니다.

## 서비스 정책

현재 구현된 업무 흐름, 상태값, 운영 제약 및 시제품 한계는 [SERVICE_POLICY.md](SERVICE_POLICY.md)를 참고하세요.

| 환경 | 용도 | 데이터 |
| --- | --- | --- |
| 고객·관리자·백엔드 스테이징 | 실제 API와 업무 흐름 검증 | 인증 및 MySQL DB 저장 |
| [공개 시연 사이트](https://sungminmo.github.io/mrs2.0/) | 고객 포털 목업 시연 | 예시 데이터, 브라우저 메모리 저장 |

공개 시연 사이트는 실제 고객 DB에 연결하지 않습니다. 데모 로그인과 판매·견적·정산 예시는 실제 업무 접수가 아닙니다.

## Docker 백엔드 개발 환경

Ubuntu 24.04 서버에서 외부 MySQL 8.4, Hono/Node.js, React/Nginx를 사용합니다.
고객 포털, 관리자 포털, 백엔드는 private GHCR 이미지로 각각 빌드·배포됩니다.
백엔드는 상태 확인, JWT 인증, 고객사·회원 관리, 자산 조회·편집, 입고·검수,
판매 요청 접수 및 관리자 조회, 로케이션·카테고리·품목·배너·사진 저장 API를 제공합니다.

| 구성 | 역할 | 호스트 공개 포트 |
| --- | --- | --- |
| customer / Nginx | `/mrs2.0/`, `/admin/`, `/api/` 공개 gateway | 기본 `127.0.0.1:8080`, `HTTP_BIND`로 변경 |
| admin / Nginx | `/admin/` 관리자 정적 화면 | 없음 |
| backend / Hono | 상태 API, JWT 인증, Prisma/MySQL 연결 | 없음 |
| 외부 MySQL 8.4.11 | `mrs-db`, `dbmasteruser` | 배포 서버에서만 3306 허용 |

MySQL 보안 그룹은 배포 서버의 주소만 허용하고 일반 인터넷에 3306을 공개하지 않습니다.
Nginx에서 DB에 직접 접근하지 않으며 비밀번호는 루트 `.env`에서만 관리합니다.
기본 컨테이너 이미지는 다이제스트, npm 의존성은 lockfile로 고정했습니다.
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
배포 이미지가 서버 아키텍처와 호환되는지 확인하세요. 8080이 사용 중이면 아래 `HTTP_PORT`를 변경합니다.

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

### GitHub Actions 스테이징 자동 배포

`main` push 시 변경 경로에 따라 고객, 관리자, 백엔드 workflow가 각각 private GHCR 이미지를
commit SHA 태그로 발행하고 스테이징 Lightsail에서 해당 서비스만 교체합니다. 고객 데모는 별도의 Pages
workflow가 `npm run build:demo`로 목업 고객 포털을 빌드해 `dist/customer`만 배포합니다.
Pages는 push 자동 배포 대상에서 제외하며 [deploy.yml](.github/workflows/deploy.yml)의 수동 실행만 유지합니다.
데모의 `고객 포털로 계속` 버튼은 API 인증 없이 예시 자산·마켓·정산 화면으로 진입하며,
변경 사항은 브라우저 메모리에만 저장됩니다. 실제 고객·관리자 인증과 DB에는 연결하지 않습니다.

GitHub CLI 인증 후 공개 시연 사이트만 배포하려면 다음을 실행합니다. 원격 `main`에 반영된 소스를 빌드하므로 로컬 미커밋 변경은 포함하지 않습니다.

```sh
gh workflow run deploy.yml --repo sungminmo/mrs2.0 --ref main
gh run list --repo sungminmo/mrs2.0 --workflow deploy.yml
gh run watch <run-id> --repo sungminmo/mrs2.0 --exit-status
```

GitHub 저장소의 `staging` Environment에 아래
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

## 현재 구현 범위

### 고객 포털

- `/mrs2.0/`에서 고객 인증과 승인된 고객사 소속을 확인합니다. 자산 소유권은 회원이 아닌 고객사 기준이며 타사 자산은 조회할 수 없습니다.
- 실제 자산 현황·목록·상세와 검색·필터·페이지 조회를 제공합니다. 총평가액과 미평가를 구분하고 출고완료 자산은 보유 집계에서 제외합니다.
- 자산 상세는 사진 갤러리, 현재 수량·관리 단위·위치 코드·등록일·등록 경과일과 CSV 내보내기를 제공합니다. 등록일은 `Asset.createdAt`이며 실제 입고일·보관료 기산일이 아닙니다.
- 판매 가격·할인율 등 제공되지 않는 데이터는 미등록으로 표시합니다. 자산 메모 저장은 비활성화되어 있습니다.
- VIEWER/MANAGER 모두 입고 신청 및 회사 전체 신청내역·확정 검수 결과를 조회할 수 있습니다. 검수 결과 확인과 폐기 대상 동의는 MANAGER만 가능합니다.
- 마켓 등록 요청은 전체 자산 수량 기준 희망금액을 입력해 실제 DB에 접수합니다. 마켓 상품 목록 API는 아직 연결되지 않았으며 실제 고객 마켓은 빈 목록입니다.

### 관리자 포털

`/admin/#/admin/dashboard`에서 별도 관리자 인증을 사용합니다. 직접 진입·새로고침·탭·검색·필터·상세 링크는 해시 경로를 사용합니다.

| 메뉴 | 경로 | 실제 제공 기능 |
| --- | --- | --- |
| 기초 정보 / 품목 | `#/admin/basic?tab=items` | 개별·CSV 등록, 조회·편집, 대표 사진 저장 |
| 기초 정보 / 카테고리 | `#/admin/basic?tab=categories` | 3단계 분류 생성·이름·순서·사용 여부 저장 |
| 입고·검수·폐기 / 입고 신청 | `#/admin/receiving?tab=requests` | 신청 조회·승인·반려, 실제 입고 등록 |
| 입고·검수·폐기 / 1차 검수 | `#/admin/receiving?tab=primary` | 초안·확정·제한된 정정, XLSX 가져오기, 검수 사진 |
| 입고·검수·폐기 / 상세 검수 | `#/admin/receiving?tab=detailed` | 판매 요청 기반 대상 조회, 자산 상세화 링크 |
| 입고·검수·폐기 / 폐기 관리 | `#/admin/receiving?tab=disposal` | 폐기 대상 및 동의·처리 상태 조회 |
| 자산 관리 / 자산 목록 | `#/admin/inventory?tab=stock` | 실제 자산 조회·사유 기반 편집·사진 저장·변경 이력 |
| 자산 관리 / 로케이션 | `#/admin/inventory?tab=locations` | 위치 등록·편집·사용 여부, 보관 자산 조회 |
| 마켓 운영 / 판매 요청 | `#/admin/market?tab=sales` | 고객 판매 요청 목록·상세, 검색·상태·고객·월 필터 |
| 마켓 운영 / 상품·기획전 | `#/admin/market?tab=products`, `#/admin/market?tab=campaigns` | DB 조회; 기존 화면의 임시 편집은 실제 운영 저장과 구분 |
| 콘텐츠 관리 / 배너 | `#/admin/content?tab=banners` | 배너·이미지·링크·일정 저장 및 공개 배너 조회 |
| 고객사·회원 관리 | `#/admin/customers?tab=companies`, `#/admin/members?tab=applications` | 고객사·회원 신청 및 승인·정지·권한 관리 |
| 관리자 계정 | `#/admin/accounts?tab=list` | SYSTEM_ADMIN 전용 계정 생성·편집·비밀번호·상태 관리 |

실제 저장 기능은 서버 인증과 검증을 통과해야 하며 변경 이력을 DB에 남깁니다.
구매 견적·청구·정산·문의 등 일부 메뉴는 예시 또는 미구현 화면입니다. 표시된 버튼이나 상태를 실제 업무 처리 완료로 해석하지 마세요.

### 코드·수량·분류 기준

- 품목 코드는 관리자가 입력하는 6자리 숫자입니다. 변경 시 연결 자산·사진 참조가 함께 갱신되며 연결 자산이 있으면 품목 단위를 바꿀 수 없습니다.
- 카테고리는 `[대분류 2자리][중분류 2자리][소분류 2자리]`의 6자리 코드입니다. 상위 분류는 하위 구간이 `00`이며 코드와 상위 분류는 등록 후 변경하지 않습니다. 물리 삭제는 제공하지 않습니다.
- 자산 코드는 실제 입고일의 `YYMMDD-NNNN` 형식으로 검수 확정 시 생성합니다. 관리자 자산 편집에서 자산번호·품목·단위·소유 고객·입고 연결은 변경하지 않으며 개당 평가금액은 수정할 수 있습니다.
- 자산 편집의 카테고리와 규격은 선택입니다. 미분류 또는 활성 1·2·3차 분류를 저장할 수 있으며 기존 미사용 분류는 유지할 수 있습니다. 1차 검수에 분류를 입력하는 경우의 검증은 별도 API 계약을 따릅니다.
- 수량은 최대 10억, 소수점 셋째 자리까지이며 EA·Box·본은 정수만 허용합니다. 출고완료는 0, 그 외 상태는 양수이고 보관중은 위치가 필요합니다.
- 등급·보관 상태·판매 상태는 별도 필드입니다. F등급 또는 입고대기 자산은 판매대기만 가능하고 판매중은 보관중이어야 합니다.
- 자산 평가금액은 품목 입고단가에서 S 10%·A 20%·B 40%를 할인한 개당 금액으로 자동 제안하며 원 단위 반올림합니다. 1차 검수·상세 검수·자산 수정에서 관리자가 수동 입력할 수 있습니다.
- 개당 평가금액만 DB에 저장하며 총액은 현재 수량을 곱해 계산·표시합니다. 평가금액은 선택이고 품목·입고단가 미등록 시 자동값은 NULL입니다. 미평가와 0원을 구분하며 품목 단가 변경은 기존 평가금액에 소급하지 않습니다.
- `20261006001000_unit_asset_appraisal` 마이그레이션은 기존 총액을 현재 수량으로 나눠 단가로 전환합니다(0수량은 NULL). 배포 전 백업과 전환 대상 확인이 필요합니다.

### 입고·검수·폐기

- 입고 신청은 선택 사진 최대 5장과 동의 내용을 DB에 저장합니다. 관리자 승인·반려는 사유와 상태·처리자·시각을 원자 저장하며 승인만으로 자산을 생성하지 않습니다.
- 실제 입고 등록 후 1차 검수 초안을 입력하거나 표준 XLSX를 가져옵니다. 최대 1000행·5MB이며 가져오기 오류 행을 제외하고 유효 행을 유지할 수 있습니다.
- 검수 확정은 재사용 자산·검수 사진·폐기 대상을 생성합니다. F등급 재사용 수량은 0이며 폐기 수량은 자산 수량에 포함되지 않습니다.
- 고객 확인·동의 또는 후속 업무 변경 전까지만 확정 결과 정정이 가능합니다. 재사용과 전량 폐기 간 정정 시 생성 자산 연결도 함께 반영하지만 행 추가·삭제·순서 변경은 제한됩니다.
- 고객 검수 결과 확인과 폐기 대상 동의는 별개입니다. 폐기 동의는 자재·수량에 대한 동의이며 비용 청구 동의가 아닙니다.
- 실제 폐기 실행·일정·증빙·비용 청구와 자동 완료는 제공하지 않습니다. 세부 계약은 [docs/RECEIVING_SCHEMA.md](docs/RECEIVING_SCHEMA.md)와 [docs/API_SPEC.md](docs/API_SPEC.md)를 참고하세요.

### 판매 요청과 마켓

- 활성 고객사 소속 VIEWER/MANAGER는 보관중·판매대기·양수 수량의 S/A/B 자산에 판매 요청을 접수할 수 있습니다. 품목·분류·평가금액 미등록은 접수를 막지 않습니다.
- 희망금액은 전체 수량 기준 1원~1조원 정수이며 상품 단가나 실제 정산액이 아닙니다. 조회한 수량과 현재 수량이 다르면 다시 확인해야 합니다.
- 요청은 `승인 대기`·`상세 검수 대기`로 저장됩니다. 고객 상세에 요청번호·희망금액·상태를 표시하고 관리자 판매 요청 및 상세 검수에서 같은 요청을 조회합니다.
- 자산별 중복 요청과 상품이 연결된 자산의 요청을 차단합니다. 접수 후 검수 정정 및 자산 수량·보관/판매 상태·F등급 변경을 제한합니다.
- 상세 검수에서 품목·카테고리·규격·브랜드·S/A/B 등급·평가금액 등록 및 현재 수량과의 일치 확인 후 완료 버튼으로 검수를 확정합니다. 완료 상태와 관리자 감사 이력은 DB에 저장하며 판매 요청 수량은 확인 완료로 표시합니다.
- 판매 승인/반려·취소·재요청 API와 승인 후 상품 생성·고객 마켓 자동 게시는 아직 구현되지 않았습니다. 상세 검수 완료만으로 상품 생성·판매 시작·재고 차감·정산을 실행하지 않습니다.
- 상품·기획전 DB 구조는 [docs/MARKET_SCHEMA.md](docs/MARKET_SCHEMA.md)에 정리되어 있습니다. 관리자 기획전과 데모 기획전은 자동 동기화되지 않습니다.

### 사진과 배너

- 관리자는 JPG·PNG·WebP를 각 5MB 이하로 업로드합니다. 서버가 파일 내용·크기·픽셀 수를 검증하고 최대 2400px의 메타데이터 없는 WebP로 변환해 S3에 저장합니다.
- 품목 대표 사진은 최대 1장, 자산 사진은 최대 8장입니다. 기존 자산·품목 사진 변경은 별도 저장 API로 변경 사유와 이력을 남깁니다.
- 업로드에는 서버 AWS 자격 증명과 S3 쓰기 권한이 필요합니다. 객체 URL은 공개 접근 가능하므로 개인정보·민감한 사진을 첨부하지 마세요.
- 콘텐츠 배너는 DB 기반 배치·순서·일정·노출 여부를 저장합니다. 데모 빌드는 API 배너 조회 대신 예시 배너를 사용합니다.

## 개발·검증 안내

Node.js 24, React 19, TypeScript, Vite, Hono, Prisma 7 및 MySQL 8.4를 사용합니다.
React Compiler는 활성화하지 않았습니다. 루트와 백엔드의 의존성 및 빌드 명령은 별도입니다.

```sh
npm run dev -- --config vite.customer.config.ts
npm run dev -- --config vite.admin.config.ts
npm run dev -- --config vite.customer.config.ts --mode demo
npm run build:demo
```

API 통합 화면은 접근 가능한 DB·JWT 설정으로 백엔드를 별도 실행해야 합니다.
개발 시 루트 환경변수를 사용한다면 연결 대상이 로컬인지 스테이징 외부 DB인지 먼저 확인하세요.
데모 모드는 인증 API 없이 예시 화면을 검증하는 용도이며 실제 업무 저장 검증을 대신하지 않습니다.
`dist/customer`, `dist/admin`은 Git에 포함하지 않는 빌드 산출물입니다.

격리 MySQL 통합 테스트는 Docker가 필요하며 전용 컨테이너와 테스트 데이터베이스를 생성·정리합니다.
아래 명령은 저장소 루트에서 실행합니다.

```sh
npm --prefix backend run db:generate
npm --prefix backend run typecheck
npm --prefix backend test
RUN_CUSTOMER_SCHEMA_TEST=1 backend/node_modules/.bin/tsx --test backend/test/customer-schema.test.ts
RUN_RECEIVING_SCHEMA_TEST=1 backend/node_modules/.bin/tsx --test backend/test/receiving-schema.test.ts
backend/node_modules/.bin/tsx --test test/inspection-file.test.ts
npm run build
npm run lint
git diff --check
```

## 주요 문서와 소스

| 문서·소스 | 역할 |
| --- | --- |
| [docs/API_SPEC.md](docs/API_SPEC.md) | API 구현 계약; 실행 문서는 `/api/docs`, OpenAPI는 `/api/openapi.json` |
| [docs/CUSTOMER_MANAGEMENT.md](docs/CUSTOMER_MANAGEMENT.md) | 고객사·회원 관리 및 운영 전환 절차 |
| [backend/prisma/schema](backend/prisma/schema) | 도메인별 DB 모델 |
| [backend/prisma/migrations](backend/prisma/migrations) | 버전별 마이그레이션; 배포된 SQL 수정 금지 |
| [src/PortalEntry.tsx](src/PortalEntry.tsx) | 실제 고객 포털과 데모 모드 진입 분리 |
| [src/CustomerWorkspace.tsx](src/CustomerWorkspace.tsx) | API 기반 고객 화면 |
| [src/App.tsx](src/App.tsx) | 공개 시연용 예시 자산·마켓·정산 화면 |
| [src/admin/AdminPortal.tsx](src/admin/AdminPortal.tsx) | 관리자 메뉴 및 API 데이터 조회 |
| [src/admin/adminViews.ts](src/admin/adminViews.ts) | 관리자 목록·상세 표시 및 연결 링크 |
| [src/MarketCampaigns.tsx](src/MarketCampaigns.tsx) | 데모 기획전 구성; 실제 관리자 데이터와 별개 |

데모의 내 자산 메뉴와 고객 포털 진입은 이전 자산 상세 선택을 초기화합니다.
데모 메모·판매 신청·견적·검수·정산·알림은 예시이며 새로고침 시 메모리 변경이 초기화됩니다.
실제 업무 데이터의 저장 여부는 위 구현 범위와 해당 API 응답을 기준으로 확인하세요.
