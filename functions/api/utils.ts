// 공통 유틸리티 함수

import * as jose from 'jose';
import type { Context } from 'hono';
import type { Env, D1Database, Seat } from './types';
import { SEAT_GROUP_CAPACITY } from './types';

// ===== 에러 처리 =====

// 표준 에러 응답 코드
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

// HTTP 상태 코드 타입
type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

// 표준 에러 응답 생성
export function errorResponse(
  c: Context,
  status: HttpErrorStatus,
  message: string,
  code?: ErrorCodeType,
  details?: unknown
) {
  return c.json({
    success: false,
    error: message,
    code: code || (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR),
    ...(details && { details }),
  }, status);
}

// 표준 성공 응답 생성
export function successResponse<T extends Record<string, unknown>>(
  c: Context,
  data: T,
  message?: string
) {
  return c.json({
    success: true,
    ...(message && { message }),
    ...data,
  });
}

// ===== JWT 및 인증 =====

// JWT 설정
export const JWT_EXPIRATION = '2h';
export const JWT_ALGORITHM = 'HS256';
export const ADMIN_TOKEN_HEADER = 'x-admin-token';

// KST 시간 생성
export function getKSTDateTime(): string {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kstTime = new Date(utcTime + (9 * 60 * 60 * 1000));

  const year = kstTime.getFullYear();
  const month = String(kstTime.getMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getDate()).padStart(2, '0');
  const hours = String(kstTime.getHours()).padStart(2, '0');
  const minutes = String(kstTime.getMinutes()).padStart(2, '0');
  const seconds = String(kstTime.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// JWT 비밀 키 가져오기
export function getJwtSecret(env: Env): Uint8Array {
  const secret = env.JWT_SECRET || env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error('JWT_SECRET or ADMIN_PASSWORD must be set');
  }
  return new TextEncoder().encode(secret);
}

// JWT 토큰 생성
export async function generateJwtToken(env: Env): Promise<string> {
  const secret = getJwtSecret(env);

  const token = await new jose.SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .setIssuer('hancut-concert')
    .sign(secret);

  return token;
}

// JWT 토큰 검증
export async function verifyJwtToken(token: string, env: Env): Promise<boolean> {
  try {
    const secret = getJwtSecret(env);

    await jose.jwtVerify(token, secret, {
      issuer: 'hancut-concert',
    });

    return true;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return false;
  }
}

// 사용 가능한 좌석 생성 (새로운 그룹-번호 형식)
// 각 그룹별 좌석 수가 다름: A(90), B(100), C(100), D(90) 등
export function generateAvailableSeats(
  groups: string[],
  _rowsPerGroup?: number,  // deprecated, 호환성 유지용
  _seatsPerRow?: number    // deprecated, 호환성 유지용
): Seat[] {
  const availableSeats: Seat[] = [];

  for (const group of groups) {
    // 그룹별 좌석 수 가져오기 (없으면 기본 90)
    const seatCount = SEAT_GROUP_CAPACITY[group] || 90;

    for (let number = 1; number <= seatCount; number++) {
      availableSeats.push({
        group,
        row: '',  // 더 이상 사용하지 않음 (호환성 유지)
        number: number.toString(),
      });
    }
  }

  return availableSeats;
}

// 이미 배정된 좌석 조회
export async function getAssignedSeats(db: D1Database): Promise<Set<string>> {
  const assignedSeats = await db.prepare(
    'SELECT seat_full, seat_full_2 FROM participants WHERE (seat_full IS NOT NULL AND seat_full != "") OR (seat_full_2 IS NOT NULL AND seat_full_2 != "")'
  ).all<{ seat_full: string | null; seat_full_2: string | null }>();

  const assignedSet = new Set<string>();
  assignedSeats.results?.forEach(s => {
    if (s.seat_full) assignedSet.add(s.seat_full);
    if (s.seat_full_2) assignedSet.add(s.seat_full_2);
  });

  return assignedSet;
}

// 좌석 배정 업데이트 (새 형식: 그룹-번호, 예: "A-1", "B-50")
export async function assignSeatsToParticipant(
  db: D1Database,
  participantId: number,
  ticketCount: number,
  seat1: Seat,
  seat2?: Seat
): Promise<void> {
  // 새 형식: "그룹-번호" (예: "A-1", "B-50")
  const seatFull1 = `${seat1.group}-${seat1.number}`;

  if (ticketCount === 2 && seat2) {
    const seatFull2 = `${seat2.group}-${seat2.number}`;
    await db.prepare(
      'UPDATE participants SET seat_group = ?, seat_row = NULL, seat_number = ?, seat_full = ?, seat_group_2 = ?, seat_row_2 = NULL, seat_number_2 = ?, seat_full_2 = ? WHERE id = ?'
    )
      .bind(seat1.group, seat1.number, seatFull1, seat2.group, seat2.number, seatFull2, participantId)
      .run();
  } else {
    await db.prepare(
      'UPDATE participants SET seat_group = ?, seat_row = NULL, seat_number = ?, seat_full = ? WHERE id = ?'
    )
      .bind(seat1.group, seat1.number, seatFull1, participantId)
      .run();
  }
}

// 주민번호 앞자리 검증 (YYMMDD)
export function validateSsnFirst(ssnFirst: string): { valid: boolean; error?: string } {
  if (ssnFirst.length !== 6 || !/^\d+$/.test(ssnFirst)) {
    return { valid: false, error: '주민번호 앞자리는 6자리 숫자여야 합니다.' };
  }

  const mm = parseInt(ssnFirst.substring(2, 4));
  const dd = parseInt(ssnFirst.substring(4, 6));

  if (mm < 1 || mm > 12) {
    return { valid: false, error: '주민번호 앞자리의 월(3-4번째 자리)이 올바르지 않습니다. (01-12)' };
  }

  // 윤년 고려한 월별 일수
  const yy = parseInt(ssnFirst.substring(0, 2));
  const fullYear = yy >= 0 && yy <= 25 ? 2000 + yy : 1900 + yy;
  const isLeapYear = (fullYear % 4 === 0 && fullYear % 100 !== 0) || (fullYear % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDay = daysInMonth[mm - 1];

  if (dd < 1 || dd > maxDay) {
    return {
      valid: false,
      error: `주민번호 앞자리의 일(5-6번째 자리)이 올바르지 않습니다. (${mm}월은 01-${String(maxDay).padStart(2, '0')}일까지 가능)`
    };
  }

  return { valid: true };
}

// 전화번호 검증
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (phone.length !== 11 || !/^\d+$/.test(phone)) {
    return { valid: false, error: '전화번호는 11자리 숫자여야 합니다.' };
  }
  return { valid: true };
}

// 배열 랜덤 셔플 (Fisher-Yates)
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
