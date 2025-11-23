-- 한동훈과 한 컷 토크콘서트 신청 시스템
-- Cloudflare D1 데이터베이스 스키마

-- participants 테이블 생성
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  user_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  is_paid INTEGER NOT NULL DEFAULT 0,
  seat_group TEXT,  -- 가, 나, 다, 라, 마, 바, 사, 아, 자, 차, 카, 타, 파, 하
  seat_row TEXT,    -- 열 번호
  seat_number TEXT, -- 좌석 번호
  seat_full TEXT    -- 전체 좌석 번호 (가-2-5 형태)
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_participants_phone ON participants(phone);
CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_is_paid ON participants(is_paid);
CREATE INDEX IF NOT EXISTS idx_participants_seat_group ON participants(seat_group);
CREATE INDEX IF NOT EXISTS idx_participants_seat_full ON participants(seat_full);

