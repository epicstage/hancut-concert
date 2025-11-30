# Cloudflare Pages GitHub 연결 - 정확한 단계

## ⚠️ 중요: CLI로 만든 프로젝트는 Git 연동 불가

CLI로 생성한 프로젝트(`hancut-concert-github`)는 Git integration이 없습니다.
**반드시 Dashboard에서 "Connect to Git"으로 새로 만들어야 합니다.**

## ✅ 올바른 연결 방법

### 1단계: Cloudflare Dashboard 접속
👉 **https://dash.cloudflare.com/302d0c397fc8af9f8ec5744c45329f5c/pages**

### 2단계: 새 프로젝트 생성 (GitHub와 함께)
1. **Create application** 버튼 클릭
2. **Pages** 선택
3. **Connect to Git** 버튼 클릭 ⭐ (이게 핵심!)

### 3단계: GitHub 인증
1. **GitHub** 선택
2. GitHub 계정 인증 (처음이면 권한 승인)
3. 리포지토리 선택: **epicstage/hancut-concert**
4. **Begin setup** 클릭

### 4단계: 프로젝트 설정
- **Project name**: `hancut-concert-github`
- **Production branch**: `main`
- **Framework preset**: **None** 또는 **Other**
- **Build command**: (비워두기 - 빈 값)
- **Build output directory**: `public` ⭐
- **Root directory**: `/` (기본값)

### 5단계: 환경 변수 설정
- D1 데이터베이스는 `wrangler.toml`에서 자동 연결됨
- 추가 환경 변수가 필요하면 여기서 설정

### 6단계: 배포 시작
- **Save and Deploy** 버튼 클릭
- 첫 배포가 자동으로 시작됩니다! 🎉

## ✅ 확인 방법

연결이 성공하면:
- Dashboard에서 프로젝트 목록의 **Git Provider** 컬럼에 **"Yes"** 표시
- **Settings** 탭에 **Git integration** 섹션 표시
- GitHub에 푸시하면 자동 배포 시작

## 🔗 배포 URL

연결 완료 후:
- **Production**: https://hancut-concert-github.pages.dev
- **Preview**: 각 PR마다 자동 생성

## 📝 참고사항

- ❌ CLI로 만든 프로젝트는 Git 연동 불가
- ✅ Dashboard에서 "Connect to Git"으로 만든 프로젝트만 Git 연동 가능
- ✅ 기존 프로젝트(`hancut-concert`)는 수동 배포용으로 유지 가능

## 🆘 문제 해결

### "Connect to Git" 버튼이 안 보일 때
- 새 프로젝트를 만들 때만 보입니다
- 기존 프로젝트에는 Git integration 추가 불가

### GitHub 리포지토리가 안 보일 때
- GitHub 계정 권한 확인
- 리포지토리가 Private인 경우 Cloudflare에 권한 부여 확인

### 빌드가 실패할 때
- Build output directory가 `public`인지 확인
- Build command는 비워두기 (정적 파일만 배포)

