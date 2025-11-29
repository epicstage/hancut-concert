-- 입장 확인 필드 추가
ALTER TABLE participants ADD COLUMN is_checked_in INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_participants_is_checked_in ON participants(is_checked_in);



