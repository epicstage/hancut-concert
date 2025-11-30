# Cloudflare Pages GitHub API 연결 시도

CLI로는 GitHub 연결이 직접 지원되지 않으므로, Cloudflare Dashboard에서 직접 연결하는 것이 가장 확실한 방법입니다.

## 📋 빠른 연결 단계

### 1. Cloudflare Dashboard 접속
👉 **https://dash.cloudflare.com/302d0c397fc8af9f8ec5744c45329f5c/pages/view/hancut-concert-github**

### 2. GitHub 연결
1. **Settings** 탭 클릭
2. **Git integration** 섹션 찾기
3. **Connect to Git** 버튼 클릭
4. GitHub 인증
5. 리포지토리 선택: **epicstage/hancut-concert**
6. 브랜치: **main**
7. **Save** 클릭

### 3. 빌드 설정 확인
- Build output directory: `public`
- Build command: (비워두기)

### 4. 첫 배포
- **Save and Deploy** 클릭
- 자동 배포 시작!

## 🔄 또는 새 프로젝트로 시작

기존 프로젝트에 연결이 안 되면:

1. **Create application** → **Pages** → **Connect to Git**
2. GitHub 인증
3. 리포지토리: **epicstage/hancut-concert**
4. 프로젝트 이름: **hancut-concert-github**
5. Production branch: **main**
6. Build output directory: **public**
7. **Save and Deploy**

## ✅ 연결 완료 후

- GitHub에 푸시하면 자동 배포
- PR마다 Preview 배포 생성
- 배포 URL: https://hancut-concert-github.pages.dev

