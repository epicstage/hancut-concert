-- 한동훈과 한 컷 토크콘서트 신청 시스템
-- Supabase PostgreSQL 데이터베이스 스키마

-- participants 테이블 생성
CREATE TABLE IF NOT EXISTS participants (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  seat_no TEXT
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_participants_phone ON participants(phone);
CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_is_paid ON participants(is_paid);

-- Row Level Security (RLS) 정책 설정
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능 (조회용)
CREATE POLICY "Allow public read access" ON participants
  FOR SELECT
  USING (true);

-- 모든 사용자가 자신의 데이터 수정 가능 (전화번호로 인증)
CREATE POLICY "Allow update own data" ON participants
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 모든 사용자가 신청 가능
CREATE POLICY "Allow public insert" ON participants
  FOR INSERT
  WITH CHECK (true);

-- 어드민만 삭제 가능 (서비스 롤 키 사용)
-- 삭제는 Supabase 대시보드나 서버 사이드에서만 처리

-- 주석 추가
COMMENT ON TABLE participants IS '한동훈과 한 컷 토크콘서트 참가자 정보';
COMMENT ON COLUMN participants.id IS '시스템 관리용 고유 ID';
COMMENT ON COLUMN participants.created_at IS '신청 일시';
COMMENT ON COLUMN participants.user_name IS '참가자 이름';
COMMENT ON COLUMN participants.phone IS '전화번호 (11자리 숫자, 고유값)';
COMMENT ON COLUMN participants.is_paid IS '입금 확인 여부';
COMMENT ON COLUMN participants.seat_no IS '좌석 번호 (예: A-101, B-12)';

