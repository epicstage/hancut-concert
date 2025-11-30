-- ticket_count 필드 추가 (1 또는 2)

-- participants 테이블에 ticket_count 필드 추가
ALTER TABLE participants ADD COLUMN ticket_count INTEGER NOT NULL DEFAULT 1;

