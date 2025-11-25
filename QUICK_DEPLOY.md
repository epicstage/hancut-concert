# 빠른 배포 가이드

## 방법 1: Cloudflare Dashboard에서 배포 (가장 간단)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) 로그인
2. **Workers & Pages** → **Pages** 선택
3. **Create application** → **Upload assets** 클릭
4. 프로젝트 이름: `hancut-concert` 입력
5. `public` 폴더를 ZIP으로 압축하여 업로드
6. **Deploy site** 클릭

## 방법 2: 명령어로 배포

### 1단계: D1 데이터베이스 생성

```bash
cd /Users/mac/Desktop/new-project
npx wrangler d1 create hancut-concert-db
```

출력에서 `database_id`를 복사합니다.

### 2단계: wrangler.toml 업데이트

`wrangler.toml` 파일을 열어 `database_id`를 입력:

```toml
[[d1_databases]]
binding = "DB"
database_name = "hancut-concert-db"
database_id = "여기에_복사한_database_id_입력"
```

### 3단계: 데이터베이스 마이그레이션

```bash
npx wrangler d1 execute hancut-concert-db --file=./migrations/schema.sql
```

### 4단계: 배포

```bash
npx wrangler pages deploy public --project-name hancut-concert
```

## 배포 후 링크

배포가 완료되면 다음 링크로 접속할 수 있습니다:

### 참가자용 링크
- **메인 페이지**: `https://hancut-concert.pages.dev`
- **신청 페이지**: `https://hancut-concert.pages.dev/apply.html`
- **신청내역 확인**: `https://hancut-concert.pages.dev/check.html`
- **좌석 확인**: `https://hancut-concert.pages.dev/seat.html`

### 관리자 링크
- **관리자 페이지**: `https://hancut-concert.pages.dev/admin.html`
- 기본 비밀번호: `admin123`

> **참고**: 실제 배포 후 생성되는 링크는 Cloudflare Pages 대시보드에서 확인할 수 있습니다.
> 프로젝트 이름이 다르면 링크도 달라질 수 있습니다.

