import { Hono } from 'hono';

// Cloudflare Workers 타입
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: any }>;
}

type Env = {
  DB: D1Database;
  /**
   * 관리자 비밀번호 (서버 사이드에서만 사용)
   * - Cloudflare Pages 환경 변수로 설정 (Dashboard 또는 wrangler secret)
   * - 클라이언트로 직접 노출되지 않도록 주의
   */
  ADMIN_PASSWORD?: string;
};

// Cloudflare Pages Functions 타입
interface PagesFunction<Env = any> {
  (context: {
    request: Request;
    env: Env;
    waitUntil: (promise: Promise<any>) => void;
    passThroughOnException: () => void;
    next: () => Promise<Response>;
    data: any;
  }): Response | Promise<Response>;
}

const app = new Hono<{ Bindings: Env }>();

// 유틸리티 함수: KST 시간 생성
function getKSTDateTime(): string {
  const now = new Date();
  // UTC 시간을 가져와서 KST(UTC+9)로 변환
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kstTime = new Date(utcTime + (9 * 60 * 60 * 1000));
  // YYYY-MM-DD HH:mm:ss 형식으로 변환
  const year = kstTime.getFullYear();
  const month = String(kstTime.getMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getDate()).padStart(2, '0');
  const hours = String(kstTime.getHours()).padStart(2, '0');
  const minutes = String(kstTime.getMinutes()).padStart(2, '0');
  const seconds = String(kstTime.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 유틸리티 함수: 사용 가능한 좌석 생성
function generateAvailableSeats(
  groups: string[],
  rowsPerGroup: number,
  seatsPerRow: number
): Array<{ group: string; row: string; number: string }> {
  const availableSeats: Array<{ group: string; row: string; number: string }> = [];
  for (const group of groups) {
    for (let row = 1; row <= rowsPerGroup; row++) {
      for (let seat = 1; seat <= seatsPerRow; seat++) {
        availableSeats.push({
          group,
          row: row.toString(),
          number: seat.toString(),
        });
      }
    }
  }
  return availableSeats;
}

// 유틸리티 함수: 이미 배정된 좌석 조회
async function getAssignedSeats(db: D1Database): Promise<Set<string>> {
  const assignedSeats = await db.prepare(
    'SELECT seat_full, seat_full_2 FROM participants WHERE (seat_full IS NOT NULL AND seat_full != "") OR (seat_full_2 IS NOT NULL AND seat_full_2 != "")'
  )
    .all<{ seat_full: string | null; seat_full_2: string | null }>();

  const assignedSet = new Set<string>();
  assignedSeats.results?.forEach(s => {
    if (s.seat_full) assignedSet.add(s.seat_full);
    if (s.seat_full_2) assignedSet.add(s.seat_full_2);
  });
  return assignedSet;
}

// 유틸리티 함수: 좌석 배정 업데이트
async function assignSeatsToParticipant(
  db: D1Database,
  participantId: number,
  ticketCount: number,
  seat1: { group: string; row: string; number: string },
  seat2?: { group: string; row: string; number: string }
): Promise<void> {
  const seatFull1 = `${seat1.group}-${seat1.row}-${seat1.number}`;
  
  if (ticketCount === 2 && seat2) {
    // 2인 신청인 경우 두 번째 좌석도 배정
    const seatFull2 = `${seat2.group}-${seat2.row}-${seat2.number}`;
    await db.prepare(
      'UPDATE participants SET seat_group = ?, seat_row = ?, seat_number = ?, seat_full = ?, seat_group_2 = ?, seat_row_2 = ?, seat_number_2 = ?, seat_full_2 = ? WHERE id = ?'
    )
      .bind(seat1.group, seat1.row, seat1.number, seatFull1, seat2.group, seat2.row, seat2.number, seatFull2, participantId)
      .run();
  } else {
    // 1인 신청인 경우 첫 번째 좌석만 배정
    await db.prepare(
      'UPDATE participants SET seat_group = ?, seat_row = ?, seat_number = ?, seat_full = ? WHERE id = ?'
    )
      .bind(seat1.group, seat1.row, seat1.number, seatFull1, participantId)
      .run();
  }
}

// CORS 설정
app.use('*', async (c, next) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  await next();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    c.res.headers.set(key, value);
  });
});

