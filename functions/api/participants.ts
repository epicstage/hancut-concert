// 참가자 관련 라우트

import { Hono } from 'hono';
import type { Env, Participant } from './types';
import { getKSTDateTime, validatePhone, validateSsnFirst } from './utils';

export const participantsRouter = new Hono<{ Bindings: Env }>();

// 참가자 신청
participantsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      user_name: string;
      phone: string;
      ssn_first?: string;
      ticket_count?: number;
    }>();

    if (!body.user_name || !body.phone) {
      return c.json({ error: '이름과 전화번호는 필수입니다.' }, 400);
    }

    // 전화번호 검증
    const phoneValidation = validatePhone(body.phone);
    if (!phoneValidation.valid) {
      return c.json({ error: phoneValidation.error }, 400);
    }

    // 주민번호 검증
    if (body.ssn_first) {
      const ssnValidation = validateSsnFirst(body.ssn_first);
      if (!ssnValidation.valid) {
        return c.json({ error: ssnValidation.error }, 400);
      }
    }

    // ticket_count 검증
    const ticketCount = body.ticket_count || 1;
    if (ticketCount !== 1 && ticketCount !== 2) {
      return c.json({ error: '티켓 수는 1 또는 2만 가능합니다.' }, 400);
    }

    const created_at = getKSTDateTime();

    const result = await c.env.DB.prepare(
      'INSERT INTO participants (user_name, phone, ssn_first, created_at, is_guest2_completed, ticket_count) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(body.user_name.trim(), body.phone, body.ssn_first || null, created_at, 0, ticketCount)
      .run();

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      message: '신청이 완료되었습니다.',
      ticket_count: ticketCount,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: '이미 신청된 전화번호입니다.' }, 400);
    }
    console.error('Error creating participant:', error);
    return c.json({ error: '신청 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 수 조회
participantsRouter.get('/count', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants'
    ).first<{ count: number }>();

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
participantsRouter.get('/phone/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');

    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ?'
    )
      .bind(phone)
      .first<Participant>();

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
participantsRouter.put('/:id/name', async (c) => {
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
participantsRouter.put('/phone/:phone/guest2', async (c) => {
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

    // 전화번호 검증
    const phoneValidation = validatePhone(body.guest2_phone);
    if (!phoneValidation.valid) {
      return c.json({ error: phoneValidation.error }, 400);
    }

    // 주민번호 검증
    const ssnValidation = validateSsnFirst(body.guest2_ssn_first);
    if (!ssnValidation.valid) {
      return c.json({ error: `2번째 참가자 ${ssnValidation.error}` }, 400);
    }

    // guest2_phone 중복 체크
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
