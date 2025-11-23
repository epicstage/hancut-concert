# 배포 가이드

## 1. Cloudflare D1 데이터베이스 생성

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)에 로그인
2. **Workers & Pages** → **D1** 선택
3. **Create database** 클릭
4. 데이터베이스 이름: `hancut-concert-db`
5. 생성 후 데이터베이스 ID 복사

## 2. wrangler.toml 설정

`wrangler.toml` 파일을 열어 데이터베이스 ID 입력:

```toml
[[d1_databases]]
binding = "DB"
database_name = "hancut-concert-db"
database_id = "여기에_데이터베이스_ID_입력"
```

## 3. 데이터베이스 마이그레이션

```bash
# D1 데이터베이스에 스키마 적용
npx wrangler d1 execute hancut-concert-db --file=./migrations/schema.sql
```

또는 Cloudflare Dashboard에서:
1. D1 데이터베이스 선택
2. **Console** 탭 클릭
3. `migrations/schema.sql` 파일 내용 복사하여 실행

## 4. Cloudflare Pages 프로젝트 생성

1. **Workers & Pages** → **Pages** 선택
2. **Create application** → **Pages** → **Upload assets** 선택
3. 프로젝트 이름: `hancut-concert`
4. **public** 폴더 업로드

또는 Git 연동:
1. GitHub에 리포지토리 푸시
2. **Create application** → **Pages** → **Connect to Git**
3. 리포지토리 선택
4. 빌드 설정:
   - **Framework preset**: None
   - **Build command**: (비워둠)
   - **Build output directory**: `public`
   - **Root directory**: `/`

## 5. Functions 설정

Cloudflare Pages는 자동으로 `functions` 폴더를 인식합니다.
`functions/_middleware.ts`가 API 엔드포인트를 처리합니다.

## 6. 환경 변수 설정 (선택사항)

Pages 프로젝트 → **Settings** → **Environment variables**:
- `ADMIN_PASSWORD`: 관리자 비밀번호 (기본값: admin123)

## 7. 배포 확인

배포 완료 후:
- 참가자용 링크: `https://hancut-concert.pages.dev`
- 관리자 링크: `https://hancut-concert.pages.dev/admin.html`

## 8. 커스텀 도메인 설정 (선택사항)

1. Pages 프로젝트 → **Custom domains**
2. **Set up a custom domain** 클릭
3. 도메인 입력 및 DNS 설정

