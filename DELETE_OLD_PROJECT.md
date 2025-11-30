# 기존 hancut-concert 프로젝트 삭제 가이드

## 문제
CLI로 삭제 시 "too many deployments" 오류 발생

## 해결 방법: Dashboard에서 삭제

### 1. Dashboard 접속
👉 https://dash.cloudflare.com/302d0c397fc8af9f8ec5744c45329f5c/pages/view/hancut-concert

### 2. Settings 탭 클릭

### 3. Delete project 섹션
- 페이지 하단으로 스크롤
- **Delete project** 섹션 찾기
- 프로젝트 이름 입력: `hancut-concert`
- **Delete** 버튼 클릭

### 4. 확인
- 삭제 확인 대화상자에서 확인
- 삭제 완료

## 참고
- 삭제 후에는 복구할 수 없습니다
- 모든 배포와 설정이 삭제됩니다
- 도메인 연결도 해제됩니다

## 대안
삭제하지 않고 그대로 두어도 됩니다:
- `hancut-concert2`가 메인 프로젝트로 사용됨
- 기존 프로젝트는 자동 배포되지 않음
- 필요시 나중에 삭제 가능