// 관리자 인증 유틸리티
const ADMIN_TOKEN_HEADER = 'x-admin-token';

async function requireAdmin(
  c: any,
  next: () => Promise<void>
) {
  const adminPassword = c.env.ADMIN_PASSWORD;
  const token = c.req.header(ADMIN_TOKEN_HEADER);

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD is not set in environment');
    return c.json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }, 500);
  }

  if (!token || token !== adminPassword) {
    return c.json({ error: '관리자 권한이 필요합니다.' }, 401);
  }

  await next();
}

// API 라우트
const api = new Hono<{ Bindings: Env }>();

// 관리자 로그인
api.post('/admin/login', async (c) => {
  try {
    const adminPassword = c.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD is not set in environment');
      return c.json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }, 500);
    }

    const body = await c.req.json<{ password: string }>();

    if (!body.password) {
      return c.json({ error: '비밀번호를 입력해주세요.' }, 400);
    }

    if (body.password !== adminPassword) {
      return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
    }

    // 간단한 토큰 방식: 서버 환경 변수와 동일한 값을 토큰으로 사용
    // - 클라이언트 번들에는 포함되지 않고, 로그인 시점에만 네트워크로 전달됨
    const token = adminPassword;

    return c.json({ success: true, token });
  } catch (error) {
    console.error('Error in admin login:', error);
    return c.json({ error: '로그인 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 신청
api.post('/participants', async (c) => {
  try {
    const body = await c.req.json<{
      user_name: string;
      phone: string;
      ssn_first?: string;
      ticket_count?: number; // 1 또는 2
    }>();

    if (!body.user_name || !body.phone) {
      return c.json({ error: '이름과 전화번호는 필수입니다.' }, 400);
    }

    if (body.phone.length !== 11 || !/^\d+$/.test(body.phone)) {
      return c.json({ error: '전화번호는 11자리 숫자여야 합니다.' }, 400);
    }

    if (body.ssn_first && (body.ssn_first.length !== 6 || !/^\d+$/.test(body.ssn_first))) {
      return c.json({ error: '주민번호 앞자리는 6자리 숫자여야 합니다.' }, 400);
    }

    // 주민번호 앞자리 유효성 검사 (yymmdd 형식)
    if (body.ssn_first) {
      const yy = parseInt(body.ssn_first.substring(0, 2));
      const mm = parseInt(body.ssn_first.substring(2, 4));
      const dd = parseInt(body.ssn_first.substring(4, 6));
      
      // 월 검증 (01-12)
      if (mm < 1 || mm > 12) {
        return c.json({ error: '주민번호 앞자리의 월(3-4번째 자리)이 올바르지 않습니다. (01-12)' }, 400);
      }
      
      // 일 검증 (월에 따른 유효한 일자 범위)
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      const maxDay = daysInMonth[mm - 1];
      
      if (dd < 1 || dd > maxDay) {
        return c.json({ error: `주민번호 앞자리의 일(5-6번째 자리)이 올바르지 않습니다. (${mm}월은 01-${String(maxDay).padStart(2, '0')}일까지 가능)` }, 400);
      }
    }

    // ticket_count 검증 (1 또는 2만 허용)
    const ticketCount = body.ticket_count || 1;
    if (ticketCount !== 1 && ticketCount !== 2) {
      return c.json({ error: '티켓 수는 1 또는 2만 가능합니다.' }, 400);
    }

    // 한국 시간대(KST, UTC+9)로 현재 시간 생성
    const created_at = getKSTDateTime();
    const isGuest2Completed = 0; // 2인 신청이어도 아직 입력 안됨

    const result = await c.env.DB.prepare(
      'INSERT INTO participants (user_name, phone, ssn_first, created_at, is_guest2_completed, ticket_count) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(body.user_name.trim(), body.phone, body.ssn_first || null, created_at, isGuest2Completed, ticketCount)
      .run();

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      message: '신청이 완료되었습니다.',
      ticket_count: ticketCount,
    });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ error: '이미 신청된 전화번호입니다.' }, 400);
    }
    console.error('Error creating participant:', error);
    return c.json({ error: '신청 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 수 조회 (공개 API)
api.get('/participants/count', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants'
    )
      .first<{ count: number }>();

    return c.json({
      success: true,
      count: result?.count || 0,
    });
  } catch (error) {
    console.error('Error getting participant count:', error);
    return c.json({ error: '참가자 수 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 조회 (전화번호로)
api.get('/participants/phone/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');

    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ?'
    )
      .bind(phone)
      .first();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    return c.json({ success: true, participant });
  } catch (error) {
    console.error('Error fetching participant:', error);
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 이름 수정
api.put('/participants/:id/name', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ user_name: string }>();

    if (!body.user_name?.trim()) {
      return c.json({ error: '이름은 필수입니다.' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE participants SET user_name = ? WHERE id = ?'
    )
      .bind(body.user_name.trim(), id)
      .run();

    return c.json({ success: true, message: '이름이 수정되었습니다.' });
  } catch (error) {
    console.error('Error updating participant name:', error);
    return c.json({ error: '수정 중 오류가 발생했습니다.' }, 500);
  }
});

// 2번째 참가자 정보 업데이트
api.put('/participants/phone/:phone/guest2', async (c) => {
  try {
    const phone = c.req.param('phone');
    const body = await c.req.json<{
      guest2_name: string;
      guest2_phone: string;
      guest2_ssn_first: string;
    }>();

    if (!body.guest2_name || !body.guest2_phone || !body.guest2_ssn_first) {
      return c.json({ error: '2번째 참가자의 이름, 전화번호, 생년월일은 모두 필수입니다.' }, 400);
    }

    if (body.guest2_phone.length !== 11 || !/^\d+$/.test(body.guest2_phone)) {
      return c.json({ error: '전화번호는 11자리 숫자여야 합니다.' }, 400);
    }

    if (body.guest2_ssn_first.length !== 6 || !/^\d+$/.test(body.guest2_ssn_first)) {
      return c.json({ error: '생년월일 앞자리는 6자리 숫자여야 합니다.' }, 400);
    }

    // 2번째 참가자 주민번호 앞자리 유효성 검사 (yymmdd 형식)
    const yy2 = parseInt(body.guest2_ssn_first.substring(0, 2));
    const mm2 = parseInt(body.guest2_ssn_first.substring(2, 4));
    const dd2 = parseInt(body.guest2_ssn_first.substring(4, 6));
    
    // 월 검증 (01-12)
    if (mm2 < 1 || mm2 > 12) {
      return c.json({ error: '2번째 참가자 주민번호 앞자리의 월(3-4번째 자리)이 올바르지 않습니다. (01-12)' }, 400);
    }
    
    // 일 검증 (월에 따른 유효한 일자 범위)
    const daysInMonth2 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const maxDay2 = daysInMonth2[mm2 - 1];
    
    if (dd2 < 1 || dd2 > maxDay2) {
      return c.json({ error: `2번째 참가자 주민번호 앞자리의 일(5-6번째 자리)이 올바르지 않습니다. (${mm2}월은 01-${String(maxDay2).padStart(2, '0')}일까지 가능)` }, 400);
    }

    // guest2_phone 중복 체크 (다른 참가자의 phone 또는 guest2_phone과 중복 확인)
    const existingPhone = await c.env.DB.prepare(
      'SELECT id FROM participants WHERE phone = ? OR guest2_phone = ?'
    )
      .bind(body.guest2_phone, body.guest2_phone)
      .first<{ id: number }>();

    if (existingPhone) {
      return c.json({ error: '이미 사용 중인 전화번호입니다.' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE participants SET guest2_name = ?, guest2_phone = ?, guest2_ssn_first = ?, is_guest2_completed = 1 WHERE phone = ?'
    )
      .bind(
        body.guest2_name.trim(),
        body.guest2_phone,
        body.guest2_ssn_first,
        phone
      )
      .run();

    return c.json({ success: true, message: '2번째 참가자 정보가 등록되었습니다.' });
  } catch (error) {
    console.error('Error updating guest2 info:', error);
    return c.json({ error: '2번째 참가자 정보 등록 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 모든 참가자 조회
api.get('/admin/participants', requireAdmin, async (c) => {
  try {
    const search = c.req.query('search');

    let query = 'SELECT * FROM participants';
    let params: any[] = [];

    if (search) {
      query += ' WHERE user_name LIKE ? OR phone LIKE ? OR guest2_name LIKE ? OR guest2_phone LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    return c.json({ success: true, participants: result.results || [] });
  } catch (error) {
    console.error('Error fetching participants:', error);
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 입금 상태 변경
api.put('/admin/participants/:id/payment', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ is_paid: boolean }>();

    await c.env.DB.prepare(
      'UPDATE participants SET is_paid = ? WHERE id = ?'
    )
      .bind(body.is_paid ? 1 : 0, id)
      .run();

    return c.json({ success: true, message: '입금 상태가 변경되었습니다.' });
  } catch (error) {
    console.error('Error updating payment status:', error);
    return c.json({ error: '업데이트 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 좌석 배정 (그룹-열-좌석번호)
api.put('/admin/participants/:id/seat', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      seat_group: string;
      seat_row: string;
      seat_number: string;
      is_guest?: boolean;
    }>();

    const validGroups = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    
    if (body.seat_group && !validGroups.includes(body.seat_group)) {
      return c.json({ error: '유효하지 않은 그룹입니다. (가~하)' }, 400);
    }

    // 좌석 번호 검증 (숫자만 허용)
    if (body.seat_row && !/^\d+$/.test(body.seat_row)) {
      return c.json({ error: '열 번호는 숫자만 입력 가능합니다.' }, 400);
    }
    if (body.seat_number && !/^\d+$/.test(body.seat_number)) {
      return c.json({ error: '좌석 번호는 숫자만 입력 가능합니다.' }, 400);
    }

    // 전체 좌석 번호 생성 (가-2-5 형태)
    let seatFull = null;
    if (body.seat_group && body.seat_row && body.seat_number) {
      seatFull = `${body.seat_group}-${body.seat_row}-${body.seat_number}`;
    }

    // guest2인 경우 seat_full_2 필드 업데이트
    if (body.is_guest) {
      await c.env.DB.prepare(
        'UPDATE participants SET seat_group_2 = ?, seat_row_2 = ?, seat_number_2 = ?, seat_full_2 = ? WHERE id = ?'
      )
        .bind(
          body.seat_group || null,
          body.seat_row || null,
          body.seat_number || null,
          seatFull,
          id
        )
        .run();
    } else {
      await c.env.DB.prepare(
        'UPDATE participants SET seat_group = ?, seat_row = ?, seat_number = ?, seat_full = ? WHERE id = ?'
      )
        .bind(
          body.seat_group || null,
          body.seat_row || null,
          body.seat_number || null,
          seatFull,
          id
        )
        .run();
    }

    return c.json({ success: true, message: '좌석이 배정되었습니다.', seat_full: seatFull });
  } catch (error) {
    console.error('Error updating seat:', error);
    return c.json({ error: '좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 개별 참가자 좌석 초기화
api.delete('/admin/participants/:id/seat', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    await c.env.DB.prepare(
      'UPDATE participants SET seat_group = NULL, seat_row = NULL, seat_number = NULL, seat_full = NULL, seat_group_2 = NULL, seat_row_2 = NULL, seat_number_2 = NULL, seat_full_2 = NULL WHERE id = ?'
    )
      .bind(id)
      .run();

    return c.json({ success: true, message: '좌석이 초기화되었습니다.' });
  } catch (error) {
    console.error('Error resetting seat:', error);
    return c.json({ error: '좌석 초기화 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 랜덤 좌석 배정 (입금 완료된 참가자들)
api.post('/admin/participants/random-seats', requireAdmin, async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];  // ['가', '나', ...]
      rowsPerGroup: number;  // 그룹당 열 수
      seatsPerRow: number;   // 열당 좌석 수
    }>();

    if (!body.groups || !body.rowsPerGroup || !body.seatsPerRow) {
      return c.json({ error: '그룹, 열 수, 좌석 수는 필수입니다.' }, 400);
    }

    // 입금 완료된 참가자 조회 (ticket_count 포함)
    const paidParticipants = await c.env.DB.prepare(
      'SELECT id, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") ORDER BY created_at ASC'
    )
      .all<{ id: number; ticket_count: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

    // 실제 필요한 좌석 수 계산 (ticket_count 합산)
    const totalSeatsNeeded = paidParticipants.results.reduce((sum, p) => sum + (p.ticket_count || 1), 0);

    // 사용 가능한 좌석 생성
    const availableSeats = generateAvailableSeats(body.groups, body.rowsPerGroup, body.seatsPerRow);

    // 이미 배정된 좌석 조회
    const assignedSet = await getAssignedSeats(c.env.DB);

    // 사용 가능한 좌석만 필터링
    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.row}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < totalSeatsNeeded) {
      return c.json({ 
        error: `사용 가능한 좌석(${freeSeats.length}개)이 필요한 좌석 수(${totalSeatsNeeded}개)보다 적습니다.` 
      }, 400);
    }

    // 랜덤 셔플
    for (let i = freeSeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [freeSeats[i], freeSeats[j]] = [freeSeats[j], freeSeats[i]];
    }

    // 좌석 배정
    let assignedCount = 0;
    let seatIndex = 0;
    
    for (const participant of paidParticipants.results) {
      const ticketCount = participant.ticket_count || 1;
      
      if (seatIndex >= freeSeats.length) break;
      
      // 첫 번째 좌석 배정
      const seat1 = freeSeats[seatIndex++];
      
      if (ticketCount === 2) {
        // 2인 신청인 경우 두 번째 좌석도 배정
        if (seatIndex >= freeSeats.length) {
          return c.json({ error: '2인 신청을 위한 두 번째 좌석이 부족합니다.' }, 400);
        }
        
        const seat2 = freeSeats[seatIndex++];
        await assignSeatsToParticipant(c.env.DB, participant.id, ticketCount, seat1, seat2);
        assignedCount += 2;
      } else {
        // 1인 신청인 경우 첫 번째 좌석만 배정
        await assignSeatsToParticipant(c.env.DB, participant.id, ticketCount, seat1);
        assignedCount += 1;
      }
    }

    return c.json({ 
      success: true, 
      message: `${assignedCount}명의 참가자에게 좌석이 랜덤 배정되었습니다.`,
      assigned_count: assignedCount
    });
  } catch (error) {
    console.error('Error random seat assignment:', error);
    return c.json({ error: '랜덤 좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 연령대별 좌석 배정 (00년대생 → 90년대생 → 80년대생 순)
api.post('/admin/participants/age-based-seats', requireAdmin, async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];
      rowsPerGroup: number;
      seatsPerRow: number;
    }>();

    if (!body.groups || !body.rowsPerGroup || !body.seatsPerRow) {
      return c.json({ error: '그룹, 열 수, 좌석 수는 필수입니다.' }, 400);
    }

    // 입금 완료된 참가자 조회 (주민번호 앞자리, ticket_count 포함)
    const paidParticipants = await c.env.DB.prepare(
      'SELECT id, ssn_first, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") ORDER BY created_at ASC'
    )
      .all<{ id: number; ssn_first: string | null; ticket_count: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

    // 주민번호 앞자리가 없는 참가자 필터링
    const participantsWithSsn = paidParticipants.results.filter(p => p.ssn_first && p.ssn_first.length >= 2);
    const participantsWithoutSsn = paidParticipants.results.filter(p => !p.ssn_first || p.ssn_first.length < 2);

    if (participantsWithSsn.length === 0) {
      return c.json({ error: '주민번호 앞자리가 있는 입금 완료 참가자가 없습니다.' }, 400);
    }

    // 연령대별로 정렬 (00년대생 → 90년대생 → 80년대생)
    participantsWithSsn.sort((a, b) => {
      const yearA = parseInt(a.ssn_first!.substring(0, 2));
      const yearB = parseInt(b.ssn_first!.substring(0, 2));
      
      // 연도 범위에 따라 우선순위 부여
      const getPriority = (year: number) => {
        if (year >= 0 && year <= 9) return 1; // 00년대생 (최우선)
        if (year >= 90 && year <= 99) return 2; // 90년대생
        if (year >= 80 && year <= 89) return 3; // 80년대생
        return 4; // 기타
      };
      
      const priorityA = getPriority(yearA);
      const priorityB = getPriority(yearB);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 같은 연령대 내에서는 연도 오름차순
      return yearA - yearB;
    });

    // 주민번호 없는 참가자는 뒤에 추가
    const sortedParticipants = [...participantsWithSsn, ...participantsWithoutSsn];

    // 실제 필요한 좌석 수 계산 (ticket_count 합산)
    const totalSeatsNeeded = sortedParticipants.reduce((sum, p) => sum + (p.ticket_count || 1), 0);

    // 사용 가능한 좌석 생성
    const availableSeats: Array<{ group: string; row: string; number: string }> = [];
    for (const group of body.groups) {
      for (let row = 1; row <= body.rowsPerGroup; row++) {
        for (let seat = 1; seat <= body.seatsPerRow; seat++) {
          availableSeats.push({
            group,
            row: row.toString(),
            number: seat.toString(),
          });
        }
      }
    }

    // 이미 배정된 좌석 조회 (seat_full과 seat_full_2 모두 확인)
    const assignedSeats = await c.env.DB.prepare(
      'SELECT seat_full, seat_full_2 FROM participants WHERE (seat_full IS NOT NULL AND seat_full != "") OR (seat_full_2 IS NOT NULL AND seat_full_2 != "")'
    )
      .all<{ seat_full: string | null; seat_full_2: string | null }>();

    const assignedSet = new Set<string>();
    assignedSeats.results?.forEach(s => {
      if (s.seat_full) assignedSet.add(s.seat_full);
      if (s.seat_full_2) assignedSet.add(s.seat_full_2);
    });

    // 사용 가능한 좌석만 필터링
    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.row}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < totalSeatsNeeded) {
      return c.json({ 
        error: `사용 가능한 좌석(${freeSeats.length}개)이 필요한 좌석 수(${totalSeatsNeeded}개)보다 적습니다.` 
      }, 400);
    }

    // 좌석 배정 (정렬된 순서대로)
    let assignedCount = 0;
    let seatIndex = 0;
    
    for (const participant of sortedParticipants) {
      const ticketCount = participant.ticket_count || 1;
      
      if (seatIndex >= freeSeats.length) break;
      
      // 첫 번째 좌석 배정
      const seat1 = freeSeats[seatIndex++];
      
      if (ticketCount === 2) {
        // 2인 신청인 경우 두 번째 좌석도 배정
        if (seatIndex >= freeSeats.length) {
          return c.json({ error: '2인 신청을 위한 두 번째 좌석이 부족합니다.' }, 400);
        }
        
        const seat2 = freeSeats[seatIndex++];
        await assignSeatsToParticipant(c.env.DB, participant.id, ticketCount, seat1, seat2);
        assignedCount += 2;
      } else {
        // 1인 신청인 경우 첫 번째 좌석만 배정
        await assignSeatsToParticipant(c.env.DB, participant.id, ticketCount, seat1);
        assignedCount += 1;
      }
    }

    return c.json({ 
      success: true, 
      message: `${assignedCount}명의 참가자에게 연령대별로 좌석이 배정되었습니다.`,
      assigned_count: assignedCount
    });
  } catch (error) {
    console.error('Error age-based seat assignment:', error);
    return c.json({ error: '연령대별 좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 전체 좌석 초기화
api.post('/admin/participants/reset-seats', async (c) => {
  try {
    // 모든 참가자의 좌석 정보 초기화 (두 번째 좌석 포함)
    await c.env.DB.prepare(
      'UPDATE participants SET seat_group = NULL, seat_row = NULL, seat_number = NULL, seat_full = NULL, seat_group_2 = NULL, seat_row_2 = NULL, seat_number_2 = NULL, seat_full_2 = NULL'
    )
      .run();

    return c.json({ 
      success: true, 
      message: '모든 참가자의 좌석이 초기화되었습니다.' 
    });
  } catch (error) {
    console.error('Error resetting seats:', error);
    return c.json({ error: '좌석 초기화 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 참가자 삭제 (아무때나 삭제 가능)
api.delete('/admin/participants/:id', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    // 참가자 존재 여부 확인
    const participant = await c.env.DB.prepare('SELECT id, user_name FROM participants WHERE id = ?')
      .bind(id)
      .first<{ id: number; user_name: string }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    // 삭제 실행
    await c.env.DB.prepare('DELETE FROM participants WHERE id = ?')
      .bind(id)
      .run();

    return c.json({ 
      success: true, 
      message: `"${participant.user_name}" 참가자 정보가 삭제되었습니다.`,
      deleted_id: id
    });
  } catch (error) {
    console.error('Error deleting participant:', error);
    return c.json({ error: '삭제 중 오류가 발생했습니다.' }, 500);
  }
});

// 좌석 확인 (행사 당일 이후)
api.get('/seat/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');
    const eventDate = new Date('2025-12-14');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);

    if (today < eventDate) {
      return c.json({ error: '행사 당일 오픈됩니다.' }, 403);
    }

    const participant = await c.env.DB.prepare(
      'SELECT seat_full, seat_group, seat_row, seat_number FROM participants WHERE phone = ?'
    )
      .bind(phone)
      .first<{ 
        seat_full: string | null; 
        seat_group: string | null; 
        seat_row: string | null; 
        seat_number: string | null;
      }>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    if (!participant.seat_full) {
      return c.json({ error: '아직 좌석이 배정되지 않았습니다.' }, 404);
    }

    return c.json({
      success: true,
      seat: participant.seat_full,
      seat_full: participant.seat_full,
      seat_group: participant.seat_group,
      seat_row: participant.seat_row,
      seat_number: participant.seat_number,
    });
  } catch (error) {
    console.error('Error fetching seat:', error);
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 문의 API
// 전화번호로 문의 내역 조회
api.get('/inquiries/phone/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');

    const inquiries = await c.env.DB.prepare(
      'SELECT * FROM inquiries WHERE phone = ? ORDER BY created_at DESC'
    )
      .bind(phone)
      .all<{
        id: number;
        created_at: string;
        user_name: string;
        phone: string;
        content: string;
        answer: string | null;
        answered_at: string | null;
        is_answered: number;
      }>();

    return c.json({
      success: true,
      inquiries: inquiries.results || [],
    });
  } catch (error) {
    console.error('Error fetching inquiries by phone:', error);
    return c.json({ error: '문의 내역을 불러오는 중 오류가 발생했습니다.' }, 500);
  }
});

// 문의 생성
api.post('/inquiries', async (c) => {
  try {
    const body = await c.req.json<{
      phone: string;
      content: string;
    }>();

    if (!body.phone || !body.content) {
      return c.json({ error: '전화번호, 문의내용은 필수입니다.' }, 400);
    }

    if (body.phone.length !== 11 || !/^\d+$/.test(body.phone)) {
      return c.json({ error: '전화번호는 11자리 숫자여야 합니다.' }, 400);
    }

    // 한국 시간대(KST, UTC+9)로 현재 시간 생성
    const created_at = getKSTDateTime();

    // 신청자 확인 (전화번호로 참가자 조회)
    const participant = await c.env.DB.prepare(
      'SELECT user_name FROM participants WHERE phone = ? OR guest2_phone = ? LIMIT 1'
    )
      .bind(body.phone, body.phone)
      .first<{ user_name: string }>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다. 신청 시 사용한 전화번호를 확인해주세요.' }, 400);
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO inquiries (user_name, phone, content, created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(participant.user_name, body.phone, body.content.trim(), created_at)
      .run();

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      message: '문의가 접수되었습니다.',
    });
  } catch (error: any) {
    console.error('Error creating inquiry:', error);
    return c.json({ error: '문의 접수 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 문의 목록 조회
api.get('/admin/inquiries', async (c) => {
  try {
    const inquiries = await c.env.DB.prepare(
      'SELECT * FROM inquiries ORDER BY created_at DESC'
    )
      .all<{
        id: number;
        created_at: string;
        user_name: string;
        phone: string;
        content: string;
        answer: string | null;
        answered_at: string | null;
        is_answered: number;
      }>();

    return c.json({
      success: true,
      inquiries: inquiries.results || [],
    });
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    return c.json({ error: '문의 목록을 불러오는 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 문의 답변
api.put('/admin/inquiries/:id/answer', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      answer: string;
    }>();

    if (!body.answer || !body.answer.trim()) {
      return c.json({ error: '답변 내용을 입력해주세요.' }, 400);
    }

    // 한국 시간대(KST, UTC+9)로 현재 시간 생성
    const answered_at = getKSTDateTime();

    await c.env.DB.prepare(
      'UPDATE inquiries SET answer = ?, answered_at = ?, is_answered = 1 WHERE id = ?'
    )
      .bind(body.answer.trim(), answered_at, id)
      .run();

    return c.json({
      success: true,
      message: '답변이 등록되었습니다.',
    });
  } catch (error) {
    console.error('Error updating inquiry answer:', error);
    return c.json({ error: '답변 등록 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 문의 삭제
api.delete('/admin/inquiries/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    await c.env.DB.prepare('DELETE FROM inquiries WHERE id = ?')
      .bind(id)
      .run();

    return c.json({
      success: true,
      message: '문의가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Error deleting inquiry:', error);
    return c.json({ error: '문의 삭제 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: QR 체크인 (입장 확인)
api.post('/admin/checkin', async (c) => {
  try {
    const body = await c.req.json<{
      qrData: string;
    }>();

    if (!body.qrData) {
      return c.json({ error: 'QR 코드 데이터가 필요합니다.' }, 400);
    }

    // QR 코드 데이터 파싱 (JSON 형식)
    let participantData;
    try {
      participantData = JSON.parse(body.qrData);
    } catch (e) {
      return c.json({ error: '유효하지 않은 QR 코드 형식입니다.' }, 400);
    }

    if (!participantData.id) {
      return c.json({ error: '참가자 ID가 없습니다.' }, 400);
    }

    // 참가자 확인
    const participant = await c.env.DB.prepare(
      'SELECT id, user_name, phone, is_paid, is_checked_in FROM participants WHERE id = ?'
    )
      .bind(participantData.id)
      .first<{
        id: number;
        user_name: string;
        phone: string;
        is_paid: number;
        is_checked_in: number;
      }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    // 입금 확인 여부 확인
    if (!participant.is_paid) {
      return c.json({ 
        error: '입금이 확인되지 않은 참가자입니다.',
        participant: {
          id: participant.id,
          user_name: participant.user_name,
          phone: participant.phone
        }
      }, 400);
    }

    // 이미 체크인된 경우
    if (participant.is_checked_in) {
      return c.json({
        success: true,
        message: '이미 입장 확인된 참가자입니다.',
        participant: {
          id: participant.id,
          user_name: participant.user_name,
          phone: participant.phone,
          is_checked_in: true
        },
        alreadyCheckedIn: true
      });
    }

    // 체크인 처리
    const checkedInAt = getKSTDateTime();
    await c.env.DB.prepare(
      'UPDATE participants SET is_checked_in = 1 WHERE id = ?'
    )
      .bind(participant.id)
      .run();

    return c.json({
      success: true,
      message: '입장 확인되었습니다.',
      participant: {
        id: participant.id,
        user_name: participant.user_name,
        phone: participant.phone,
        is_checked_in: true,
        checked_in_at: checkedInAt
      }
    });
  } catch (error: any) {
    console.error('Error processing check-in:', error);
    return c.json({ error: '입장 확인 처리 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 체크인 상태 조회
api.get('/admin/checkin/stats', async (c) => {
  try {
    const total = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1'
    ).first<{ count: number }>();

    const checkedIn = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1 AND is_checked_in = 1'
    ).first<{ count: number }>();

    return c.json({
      success: true,
      stats: {
        total: total?.count || 0,
        checkedIn: checkedIn?.count || 0,
        remaining: (total?.count || 0) - (checkedIn?.count || 0)
      }
    });
  } catch (error: any) {
    console.error('Error fetching check-in stats:', error);
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500);
  }
});

app.route('/api', api);

// Cloudflare Pages Functions는 onRequest 핸들러를 사용
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  // API 경로만 처리하고, 나머지는 정적 파일로 넘김
  if (url.pathname.startsWith('/api/')) {
    return app.fetch(context.request, context.env, context);
  }

  // 정적 파일은 그대로 제공
  return context.next();
};

