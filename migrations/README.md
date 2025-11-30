# Database Migrations

## 마이그레이션 파일 순서

마이그레이션은 반드시 아래 순서대로 실행해야 합니다:

| 순서 | 파일명 | 설명 |
|------|--------|------|
| 1 | `001_schema.sql` | 기본 participants 테이블 생성 |
| 2 | `002_add_ssn_first.sql` | 주민번호 앞자리 컬럼 추가 |
| 3 | `003_add_guest2.sql` | 2번째 참가자 정보 컬럼 추가 |
| 4 | `004_add_seat2.sql` | 2인 신청용 두 번째 좌석 컬럼 추가 |
| 5 | `005_add_ticket_count.sql` | 티켓 수 컬럼 추가 |
| 6 | `006_add_inquiries.sql` | 문의 테이블 생성 |
| 7 | `007_add_checkin.sql` | 입장 확인 컬럼 추가 |

## 실행 방법

### Cloudflare D1에서 마이그레이션 실행

```bash
# 순서대로 실행
wrangler d1 execute hancut-concert-db --file=./migrations/001_schema.sql
wrangler d1 execute hancut-concert-db --file=./migrations/002_add_ssn_first.sql
wrangler d1 execute hancut-concert-db --file=./migrations/003_add_guest2.sql
wrangler d1 execute hancut-concert-db --file=./migrations/004_add_seat2.sql
wrangler d1 execute hancut-concert-db --file=./migrations/005_add_ticket_count.sql
wrangler d1 execute hancut-concert-db --file=./migrations/006_add_inquiries.sql
wrangler d1 execute hancut-concert-db --file=./migrations/007_add_checkin.sql
```

### 전체 마이그레이션 한 번에 실행

```bash
for f in ./migrations/*.sql; do
  echo "Running $f..."
  wrangler d1 execute hancut-concert-db --file="$f"
done
```

## 최종 스키마

### participants 테이블

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | INTEGER | Primary Key |
| created_at | TEXT | 생성 시간 |
| user_name | TEXT | 참가자 이름 |
| phone | TEXT | 전화번호 (UNIQUE) |
| is_paid | INTEGER | 입금 여부 (0/1) |
| ssn_first | TEXT | 주민번호 앞자리 (YYMMDD) |
| ticket_count | INTEGER | 티켓 수 (1 또는 2) |
| guest2_name | TEXT | 2번째 참가자 이름 |
| guest2_phone | TEXT | 2번째 참가자 전화번호 |
| guest2_ssn_first | TEXT | 2번째 참가자 주민번호 앞자리 |
| is_guest2_completed | INTEGER | 2번째 참가자 정보 완료 여부 |
| seat_group | TEXT | 좌석 그룹 (가~하) |
| seat_row | TEXT | 좌석 열 |
| seat_number | TEXT | 좌석 번호 |
| seat_full | TEXT | 전체 좌석 (가-2-5 형태) |
| seat_group_2 | TEXT | 2번째 좌석 그룹 |
| seat_row_2 | TEXT | 2번째 좌석 열 |
| seat_number_2 | TEXT | 2번째 좌석 번호 |
| seat_full_2 | TEXT | 2번째 전체 좌석 |
| is_checked_in | INTEGER | 입장 확인 여부 (0/1) |

### inquiries 테이블

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | INTEGER | Primary Key |
| created_at | TEXT | 생성 시간 |
| user_name | TEXT | 문의자 이름 |
| phone | TEXT | 전화번호 |
| content | TEXT | 문의 내용 |
| answer | TEXT | 답변 내용 |
| answered_at | TEXT | 답변 시간 |
| is_answered | INTEGER | 답변 여부 (0/1) |
