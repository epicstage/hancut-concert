# 새 프로젝트

새로운 프로젝트입니다.

## 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

### 배포

```bash
npm run deploy
```

## 프로젝트 구조

```
.
├── functions/          # Cloudflare Pages Functions
│   └── _middleware.ts  # 미들웨어
├── public/             # 정적 파일
│   └── index.html      # 메인 페이지
├── package.json
├── wrangler.toml       # Cloudflare 설정
└── tsconfig.json       # TypeScript 설정
```

## 환경 변수 설정

Cloudflare Pages 대시보드에서 환경 변수를 설정하거나, 로컬 개발 시 `.dev.vars` 파일을 사용하세요.

```bash
# .dev.vars 예시
# JWT_SECRET=your-secret-key
# ADMIN_EMAILS=admin@example.com
```

## 데이터베이스

D1 데이터베이스를 사용하는 경우:

1. Cloudflare 대시보드에서 D1 데이터베이스 생성
2. `wrangler.toml`에 데이터베이스 ID 추가
3. 마이그레이션 실행 (필요시)

