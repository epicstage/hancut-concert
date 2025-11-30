# Cloudflare Pages 빌드 오류 해결

## 문제
배포 시 `hono`와 `jose` 패키지를 찾을 수 없다는 오류 발생

## 원인
Cloudflare Pages에서 Functions를 빌드할 때 `node_modules`가 설치되지 않음

## 해결 방법

### 1. Cloudflare Dashboard에서 빌드 설정 수정

1. **Dashboard 접속**
   - https://dash.cloudflare.com/302d0c397fc8af9f8ec5744c45329f5c/pages/view/hancut-concert-github

2. **Settings 탭 클릭**

3. **Builds & deployments** 섹션 찾기

4. **Build configuration** 수정:
   - **Build command**: `npm install`
   - **Build output directory**: `public`
   - **Root directory**: `/` (기본값)

5. **Save** 클릭

6. **Retry deployment** 또는 새 커밋 푸시

### 2. 또는 Dashboard에서 직접 설정

**Settings** → **Builds & deployments**:
- **Build command**: `npm install`
- **Build output directory**: `public`
- **Environment variables**: (필요시 추가)

## 확인 사항

✅ `package.json`이 리포지토리에 포함되어 있음  
✅ `package-lock.json`이 리포지토리에 포함되어 있음  
✅ `wrangler.toml`에 빌드 명령 추가됨

## 다음 배포

위 설정을 저장한 후:
- 자동으로 재배포되거나
- GitHub에 새 커밋을 푸시하면 자동 배포됩니다

