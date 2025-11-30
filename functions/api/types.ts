// 공통 타입 정의

// Cloudflare D1 타입
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { last_row_id?: number; changes?: number } }>;
}

// KV 네임스페이스 타입
export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>;
  get<T>(key: string, options: { type: 'json' }): Promise<T | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number; expiration?: number; metadata?: Record<string, unknown> }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string; expiration?: number; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>;
}

// 환경 변수 타입
export type Env = {
  DB: D1Database;
  CACHE?: KVNamespace; // KV 캐시 (선택적)
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
};

// 참가자 타입
export interface Participant {
  id: number;
  created_at: string;
  user_name: string;
  phone: string;
  is_paid: number;
  ssn_first: string | null;
  ticket_count: number;
  guest2_name: string | null;
  guest2_phone: string | null;
  guest2_ssn_first: string | null;
  is_guest2_completed: number;
  seat_group: string | null;
  seat_row: string | null;
  seat_number: string | null;
  seat_full: string | null;
  seat_group_2: string | null;
  seat_row_2: string | null;
  seat_number_2: string | null;
  seat_full_2: string | null;
  is_checked_in: number;
}

// 문의 타입
export interface Inquiry {
  id: number;
  created_at: string;
  user_name: string;
  phone: string;
  content: string;
  answer: string | null;
  answered_at: string | null;
  is_answered: number;
}

// 좌석 타입
export interface Seat {
  group: string;
  row: string;
  number: string;
}

// API 응답 타입
export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

// 좌석 그룹 상수
export const VALID_SEAT_GROUPS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'] as const;
export type SeatGroup = typeof VALID_SEAT_GROUPS[number];

// 체크인 리스트 타입
export interface CheckinList {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  is_active: number;
  allowed_seat_groups: string | null; // JSON 배열 문자열 (예: '["가","나","다"]')
  checked_in_count: number;
}

// 체크인 기록 타입
export interface CheckinRecord {
  id: number;
  participant_id: number;
  checkin_list_id: number;
  checked_in_at: string;
  checked_in_by: string | null; // 체크인 처리자 (선택)
}

// 캐시 키 상수
export const CacheKeys = {
  CHECKIN_STATS: 'checkin:stats',
  CHECKIN_LIST_ALL: 'checkin:lists:all',
  PARTICIPANT_COUNT: 'participant:count',
  PARTICIPANTS_PAID: 'participants:paid',
} as const;

// 캐시 TTL (초)
export const CacheTTL = {
  STATS: 10,        // 통계: 10초 (자주 변경)
  LIST: 60,         // 목록: 1분
  COUNT: 30,        // 카운트: 30초
  PARTICIPANT: 300, // 참가자 정보: 5분
} as const;
