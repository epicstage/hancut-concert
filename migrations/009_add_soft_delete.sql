-- Soft Delete 지원을 위한 deleted_at 컬럼 추가

ALTER TABLE participants ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- 삭제된 참가자 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_participants_deleted_at ON participants(deleted_at);
