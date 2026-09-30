# 고객사·회원·자산 조회

## 현재 구현

- 고객사 마스터, 신규 등록 신청, 회원별 조회자/관리자, 변경 감사 이력은 DB에 저장한다.
- `Customer.status`: PENDING(이관 확인 필요), ACTIVE, SUSPENDED. 사업자번호 없는 PENDING은 검색·로그인에 사용할 수 없다.
- 사업자번호는 하이픈 제거 10자리, 체크섬 검사, 고객사 마스터 UNIQUE. 신청은 번호를 선점하지 않으며 같은 번호의 기존 고객사에 연결할 때 MRS의 명시적 선택이 필요하다.
- 기존 회사 가입: `customerType: "existing", customerId`. 신규: `customerType: "new", customer: {name,businessNumber,representativeName,address,phone}`. 공통 필드는 email/password/managerName/managerPhone. 이외 권한·상태 필드는 거부한다.
- 모든 가입은 PENDING. 고객사 신청 승인 후에도 회원은 PENDING이며 MRS의 별도 소속 승인이 필요하다.
- 고객사 역할은 VIEWER/MANAGER. 플랫폼 ADMIN 권한과 무관하다. 이번 릴리스에서는 두 고객 역할 모두 실제 자산 읽기만 제공한다.
- 회사/회원 정지·회원 소속/역할 변경 시 버전을 증가시키고 매 요청 DB 상태와 서명 토큰 버전을 비교한다. 정지 복구 후에도 재로그인해야 한다.

## API

| Method | Path | 계약 |
| --- | --- | --- |
| POST | /api/customers/lookup | 사업자번호 정확 일치, ACTIVE의 id/name만 반환 |
| POST | /api/auth/register | 기존 소속 또는 신규 회사 동시 신청 |
| GET/POST | /api/admin/customers | 목록/확인된 고객사 생성 |
| GET/PATCH | /api/admin/customers/:id | 상세(회원·자산 수·최근 100개 감사)/기본정보 수정 |
| POST | /api/admin/customers/:id/suspend | 전원 접근 정지 |
| POST | /api/admin/customers/:id/reactivate | 이관 고객사 확인 또는 복구 |
| GET | /api/admin/customer-applications | 신청 및 신청인 연락처 |
| POST | /api/admin/customer-applications/:id/review | action approve/reject/reopen, reason/version, 선택 customerId/fields |
| POST | /api/admin/members/:id/actions | action approve/reject/suspend/reactivate/role/reassign/reopen, reason/version/customerRole, reassign은 customerId 필수 |
| GET | /api/assets | 자사 페이지 목록, page/size(20/최대100), 기존 검색·정렬 |
| GET | /api/assets/summary | 출고완료 제외 전사 집계, Decimal 금액·수량 문자열 |
| GET | /api/assets/:id | 타사/미존재 모두 404, 공개 허용 필드와 보호된 저장 사진 |

관리 API는 MRS ADMIN만 접근 가능하다. 수정/심사/상태변경은 현재 version과 사유를 요구하고 충돌은 409다. 회원 version은 응답의 sessionVersion이다. reassign은 기존 세션을 폐기하고 PENDING/VIEWER로 바꾼다. 자산은 이동하지 않는다. 반려 회사 신청은 신청인을 PENDING 상태로 유지하고 수정 후 reopen 가능하다. 회원이 별도로 반려된 경우 회원부터 reopen한다.

공개 검색·가입은 소켓 주소당 10분 120회, 검색 번호당 20회의 DB 공유 제한을 적용한다. 임의 X-Forwarded-For는 신뢰하지 않는다. 프록시 뒤에서는 동일 프록시 주소의 합산 제한이 적용되므로 실제 규모에 맞춘 신뢰 프록시 IP 전달/개별 제한 설정은 배포 전 점검 사항이다. 응답은 no-store이며 확인 결과 자체가 등록 여부를 일부 드러내는 잔여 위험은 존재한다.

