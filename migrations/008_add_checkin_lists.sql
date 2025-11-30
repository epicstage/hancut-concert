-- 체크인 리스트 테이블 생성
-- 여러 입구/구역별로 별도의 체크인 리스트를 관리할 수 있음

CREATE TABLE IF NOT EXISTS checkin_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  is_active INTEGER NOT NULL DEFAULT 1,
  allowed_seat_groups TEXT  -- JSON 배열: '["가","나","다"]' (null이면 모든 그룹 허용)
);

-- 체크인 기록 테이블 생성
-- 각 참가자의 체크인 기록을 리스트별로 저장

CREATE TABLE IF NOT EXISTS checkin_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  checkin_list_id INTEGER NOT NULL,
  checked_in_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  checked_in_by TEXT,  -- 체크인 처리자 (선택)
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (checkin_list_id) REFERENCES checkin_lists(id) ON DELETE CASCADE,
  UNIQUE(participant_id, checkin_list_id)  -- 동일 리스트에 중복 체크인 방지
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_checkin_lists_is_active ON checkin_lists(is_active);
CREATE INDEX IF NOT EXISTS idx_checkin_records_participant_id ON checkin_records(participant_id);
CREATE INDEX IF NOT EXISTS idx_checkin_records_checkin_list_id ON checkin_records(checkin_list_id);
CREATE INDEX IF NOT EXISTS idx_checkin_records_checked_in_at ON checkin_records(checked_in_at DESC);

-- 기본 체크인 리스트 생성 (메인 입구)
INSERT INTO checkin_lists (name, description, is_active)
VALUES ('메인 입구', '킨텍스 메인 입구 체크인', 1);
