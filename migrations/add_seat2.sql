-- 2인 신청을 위한 두 번째 좌석 필드 추가

-- participants 테이블에 두 번째 좌석 필드 추가
ALTER TABLE participants ADD COLUMN seat_group_2 TEXT;
ALTER TABLE participants ADD COLUMN seat_row_2 TEXT;
ALTER TABLE participants ADD COLUMN seat_number_2 TEXT;
ALTER TABLE participants ADD COLUMN seat_full_2 TEXT;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_participants_seat_full_2 ON participants(seat_full_2);

