# Cloudflare Pages GitHub 빠른 연결 가이드

## 🚀 빠른 연결 (3분 안에 완료)

### 1단계: Cloudflare Dashboard 접속
👉 https://dash.cloudflare.com/ 접속

### 2단계: Pages 섹션으로 이동
- 좌측 메뉴에서 **Workers & Pages** 클릭
- **Pages** 탭 클릭

### 3단계: 프로젝트 선택 또는 생성

#### 옵션 A: 기존 프로젝트에 연결
1. **hancut-concert-github** 프로젝트 클릭
2. **Settings** 탭 클릭
3. **Git integration** 섹션 찾기
4. **Connect to Git** 버튼 클릭

#### 옵션 B: 새 프로젝트로 연결 (권장)
1. **Create application** 버튼 클릭
2. **Pages** 선택
3. **Connect to Git** 버튼 클릭

### 4단계: GitHub 인증 및 리포지토리 선택
1. **GitHub** 선택
2. GitHub 계정 인증 (처음이면 권한 승인)
3. 리포지토리 선택: **epicstage/hancut-concert**
4. **Begin setup** 클릭

### 5단계: 프로젝트 설정
- **Project name**: `hancut-concert-github`
- **Production branch**: `main`
- **Framework preset**: None (또는 Other)
- **Build command**: (비워두기)
- **Build output directory**: `public`
- **Root directory**: `/` (기본값)

### 6단계: 환경 변수 (선택사항)
- D1 데이터베이스는 `wrangler.toml`에서 자동 연결됨
- 추가 환경 변수가 필요하면 여기서 설정

### 7단계: 배포 시작
- **Save and Deploy** 버튼 클릭
- 첫 배포가 자동으로 시작됩니다! 🎉

## ✅ 연결 완료 후

연결이 완료되면:
- ✅ GitHub에 푸시할 때마다 자동 배포
- ✅ Pull Request마다 Preview 배포 생성
- ✅ 배포 상태가 GitHub에 표시됨

## 🔗 배포 URL

연결 완료 후:
- **Production**: https://hancut-concert-github.pages.dev
- **Preview**: 각 PR마다 자동 생성되는 URL

## 📝 참고사항

- 첫 배포는 약 2-3분 소요됩니다
- 이후 배포는 약 1-2분 소요됩니다
- 배포 상태는 Cloudflare Dashboard와 GitHub에서 확인 가능합니다

## 🆘 문제 해결

### GitHub 연결이 안 될 때
1. GitHub 계정 권한 확인
2. 리포지토리가 Private인 경우 Cloudflare에 권한 부여 확인
3. 브라우저 캐시 삭제 후 재시도

### 배포가 실패할 때
1. Cloudflare Dashboard → Pages → Deployments에서 로그 확인
2. 빌드 설정 확인 (Build output directory가 `public`인지 확인)
3. GitHub 리포지토리에 `public` 폴더가 있는지 확인

