-- 주민번호 앞자리 컬럼 추가
ALTER TABLE participants ADD COLUMN ssn_first TEXT;

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_participants_ssn_first ON participants(ssn_first);

