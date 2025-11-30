-- 2번째 참가자 정보 추가 마이그레이션

-- participants 테이블에 2번째 참가자 필드 추가
ALTER TABLE participants ADD COLUMN guest2_name TEXT;
ALTER TABLE participants ADD COLUMN guest2_phone TEXT;
ALTER TABLE participants ADD COLUMN guest2_ssn_first TEXT;
ALTER TABLE participants ADD COLUMN is_guest2_completed INTEGER NOT NULL DEFAULT 0;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_participants_guest2_phone ON participants(guest2_phone);
CREATE INDEX IF NOT EXISTS idx_participants_is_guest2_completed ON participants(is_guest2_completed);

