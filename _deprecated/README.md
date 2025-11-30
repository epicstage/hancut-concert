# Deprecated Files

이 폴더에는 더 이상 사용하지 않는 파일들이 보관되어 있습니다.

## 포함된 파일들

### Next.js 관련 (미사용)
- `app_nextjs/` - Next.js App Router 코드 (React 컴포넌트)
- `lib_nextjs/` - Next.js용 API 클라이언트
- `next.config.js` - Next.js 설정
- `postcss.config.js` - PostCSS 설정
- `tailwind.config.ts` - Tailwind CSS 설정

## 현재 사용 중인 기술 스택

이 프로젝트는 다음 스택을 사용합니다:

- **프론트엔드**: Vanilla HTML + CSS + JavaScript (`public/` 폴더)
- **백엔드**: Cloudflare Pages Functions + Hono (`functions/` 폴더)
- **데이터베이스**: Cloudflare D1 (SQLite)

## 이 폴더를 삭제해도 되나요?

네, 프로덕션에서 사용하지 않는 코드이므로 삭제해도 됩니다.
다만, 향후 React/Next.js로 마이그레이션할 때 참고할 수 있도록 보관합니다.
