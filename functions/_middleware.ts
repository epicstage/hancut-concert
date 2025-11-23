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

// 관리자: 좌석 구역 및 번호 배정
api.put('/admin/participants/:id/seat', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      seat_zone: string;
      seat_number: string;
    }>();

    const validZones = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    
    if (body.seat_zone && !validZones.includes(body.seat_zone)) {
      return c.json({ error: '유효하지 않은 구역입니다. (가~하)' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE participants SET seat_zone = ?, seat_number = ? WHERE id = ?'
    )
      .bind(body.seat_zone || null, body.seat_number || null, id)
      .run();

    return c.json({ success: true, message: '좌석이 배정되었습니다.' });
  } catch (error) {
    console.error('Error updating seat:', error);
    return c.json({ error: '좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 참가자 삭제
api.delete('/admin/participants/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    await c.env.DB.prepare('DELETE FROM participants WHERE id = ?')
      .bind(id)
      .run();

    return c.json({ success: true, message: '삭제되었습니다.' });
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
      'SELECT seat_zone, seat_number FROM participants WHERE phone = ?'
    )
      .bind(phone)
      .first<{ seat_zone: string | null; seat_number: string | null }>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    if (!participant.seat_zone || !participant.seat_number) {
      return c.json({ error: '아직 좌석이 배정되지 않았습니다.' }, 404);
    }

    return c.json({
      success: true,
      seat: `${participant.seat_zone}구역 ${participant.seat_number}번`,
      seat_zone: participant.seat_zone,
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

