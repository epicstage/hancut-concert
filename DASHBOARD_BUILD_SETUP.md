# Cloudflare Pages Dashboard 빌드 설정

## ⚠️ 중요

`wrangler.toml`에서는 `build` 섹션을 지원하지 않습니다.
**반드시 Dashboard에서 빌드 명령을 설정해야 합니다.**

## 설정 방법

### 1. Dashboard 접속
👉 https://dash.cloudflare.com/302d0c397fc8af9f8ec5744c45329f5c/pages/view/hancut-concert-github

### 2. Settings 탭 클릭

### 3. Builds & deployments 섹션

**Build configuration** 수정:

- **Build command**: `npm install`
- **Build output directory**: `public`
- **Root directory**: `/` (기본값)

### 4. Environment variables (선택사항)

필요한 환경 변수가 있으면 여기서 추가:
- D1 데이터베이스는 `wrangler.toml`에서 자동 연결됨
- KV 네임스페이스도 `wrangler.toml`에서 자동 연결됨

### 5. Save 클릭

### 6. 배포 재시도

- **Deployments** 탭에서 실패한 배포의 **Retry** 버튼 클릭
- 또는 새 커밋을 푸시하면 자동으로 재배포됩니다

## 빌드 프로세스

1. GitHub에서 리포지토리 클론
2. `npm install` 실행 (의존성 설치)
3. `public` 폴더를 배포
4. `functions` 폴더의 Functions 빌드 (의존성 필요)

## 확인

설정 후 배포 로그에서 다음을 확인:
- ✅ `npm install` 실행됨
- ✅ `node_modules` 설치됨
- ✅ Functions 빌드 성공

