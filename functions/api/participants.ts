// 참가자 관련 라우트

import { Hono } from 'hono';
import type { Env, Participant } from './types';
import { getKSTDateTime, validatePhone, validateSsnFirst } from './utils';

export const participantsRouter = new Hono<{ Bindings: Env }>();

// 참가자 신청
participantsRouter.post('/', async (c) => {
  try {
    // 오픈 상태 체크 (DB 설정 기반)
    const settingResult = await c.env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'is_open'"
    ).first<{ value: string }>();

    const isOpen = settingResult?.value === 'true';
    if (!isOpen) {
      return c.json({ error: '현재 신청이 마감되어 있습니다.' }, 403);
    }

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

// 참가자 수 조회 (ticket_count 합계로 실제 참석자 수 계산)
participantsRouter.get('/count', async (c) => {
  try {
    // 신청 건수
    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE deleted_at IS NULL'
    ).first<{ count: number }>();

    // 실제 참석자 수 (ticket_count 합계)
    const totalResult = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(ticket_count), 0) as total FROM participants WHERE deleted_at IS NULL'
    ).first<{ total: number }>();

    return c.json({
      success: true,
      count: countResult?.count || 0,           // 신청 건수
      totalTickets: totalResult?.total || 0,    // 실제 참석자 수 (좌석 기준)
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

    // 본인 전화번호로 먼저 검색
    let participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(phone)
      .first<Participant>();

    // 본인으로 없으면 동반참가자 전화번호로 검색
    if (!participant) {
      participant = await c.env.DB.prepare(
        'SELECT * FROM participants WHERE guest2_phone = ? AND is_guest2_completed = 1 AND deleted_at IS NULL'
      )
        .bind(phone)
        .first<Participant>();

      if (participant) {
        // 동반참가자로 조회된 경우, 동반참가자 전용 정보 반환
        return c.json({
          success: true,
          participant,
          isGuest: true,  // 동반참가자임을 표시
          guestInfo: {
            name: participant.guest2_name,
            phone: participant.guest2_phone,
            seat: participant.seat_full_2,
            ssn_first: participant.guest2_ssn_first
          }
        });
      }
    }

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    return c.json({ success: true, participant, isGuest: false });
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

    // 본인 전화번호와 동일한지 체크
    if (phone === body.guest2_phone) {
      return c.json({ error: '본인과 동반자의 전화번호가 같을 수 없습니다.' }, 400);
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

    // guest2_phone 중복 체크 강화 (모든 전화번호 필드 확인)
    const existingPhone = await c.env.DB.prepare(
      'SELECT id, user_name, phone, guest2_phone FROM participants WHERE (phone = ? OR guest2_phone = ?) AND deleted_at IS NULL'
    )
      .bind(body.guest2_phone, body.guest2_phone)
      .first<{ id: number; user_name: string; phone: string; guest2_phone: string | null }>();

    if (existingPhone) {
      const isMainPhone = existingPhone.phone === body.guest2_phone;
      const conflictType = isMainPhone ? '주 신청자' : '동반자';
      return c.json({
        error: `이미 다른 신청의 ${conflictType} 전화번호로 사용 중입니다. (신청자: ${existingPhone.user_name})`
      }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE participants SET guest2_name = ?, guest2_phone = ?, guest2_ssn_first = ?, is_guest2_completed = 1 WHERE phone = ? AND deleted_at IS NULL'
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
