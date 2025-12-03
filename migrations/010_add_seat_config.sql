-- 좌석 그룹 설정 테이블 추가

CREATE TABLE IF NOT EXISTS seat_groups_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  groups TEXT NOT NULL,  -- JSON 배열: ["A","B","C"] 또는 ["가","나","다"]
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  is_active INTEGER DEFAULT 1
);

-- 기본 설정 삽입 (기존 한글 그룹)
INSERT INTO seat_groups_config (groups, created_at, is_active) 
VALUES ('["가","나","다","라","마","바","사","아","자","차","카","타","파","하"]', datetime('now', 'localtime'), 1);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_seat_groups_active ON seat_groups_config(is_active);
