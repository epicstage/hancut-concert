#!/bin/bash

# Cloudflare Pages GitHub 연결 스크립트
# 이 스크립트는 Cloudflare API를 사용하여 GitHub 리포지토리를 연결합니다.

echo "Cloudflare Pages GitHub 연결을 시작합니다..."
echo ""

# Cloudflare Account ID 확인
ACCOUNT_ID=$(npx wrangler whoami 2>&1 | grep -i "account" | head -1 || echo "")
echo "Account ID 확인 중..."

# GitHub 리포지토리 정보
GITHUB_OWNER="epicstage"
GITHUB_REPO="hancut-concert"
PROJECT_NAME="hancut-concert-github"
BRANCH="main"

echo "리포지토리: $GITHUB_OWNER/$GITHUB_REPO"
echo "프로젝트: $PROJECT_NAME"
echo "브랜치: $BRANCH"
echo ""

echo "⚠️  Cloudflare CLI로는 GitHub 연결이 직접 지원되지 않습니다."
echo ""
echo "다음 방법 중 하나를 선택하세요:"
echo ""
echo "방법 1: Cloudflare Dashboard에서 직접 연결 (권장)"
echo "1. https://dash.cloudflare.com/ 접속"
echo "2. Workers & Pages → Pages 클릭"
echo "3. 'hancut-concert-github' 프로젝트 클릭"
echo "4. Settings → Git integration → Connect to Git 클릭"
echo "5. GitHub 인증 후 'epicstage/hancut-concert' 선택"
echo ""
echo "방법 2: 새 프로젝트로 GitHub 연결"
echo "1. https://dash.cloudflare.com/ 접속"
echo "2. Workers & Pages → Pages → Create application 클릭"
echo "3. Connect to Git 선택"
echo "4. GitHub 인증 후 'epicstage/hancut-concert' 선택"
echo "5. 프로젝트 이름: hancut-concert-github"
echo "6. Production branch: main"
echo "7. Build output directory: public"
echo "8. Save and Deploy 클릭"
echo ""

