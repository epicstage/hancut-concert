# 한동훈과 한 컷 토크콘서트 신청 시스템

2025년 12월 14일 킨텍스에서 개최되는 "한동훈과 한 컷 토크콘서트" 참가 신청 시스템입니다.

## 🎨 디자인 특징

- **글래스모피즘 디자인**: 반투명 배경과 블러 효과로 고급스러운 UI
- **둥근 이미지**: 모든 요소에 둥근 모서리와 부드러운 그림자 적용
- **Primary Color**: Vibrant Red (Tailwind `red-600`)
- **Secondary Color**: Soft Sky Blue (Tailwind `sky-100` / `sky-700`)
- **Target**: 중장년층 (큰 글씨, 넓은 클릭 영역, 단순한 동작)

## 🛠 기술 스택

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Cloudflare Pages Functions (Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages

## 📋 기능

### 참가자용
- ✅ 참가 신청 (이름, 전화번호, 개인정보 활용동의)
- ✅ 신청 내역 조회 (전화번호로 로그인)
- ✅ 이름 수정
- ✅ 입금 상태 확인
- ✅ 좌석 번호 확인 (행사 당일, 가~하 14개 구역)

### 관리자용
- ✅ 참가자 목록 조회
- ✅ 검색 기능 (이름/전화번호)
- ✅ 입금 확인 토글
- ✅ 좌석 구역 배정 (가~하 14개 구역)
- ✅ 좌석 번호 입력/수정
- ✅ 참가자 삭제

## 🚀 배포 방법

자세한 배포 가이드는 `DEPLOY.md` 파일을 참고하세요.

### 빠른 배포

1. **D1 데이터베이스 생성**
   ```bash
   npx wrangler d1 create hancut-concert-db
   ```
   생성된 데이터베이스 ID를 `wrangler.toml`에 입력

2. **데이터베이스 마이그레이션**
   ```bash
   npx wrangler d1 execute hancut-concert-db --file=./migrations/schema.sql
   ```

3. **배포**
   ```bash
   npx wrangler pages deploy public --project-name hancut-concert
   ```

### Cloudflare Dashboard에서 배포

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Pages**
2. **Create application** → **Upload assets**
3. `public` 폴더를 ZIP으로 압축하여 업로드
4. 프로젝트 이름: `hancut-concert`

## 🔗 배포 후 링크

배포가 완료되면 다음 링크로 접속할 수 있습니다:

### 참가자용 링크
- **메인 페이지**: `https://hancut-concert.pages.dev`
- **신청 페이지**: `https://hancut-concert.pages.dev/apply.html`
- **신청내역 확인**: `https://hancut-concert.pages.dev/check.html`
- **좌석 확인**: `https://hancut-concert.pages.dev/seat.html`

### 관리자 링크
- **관리자 페이지**: `https://hancut-concert.pages.dev/admin.html`
- 기본 비밀번호: `admin123` (환경 변수에서 변경 가능)

> **참고**: 실제 배포 후 생성되는 링크는 Cloudflare Pages 대시보드에서 확인할 수 있습니다.
> 프로젝트 이름이 다르면 링크도 달라질 수 있습니다.

## 📁 프로젝트 구조

```
.
├── public/              # 정적 파일
│   ├── index.html      # 메인 페이지
│   ├── apply.html      # 신청 페이지
│   ├── check.html      # 조회 페이지
│   ├── seat.html       # 좌석 확인 페이지
│   ├── admin.html      # 관리자 페이지
│   └── styles.css      # 스타일시트
├── functions/          # Cloudflare Pages Functions
│   └── _middleware.ts  # API 엔드포인트
├── migrations/         # 데이터베이스 마이그레이션
│   └── schema.sql      # D1 스키마
├── wrangler.toml       # Cloudflare 설정
└── DEPLOY.md          # 배포 가이드
```

## 📝 데이터베이스 스키마

### participants 테이블

| 필드 | 타입 | 설명 |
|------|------|------|
| id | INTEGER | 고유 ID (PK, AUTOINCREMENT) |
| created_at | TEXT | 신청 일시 |
| user_name | TEXT | 참가자 이름 |
| phone | TEXT | 전화번호 (11자리, UNIQUE) |
| is_paid | INTEGER | 입금 확인 여부 (0/1) |
| seat_zone | TEXT | 좌석 구역 (가~하) |
| seat_number | TEXT | 구역 내 좌석 번호 |

## 🔐 보안

- 관리자 페이지는 비밀번호로 보호됩니다
- 전화번호는 UNIQUE 제약으로 중복 신청 방지
- API는 CORS 정책으로 보호됩니다

## 📄 라이선스

이 프로젝트는 개인/상업적 용도로 자유롭게 사용 가능합니다.
