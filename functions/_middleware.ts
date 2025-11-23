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

// API 라우트
const api = new Hono<{ Bindings: Env }>();

// 참가자 신청
api.post('/participants', async (c) => {
  try {
    const body = await c.req.json<{
      user_name: string;
      phone: string;
    }>();

    if (!body.user_name || !body.phone) {
      return c.json({ error: '이름과 전화번호는 필수입니다.' }, 400);
    }

    if (body.phone.length !== 11 || !/^\d+$/.test(body.phone)) {
      return c.json({ error: '전화번호는 11자리 숫자여야 합니다.' }, 400);
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO participants (user_name, phone) VALUES (?, ?)'
    )
      .bind(body.user_name.trim(), body.phone)
      .run();

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      message: '신청이 완료되었습니다.',
    });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ error: '이미 신청된 전화번호입니다.' }, 400);
    }
    console.error('Error creating participant:', error);
    return c.json({ error: '신청 중 오류가 발생했습니다.' }, 500);
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

// 관리자: 모든 참가자 조회
api.get('/admin/participants', async (c) => {
  try {
    const search = c.req.query('search');

    let query = 'SELECT * FROM participants';
    let params: any[] = [];

    if (search) {
      query += ' WHERE user_name LIKE ? OR phone LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
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
api.put('/admin/participants/:id/payment', async (c) => {
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
api.put('/admin/participants/:id/seat', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      seat_group: string;
      seat_row: string;
      seat_number: string;
    }>();

    const validGroups = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    
    if (body.seat_group && !validGroups.includes(body.seat_group)) {
      return c.json({ error: '유효하지 않은 그룹입니다. (가~하)' }, 400);
    }

    // 전체 좌석 번호 생성 (가-2-5 형태)
    let seatFull = null;
    if (body.seat_group && body.seat_row && body.seat_number) {
      seatFull = `${body.seat_group}-${body.seat_row}-${body.seat_number}`;
    }

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

    return c.json({ success: true, message: '좌석이 배정되었습니다.', seat_full: seatFull });
  } catch (error) {
    console.error('Error updating seat:', error);
    return c.json({ error: '좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 랜덤 좌석 배정 (입금 완료된 참가자들)
api.post('/admin/participants/random-seats', async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];  // ['가', '나', ...]
      rowsPerGroup: number;  // 그룹당 열 수
      seatsPerRow: number;   // 열당 좌석 수
    }>();

    if (!body.groups || !body.rowsPerGroup || !body.seatsPerRow) {
      return c.json({ error: '그룹, 열 수, 좌석 수는 필수입니다.' }, 400);
    }

    // 입금 완료된 참가자 조회
    const paidParticipants = await c.env.DB.prepare(
      'SELECT id FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") ORDER BY created_at ASC'
    )
      .all<{ id: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

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

    // 이미 배정된 좌석 조회
    const assignedSeats = await c.env.DB.prepare(
      'SELECT seat_full FROM participants WHERE seat_full IS NOT NULL AND seat_full != ""'
    )
      .all<{ seat_full: string }>();

    const assignedSet = new Set(assignedSeats.results?.map(s => s.seat_full) || []);

    // 사용 가능한 좌석만 필터링
    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.row}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < paidParticipants.results.length) {
      return c.json({ 
        error: `사용 가능한 좌석(${freeSeats.length}개)이 참가자 수(${paidParticipants.results.length}명)보다 적습니다.` 
      }, 400);
    }

    // 랜덤 셔플
    for (let i = freeSeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [freeSeats[i], freeSeats[j]] = [freeSeats[j], freeSeats[i]];
    }

    // 좌석 배정
    let assignedCount = 0;
    for (let i = 0; i < paidParticipants.results.length && i < freeSeats.length; i++) {
      const participant = paidParticipants.results[i];
      const seat = freeSeats[i];
      const seatFull = `${seat.group}-${seat.row}-${seat.number}`;

      await c.env.DB.prepare(
        'UPDATE participants SET seat_group = ?, seat_row = ?, seat_number = ?, seat_full = ? WHERE id = ?'
      )
        .bind(seat.group, seat.row, seat.number, seatFull, participant.id)
        .run();

      assignedCount++;
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

// 관리자: 참가자 삭제 (아무때나 삭제 가능)
api.delete('/admin/participants/:id', async (c) => {
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

