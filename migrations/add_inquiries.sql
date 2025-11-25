-- 문의 테이블 생성
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  user_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  content TEXT NOT NULL,
  answer TEXT,
  answered_at TEXT,
  is_answered INTEGER NOT NULL DEFAULT 0
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_inquiries_phone ON inquiries(phone);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_is_answered ON inquiries(is_answered);

