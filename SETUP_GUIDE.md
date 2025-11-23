# 프로젝트 설정 가이드

## 1. GitHub 리포지토리 생성 및 연결

### GitHub에서 새 리포지토리 생성

1. GitHub에 로그인
2. 새 리포지토리 생성 (예: `new-project`)
3. 리포지토리 이름과 설명 입력
4. Public 또는 Private 선택
5. **README, .gitignore, license는 추가하지 않음** (이미 생성됨)

### 로컬 리포지토리와 연결

```bash
cd /Users/mac/Desktop/new-project

# 원격 리포지토리 추가 (YOUR_USERNAME과 YOUR_REPO_NAME을 실제 값으로 변경)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 브랜치 이름을 main으로 설정 (필요시)
git branch -M main

# 코드 푸시
git push -u origin main
```

## 2. Cloudflare Pages 프로젝트 생성

### Cloudflare 대시보드에서 프로젝트 생성

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)에 로그인
2. **Workers & Pages** 메뉴 선택
3. **Create application** → **Pages** → **Connect to Git** 선택
4. GitHub 계정 연결 (처음인 경우)
5. 방금 생성한 리포지토리 선택
6. 프로젝트 설정:
   - **Project name**: `new-project` (또는 원하는 이름)
   - **Production branch**: `main`
   - **Framework preset**: None
   - **Build command**: (비워둠)
   - **Build output directory**: `public`
7. **Save and Deploy** 클릭

### 환경 변수 설정 (필요시)

1. Cloudflare Pages 프로젝트 대시보드에서 **Settings** → **Environment variables** 선택
2. 필요한 환경 변수 추가:
   - `JWT_SECRET` (필요시)
   - `ADMIN_EMAILS` (필요시)
   - 기타 필요한 변수

### D1 데이터베이스 설정 (필요시)

1. Cloudflare 대시보드에서 **Workers & Pages** → **D1** 선택
2. **Create database** 클릭
3. 데이터베이스 이름 입력 (예: `new-project-db`)
4. 생성 후 데이터베이스 ID 복사
5. `wrangler.toml` 파일에서 주석 해제하고 ID 입력:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "new-project-db"
   database_id = "여기에_데이터베이스_ID_입력"
   ```

## 3. 로컬 개발 환경 설정

### 의존성 설치

```bash
cd /Users/mac/Desktop/new-project
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

개발 서버가 `http://localhost:8788`에서 실행됩니다.

### 로컬 환경 변수 설정 (필요시)

`.dev.vars` 파일 생성 (이미 .gitignore에 포함됨):

```bash
# .dev.vars
JWT_SECRET=your-local-secret-key
ADMIN_EMAILS=admin@example.com
```

## 4. 배포

### 수동 배포

```bash
npm run deploy
```

### 자동 배포

GitHub에 푸시하면 Cloudflare Pages가 자동으로 배포합니다.

## 5. 커스텀 도메인 설정 (선택사항)

1. Cloudflare Pages 프로젝트 대시보드에서 **Custom domains** 선택
2. **Set up a custom domain** 클릭
3. 도메인 입력 및 DNS 설정 안내 따르기

## 문제 해결

### 배포 실패 시

- `wrangler.toml`의 프로젝트 이름 확인
- Cloudflare 대시보드에서 프로젝트 이름 확인
- 환경 변수 설정 확인

### 로컬 개발 서버 오류 시

- Node.js 버전 확인 (18 이상 권장)
- `npm install` 재실행
- `.dev.vars` 파일 확인

