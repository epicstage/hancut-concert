# Cloudflare Pages GitHub 연동 설정 가이드

## 현재 상태

✅ GitHub 리포지토리: https://github.com/epicstage/hancut-concert  
✅ Cloudflare Pages 프로젝트: `hancut-concert-github` 생성됨  
⚠️ GitHub 연동: 아직 완료되지 않음

## 자동 배포 설정 방법

### 방법 1: Cloudflare Dashboard에서 직접 연결 (권장)

1. **Cloudflare Dashboard 접속**
   - https://dash.cloudflare.com/ 접속
   - **Workers & Pages** → **Pages** 클릭

2. **프로젝트 선택**
   - `hancut-concert-github` 프로젝트 클릭
   - 또는 새로 만들기: **Create application** → **Pages** → **Connect to Git**

3. **GitHub 연결**
   - **Connect to Git** 버튼 클릭
   - GitHub 계정 인증
   - 리포지토리 선택: `epicstage/hancut-concert`
   - 브랜치: `main` 선택

4. **빌드 설정**
   - **Build command**: (비워두기 - 정적 파일만 배포)
   - **Build output directory**: `public`
   - **Root directory**: `/` (기본값)

5. **환경 변수 설정** (필요시)
   - **Settings** → **Environment variables**
   - D1 데이터베이스는 `wrangler.toml`에서 자동 연결됨

6. **저장 및 배포**
   - **Save and Deploy** 클릭
   - 첫 배포가 자동으로 시작됩니다

### 방법 2: GitHub Actions 사용 (현재 설정됨)

GitHub Actions를 사용하려면 다음 환경 변수를 GitHub Secrets에 추가해야 합니다:

1. **GitHub 리포지토리 설정**
   - https://github.com/epicstage/hancut-concert/settings/secrets/actions 접속
   - **New repository secret** 클릭

2. **필요한 Secrets 추가**
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API 토큰
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID

3. **API 토큰 생성 방법**
   - Cloudflare Dashboard → **My Profile** → **API Tokens**
   - **Create Token** → **Edit Cloudflare Workers** 템플릿 사용
   - 또는 **Custom token** 생성:
     - Permissions: `Account.Cloudflare Pages:Edit`
     - Account Resources: `Include All accounts`

4. **Account ID 확인**
   - Cloudflare Dashboard 우측 사이드바에서 확인 가능

## 배포 방식 비교

### 방법 1: Cloudflare Dashboard 연결 (권장)
- ✅ 간단하고 빠름
- ✅ Cloudflare에서 직접 관리
- ✅ 자동 빌드 및 배포
- ✅ Preview 배포 자동 생성

### 방법 2: GitHub Actions
- ✅ 더 세밀한 제어 가능
- ✅ 커스텀 빌드 프로세스 가능
- ⚠️ 환경 변수 설정 필요
- ⚠️ 추가 설정 필요

## 자동 배포 동작

연결이 완료되면:
- ✅ `main` 브랜치에 푸시할 때마다 자동 배포
- ✅ Pull Request 생성 시 Preview 배포
- ✅ 배포 상태가 GitHub에 표시됨

## 수동 배포 (현재 방식)

현재는 수동 배포를 사용 중입니다:
```bash
npm run deploy
```

GitHub 연동 후에는 자동으로 배포되므로 수동 배포가 필요 없습니다.

## 배포 URL

연결 완료 후:
- **Production**: https://hancut-concert-github.pages.dev
- **Preview**: 각 PR마다 자동 생성

## 문제 해결

### GitHub 연결이 안 될 때
1. Cloudflare Dashboard에서 GitHub 권한 확인
2. 리포지토리가 Private인 경우 권한 확인
3. Cloudflare 계정과 GitHub 계정이 연결되어 있는지 확인

### 배포가 실패할 때
1. Cloudflare Dashboard → Pages → Deployments에서 로그 확인
2. 빌드 설정 확인 (Build command, Output directory)
3. 환경 변수 확인

