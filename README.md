# 한동훈과 한 컷 토크콘서트 신청 시스템

2025년 12월 14일 킨텍스에서 개최되는 "한동훈과 한 컷 토크콘서트" 참가 신청 시스템입니다.

## 🎨 디자인 컨셉

- **Primary Color**: Vibrant Red (Tailwind `red-600`)
- **Secondary Color**: Soft Sky Blue (Tailwind `sky-100` / `sky-700`)
- **Target**: 중장년층 (큰 글씨, 넓은 클릭 영역, 단순한 동작)

## 🛠 기술 스택

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Lucide React
- **Backend/DB**: Supabase (PostgreSQL)
- **Deployment**: Vercel (권장) 또는 기타 Next.js 호스팅

## 📋 기능

### 참가자용
- ✅ 참가 신청 (이름, 전화번호)
- ✅ 신청 내역 조회 (전화번호로 로그인)
- ✅ 이름 수정
- ✅ 입금 상태 확인
- ✅ 좌석 번호 확인 (행사 당일)

### 관리자용
- ✅ 참가자 목록 조회
- ✅ 검색 기능 (이름/전화번호)
- ✅ 입금 확인 토글
- ✅ 좌석 번호 입력/수정
- ✅ 참가자 삭제

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. Supabase 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 파일의 내용 실행
3. Settings → API에서 URL과 Anon Key 복사

### 3. 환경 변수 설정

`env.example` 파일을 복사하여 `.env.local` 파일 생성:

```bash
cp env.example .env.local
```

`.env.local` 파일을 열어 Supabase 정보 입력:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_ADMIN_PASSWORD=your-admin-password
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 열기

### 5. 빌드 및 배포

```bash
npm run build
npm start
```

## 📁 프로젝트 구조

```
.
├── app/                    # Next.js App Router
│   ├── page.tsx           # 메인 페이지
│   ├── apply/             # 신청 페이지
│   ├── check/             # 조회 페이지
│   ├── admin/             # 관리자 페이지
│   ├── layout.tsx         # 루트 레이아웃
│   └── globals.css        # 전역 스타일
├── lib/
│   └── supabase.ts        # Supabase 클라이언트
├── supabase/
│   └── schema.sql         # 데이터베이스 스키마
└── public/                # 정적 파일
```

## 🔐 관리자 페이지

- 경로: `/admin`
- 비밀번호: `.env.local`의 `NEXT_PUBLIC_ADMIN_PASSWORD` 값

## 📝 데이터베이스 스키마

### participants 테이블

| 필드 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL | 고유 ID (PK) |
| created_at | TIMESTAMPTZ | 신청 일시 |
| user_name | TEXT | 참가자 이름 |
| phone | TEXT | 전화번호 (11자리, UNIQUE) |
| is_paid | BOOLEAN | 입금 확인 여부 |
| seat_no | TEXT | 좌석 번호 (Nullable) |

## 🎯 주요 특징

- **접근성**: 중장년층을 위한 큰 폰트와 넓은 클릭 영역
- **반응형 디자인**: 모바일/태블릿/데스크톱 지원
- **실시간 업데이트**: Supabase를 통한 실시간 데이터 동기화
- **보안**: Row Level Security (RLS) 정책 적용

## 📄 라이선스

이 프로젝트는 개인/상업적 용도로 자유롭게 사용 가능합니다.