이미지는 4.2MB 이하 PNG/JPEG/WebP base64 data URL만 인증 응답에 포함한다. 외부 저장소 URL을 임의 프록시하지 않는다. 기존 외부 이미지 URL을 보호된 저장소로 이관하기 전에는 해당 사진이 고객 화면에서 보이지 않는다. 입고/검수 연결의 고객사 불일치는 고객 조회를 503으로 차단한다. legacy 입고 문자열은 실제 FK라고 간주하지 않는다.

## 이관 및 배포 게이트

1. 백업을 확보하고 실제 migration 상태를 확인한다. `npm run customers:check`는 루트 환경 파일의 DB에 읽기 전용 보고서를 출력한다. 자동으로 실행하거나 운영 DB를 변경하지 않는다.
	현재 로컬에는 SQL 파일이 없는 기존 마이그레이션 디렉터리가 있어 `prisma migrate deploy`가 P3015로 중단된다. 기존 이력과 대조해 누락 파일을 복구하거나 불필요한 로컬 디렉터리임을 확인한 뒤 정리해야 한다. 운영 이력을 임의로 삭제하거나 성공 처리하지 않는다. 격리 스키마 테스트는 SQL 파일이 있는 항목만 적용하므로 배포 명령 검증을 대체하지 않는다.
2. 기존 고객사 코드별 실제 사업자·법인 매핑을 MRS가 확인한다. 회사명 또는 샘플 데이터로 자동 통합하지 않는다.
3. `20260930000000_add_customers`는 User/Asset/Receiving 코드 합집합을 동일 ID의 PENDING 고객사로 보존한 뒤 외래키를 연결한다. 기존 CUSTOMER/ACTIVE 회원은 PENDING으로 전환하고 개별 SUSPENDED/REJECTED는 유지한다. 자산 코드·수량·평가액은 수정하지 않는다.
4. 이관 대기 고객사에 정확한 사업자정보를 입력하고 사유를 남겨 활성화한다. 각 회원의 실제 소속을 확인해 별도 승인하고 재로그인한다. 고객사를 활성화하는 것만으로 회원이 활성화되지 않는다.
5. 이관 전후 고객사별 자산 건수·평가금액·단위별 수량을 비교한다. 입고·검수·자산 귀속 불일치와 활성 미연결 회원이 없음을 확인한다. 중복 실제 사업자의 코드 통합은 별도 검증된 데이터 이관으로 처리한다.
6. 신규 앱은 신규 스키마가 필요하다. 유지보수 시간에 DB→백엔드→관리자→고객 순서로 전환하고 기존 토큰은 재로그인한다. 실패 시 접근을 차단하고 백업/호환 앱 복구 계획에 따라 처리한다. 자동 파괴적 down migration은 하지 않는다.

현재 작업은 외부/운영 DB에 적용되지 않았다. 배포 대상은 별도 승인 시 스테이징 고객·관리자·백엔드이며 GitHub Pages는 제외한다.

## 검증

- backend: `npm run db:validate`, `npm run db:generate`, `npm run typecheck`, `npm test`, `npm run build`.
- 격리 MySQL: `RUN_CUSTOMER_SCHEMA_TEST=1 npx tsx --test test/customer-schema.test.ts`. 외부 DB 환경값을 사용하지 않고 임시 컨테이너/볼륨을 정리한다.
- 입고 회귀: `RUN_RECEIVING_SCHEMA_TEST=1 npx tsx --test test/receiving-schema.test.ts`.
- frontend: `npm run build`, `npm run lint`.
- 개발 프록시: `MRS_API_PROXY=http://127.0.0.1:3011 npm run dev -- --port 5185`.

## 후속 범위

입고·검수·판매·폐기·출고·정산·견적 저장 API, 실제 입고일/과금 기산일, 공개 마켓 API, 직원 셀프 승인, 다중 고객사 소속, 판매 후 소유권 이전은 포함하지 않는다. 기존 데모 업무 컴포넌트는 보존하지만 실제 고객 진입점은 CustomerWorkspace이며 샘플 업무 내역을 표시하지 않는다. 관리자 다른 업무 화면의 임시 편집은 별도 개발 범위다.