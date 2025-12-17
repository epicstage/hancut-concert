// 참가자 관련 라우트

import { Hono } from 'hono';
import type { Env, Participant } from './types';
import { getKSTDateTime, validatePhone, validateSsnFirst } from './utils';

export const participantsRouter = new Hono<{ Bindings: Env }>();

// 최대 참석자 수 (좌석 수) - 무제한 (수동 마감)
const MAX_CAPACITY = 999999;

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

    // 현재 총 참석자 수 체크 (ticket_count 합계)
    const totalResult = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(ticket_count), 0) as total FROM participants WHERE deleted_at IS NULL'
    ).first<{ total: number }>();

    const currentTotal = totalResult?.total || 0;
    if (currentTotal >= MAX_CAPACITY) {
      // 자동으로 마감 처리
      await c.env.DB.prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('is_open', 'false', datetime('now'))"
      ).run();
      return c.json({ error: '1차 오픈이 마감되었습니다. 여석이 발생하는 경우 2차 오픈이 진행될 수 있습니다.' }, 403);
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

    // 신청 후 정원 초과 여부 체크
    if (currentTotal + ticketCount > MAX_CAPACITY) {
      const remaining = MAX_CAPACITY - currentTotal;
      if (remaining <= 0) {
        return c.json({ error: '1차 오픈이 마감되었습니다. 여석이 발생하는 경우 2차 오픈이 진행될 수 있습니다.' }, 403);
      }
      return c.json({ error: `남은 좌석이 ${remaining}석입니다. ${ticketCount}인 신청이 불가합니다.` }, 400);
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

// 참가자 조회 (전화번호 + 비밀번호 인증)
participantsRouter.post('/verify', async (c) => {
  try {
    const body = await c.req.json<{ phone: string; password: string }>();

    if (!body.phone || !body.password) {
      return c.json({ error: '전화번호와 비밀번호를 입력해주세요.' }, 400);
    }

    // 전화번호 정규화 (숫자만 추출)
    const normalizedPhone = body.phone.replace(/\D/g, '');
    const inputPassword = body.password.trim();
    let isGuest = false;
    let participant: Participant | null = null;

    // 1. 활성 상태(취소/삭제 안 된) 본인 전화번호로 먼저 검색
    participant = await c.env.DB.prepare(
      "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', '') = ? AND deleted_at IS NULL AND is_cancelled = 0"
    )
      .bind(normalizedPhone)
      .first<Participant>();

    // 2. 없으면 활성 상태 동반참가자 전화번호로 검색
    if (!participant) {
      participant = await c.env.DB.prepare(
        "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(guest2_phone, ' ', ''), '-', ''), '.', '') = ? AND is_guest2_completed = 1 AND deleted_at IS NULL AND is_cancelled = 0"
      )
        .bind(normalizedPhone)
        .first<Participant>();

      if (participant) {
        isGuest = true;
      }
    }

    // 3. 그래도 없으면 취소/삭제된 본인 신청 검색 (개인정보 동의 수집용)
    if (!participant) {
      participant = await c.env.DB.prepare(
        "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', '') = ?"
      )
        .bind(normalizedPhone)
        .first<Participant>();
    }

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    // 비밀번호 검증
    // 동반자와 본인은 각각 별도의 비밀번호 관리
    let isValidPassword = false;

    if (isGuest) {
      // 동반자의 경우: guest2_password가 있으면 그것과 비교, 없으면 guest2_ssn_first와 비교
      if (participant.guest2_password) {
        isValidPassword = participant.guest2_password === inputPassword;
      } else {
        isValidPassword = participant.guest2_ssn_first === inputPassword;
      }
    } else {
      // 본인의 경우: password가 있으면 그것과 비교, 없으면 ssn_first와 비교
      if (participant.password) {
        isValidPassword = participant.password === inputPassword;
      } else {
        isValidPassword = participant.ssn_first === inputPassword;
      }
    }

    if (!isValidPassword) {
      return c.json({ error: '비밀번호가 일치하지 않습니다.' }, 401);
    }

    // 동반참가자로 조회된 경우
    if (isGuest) {
      return c.json({
        success: true,
        participant,
        isGuest: true,
        guestInfo: {
          name: participant.guest2_name,
          phone: participant.guest2_phone,
          seat: participant.seat_full_2,
          ssn_first: participant.guest2_ssn_first
        }
      });
    }

    return c.json({ success: true, participant, isGuest: false });
  } catch (error) {
    console.error('Error verifying participant:', error);
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 비밀번호 변경
participantsRouter.put('/password', async (c) => {
  try {
    const body = await c.req.json<{
      phone: string;
      current_password: string;
      new_password: string;
    }>();

    if (!body.phone || !body.current_password || !body.new_password) {
      return c.json({ error: '모든 필드를 입력해주세요.' }, 400);
    }

    // 비밀번호 형식 검증 (숫자 6자리)
    if (!/^\d{6}$/.test(body.new_password)) {
      return c.json({ error: '비밀번호는 숫자 6자리로 입력해주세요.' }, 400);
    }

    const normalizedPhone = body.phone.replace(/\D/g, '');

    // 참가자 조회
    const participant = await c.env.DB.prepare(
      "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', '') = ? AND deleted_at IS NULL"
    )
      .bind(normalizedPhone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    // 현재 비밀번호 검증
    let isValidPassword = false;
    if (participant.password) {
      isValidPassword = participant.password === body.current_password;
    } else {
      // 초기 비밀번호 = 생년월일
      isValidPassword = participant.ssn_first === body.current_password;
    }

    if (!isValidPassword) {
      return c.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, 401);
    }

    // 새 비밀번호 저장
    await c.env.DB.prepare(
      'UPDATE participants SET password = ? WHERE id = ?'
    )
      .bind(body.new_password, participant.id)
      .run();

    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    console.error('Error changing password:', error);
    return c.json({ error: '비밀번호 변경 중 오류가 발생했습니다.' }, 500);
  }
});

// 동반자 비밀번호 변경
participantsRouter.put('/guest-password', async (c) => {
  try {
    const body = await c.req.json<{
      phone: string;
      current_password: string;
      new_password: string;
    }>();

    if (!body.phone || !body.current_password || !body.new_password) {
      return c.json({ error: '모든 필드를 입력해주세요.' }, 400);
    }

    // 비밀번호 형식 검증 (숫자 6자리)
    if (!/^\d{6}$/.test(body.new_password)) {
      return c.json({ error: '비밀번호는 숫자 6자리로 입력해주세요.' }, 400);
    }

    const normalizedPhone = body.phone.replace(/\D/g, '');

    // 동반자 전화번호로 참가자 조회
    const participant = await c.env.DB.prepare(
      "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(guest2_phone, ' ', ''), '-', ''), '.', '') = ? AND is_guest2_completed = 1 AND deleted_at IS NULL AND is_cancelled = 0"
    )
      .bind(normalizedPhone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '동반참가자 정보를 찾을 수 없습니다.' }, 404);
    }

    // 현재 비밀번호 검증
    let isValidPassword = false;
    if (participant.guest2_password) {
      isValidPassword = participant.guest2_password === body.current_password;
    } else {
      // 초기 비밀번호 = 동반자 생년월일
      isValidPassword = participant.guest2_ssn_first === body.current_password;
    }

    if (!isValidPassword) {
      return c.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, 401);
    }

    // 새 비밀번호 저장
    await c.env.DB.prepare(
      'UPDATE participants SET guest2_password = ? WHERE id = ?'
    )
      .bind(body.new_password, participant.id)
      .run();

    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    console.error('Error changing guest password:', error);
    return c.json({ error: '비밀번호 변경 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 조회 (전화번호로) - 기존 호환용 (deprecated, 추후 제거 예정)
participantsRouter.get('/phone/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');
    // 전화번호 정규화 (숫자만 추출)
    const normalizedPhone = phone.replace(/\D/g, '');

    // 본인 전화번호로 먼저 검색 (DB의 전화번호도 정규화하여 비교)
    let participant = await c.env.DB.prepare(
      "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', '') = ? AND deleted_at IS NULL"
    )
      .bind(normalizedPhone)
      .first<Participant>();

    // 본인으로 없으면 동반참가자 전화번호로 검색
    if (!participant) {
      participant = await c.env.DB.prepare(
        "SELECT * FROM participants WHERE REPLACE(REPLACE(REPLACE(guest2_phone, ' ', ''), '-', ''), '.', '') = ? AND is_guest2_completed = 1 AND deleted_at IS NULL"
      )
        .bind(normalizedPhone)
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

// 참가자 본인 정보 수정 (이름, 생년월일, 동반자 정보)
participantsRouter.put('/phone/:phone/update', async (c) => {
  try {
    const phone = c.req.param('phone');
    const body = await c.req.json<{
      user_name?: string;
      ssn_first?: string;
      guest2_name?: string;
      guest2_phone?: string;
      guest2_ssn_first?: string;
    }>();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(phone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    // 업데이트할 필드 준비
    const updates: string[] = [];
    const values: (string | null | number)[] = [];

    // 본인 이름 수정
    if (body.user_name !== undefined) {
      if (!body.user_name.trim()) {
        return c.json({ error: '이름은 필수입니다.' }, 400);
      }
      updates.push('user_name = ?');
      values.push(body.user_name.trim());
    }

    // 본인 생년월일 수정
    if (body.ssn_first !== undefined) {
      if (body.ssn_first) {
        const ssnValidation = validateSsnFirst(body.ssn_first);
        if (!ssnValidation.valid) {
          return c.json({ error: ssnValidation.error }, 400);
        }
      }
      updates.push('ssn_first = ?');
      values.push(body.ssn_first ? body.ssn_first.trim() : null);
    }

    // 동반자 이름 수정
    if (body.guest2_name !== undefined) {
      updates.push('guest2_name = ?');
      values.push(body.guest2_name ? body.guest2_name.trim() : null);
    }

    // 동반자 전화번호 수정
    if (body.guest2_phone !== undefined) {
      if (body.guest2_phone) {
        // 본인 전화번호와 동일한지 체크
        if (phone === body.guest2_phone) {
          return c.json({ error: '본인과 동반자의 전화번호가 같을 수 없습니다.' }, 400);
        }

        // 전화번호 검증
        const phoneValidation = validatePhone(body.guest2_phone);
        if (!phoneValidation.valid) {
          return c.json({ error: `동반자 ${phoneValidation.error}` }, 400);
        }

        // 동반자 전화번호 중복 확인 (본인 제외)
        const existingPhone = await c.env.DB.prepare(
          'SELECT id, user_name FROM participants WHERE (phone = ? OR guest2_phone = ?) AND phone != ? AND deleted_at IS NULL'
        )
          .bind(body.guest2_phone, body.guest2_phone, phone)
          .first<{ id: number; user_name: string }>();

        if (existingPhone) {
          return c.json({
            error: `동반자 전화번호가 이미 다른 신청에서 사용 중입니다. (신청자: ${existingPhone.user_name})`
          }, 400);
        }
      }
      updates.push('guest2_phone = ?');
      values.push(body.guest2_phone ? body.guest2_phone.trim() : null);
    }

    // 동반자 생년월일 수정
    if (body.guest2_ssn_first !== undefined) {
      if (body.guest2_ssn_first) {
        const ssnValidation = validateSsnFirst(body.guest2_ssn_first);
        if (!ssnValidation.valid) {
          return c.json({ error: `동반자 ${ssnValidation.error}` }, 400);
        }
      }
      updates.push('guest2_ssn_first = ?');
      values.push(body.guest2_ssn_first ? body.guest2_ssn_first.trim() : null);
    }

    // 동반자 정보가 모두 입력되었는지 확인하여 is_guest2_completed 업데이트
    if (body.guest2_name !== undefined || body.guest2_phone !== undefined || body.guest2_ssn_first !== undefined) {
      const newGuest2Name = body.guest2_name !== undefined ? body.guest2_name : participant.guest2_name;
      const newGuest2Phone = body.guest2_phone !== undefined ? body.guest2_phone : participant.guest2_phone;
      const newGuest2Ssn = body.guest2_ssn_first !== undefined ? body.guest2_ssn_first : participant.guest2_ssn_first;

      const isComplete = !!(newGuest2Name && newGuest2Phone && newGuest2Ssn);
      updates.push('is_guest2_completed = ?');
      values.push(isComplete ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json({ error: '수정할 항목이 없습니다.' }, 400);
    }

    // 업데이트 실행
    values.push(phone);
    await c.env.DB.prepare(
      `UPDATE participants SET ${updates.join(', ')} WHERE phone = ? AND deleted_at IS NULL`
    )
      .bind(...values)
      .run();

    return c.json({
      success: true,
      message: '정보가 수정되었습니다.'
    });
  } catch (error) {
    console.error('Error updating participant info:', error);
    return c.json({ error: '정보 수정 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 본인 취소 신청
participantsRouter.post('/phone/:phone/cancel', async (c) => {
  try {
    // 취소 마감 체크 (2025년 12월 14일 자정 이후 취소 불가)
    const now = new Date();
    const cancelDeadline = new Date('2025-12-14T00:00:00+09:00');
    if (now >= cancelDeadline) {
      return c.json({ error: '취소 신청 기간이 마감되었습니다. (12월 14일 이후 취소 불가)' }, 400);
    }

    const phone = c.req.param('phone');
    const body = await c.req.json<{
      cancel_reason?: string;
      refund_amount?: number;
      refund_bank?: string;
      refund_account?: string;
      refund_holder?: string;
    }>();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(phone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    if (participant.is_cancelled) {
      return c.json({ error: '이미 취소된 신청입니다.' }, 400);
    }

    // 환불 계좌 정보 검증 (입금한 경우 필수)
    if (participant.is_paid) {
      if (!body.refund_bank || !body.refund_account || !body.refund_holder) {
        return c.json({ error: '환불받을 계좌 정보를 모두 입력해주세요.' }, 400);
      }
    }

    const cancelledAt = getKSTDateTime();

    // 취소 처리
    await c.env.DB.prepare(
      `UPDATE participants SET
        is_cancelled = 1,
        cancelled_at = ?,
        cancel_reason = ?,
        refund_amount = ?,
        refund_bank = ?,
        refund_account = ?,
        refund_holder = ?,
        refund_status = ?
      WHERE phone = ? AND deleted_at IS NULL`
    )
      .bind(
        cancelledAt,
        body.cancel_reason || '본인 취소',
        body.refund_amount || null,
        body.refund_bank || null,
        body.refund_account || null,
        body.refund_holder || null,
        participant.is_paid ? 'pending' : null,
        phone
      )
      .run();

    return c.json({
      success: true,
      message: '신청이 취소되었습니다.' + (participant.is_paid ? ' 환불은 입력하신 계좌로 진행됩니다.' : '')
    });
  } catch (error) {
    console.error('Error cancelling participant:', error);
    return c.json({ error: '취소 처리 중 오류가 발생했습니다.' }, 500);
  }
});

// 동반자만 취소 (2인 → 1인 변경)
participantsRouter.post('/phone/:phone/cancel-guest2', async (c) => {
  try {
    // 취소 마감 체크 (2025년 12월 14일 자정 이후 취소 불가)
    const now = new Date();
    const cancelDeadline = new Date('2025-12-14T00:00:00+09:00');
    if (now >= cancelDeadline) {
      return c.json({ error: '취소 신청 기간이 마감되었습니다. (12월 14일 이후 취소 불가)' }, 400);
    }

    const phone = c.req.param('phone');
    const body = await c.req.json<{
      refund_amount?: number;
      refund_bank?: string;
      refund_account?: string;
      refund_holder?: string;
    }>();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(phone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    if (participant.ticket_count !== 2) {
      return c.json({ error: '2인 신청이 아닙니다.' }, 400);
    }

    if (participant.is_cancelled) {
      return c.json({ error: '이미 취소된 신청입니다.' }, 400);
    }

    // 입금한 경우 환불 계좌 필수
    if (participant.is_paid) {
      if (!body.refund_bank || !body.refund_account || !body.refund_holder) {
        return c.json({ error: '환불받을 계좌 정보를 모두 입력해주세요.' }, 400);
      }
    }

    // 동반자 정보 초기화 및 ticket_count를 1로 변경
    await c.env.DB.prepare(
      `UPDATE participants SET
        ticket_count = 1,
        guest2_name = NULL,
        guest2_phone = NULL,
        guest2_ssn_first = NULL,
        is_guest2_completed = 0,
        seat_group_2 = NULL,
        seat_row_2 = NULL,
        seat_number_2 = NULL,
        seat_full_2 = NULL,
        refund_amount = ?,
        refund_bank = ?,
        refund_account = ?,
        refund_holder = ?,
        refund_status = ?
      WHERE phone = ? AND deleted_at IS NULL`
    )
      .bind(
        body.refund_amount || null,
        body.refund_bank || null,
        body.refund_account || null,
        body.refund_holder || null,
        participant.is_paid ? 'pending' : null,
        phone
      )
      .run();

    return c.json({
      success: true,
      message: '동반자 신청이 취소되었습니다. (2인 → 1인)' + (participant.is_paid ? ' 차액 환불은 입력하신 계좌로 진행됩니다.' : '')
    });
  } catch (error) {
    console.error('Error cancelling guest2:', error);
    return c.json({ error: '동반자 취소 처리 중 오류가 발생했습니다.' }, 500);
  }
});

// 본인 정보 수정 (전화번호, 생년월일만 - 이름은 불가)
participantsRouter.put('/phone/:phone/update-self', async (c) => {
  try {
    const currentPhone = c.req.param('phone');
    const body = await c.req.json<{
      phone: string;
      ssn_first: string | null;
    }>();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(currentPhone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    // 전화번호 유효성 검사
    if (body.phone) {
      const phoneValidation = validatePhone(body.phone);
      if (!phoneValidation.valid) {
        return c.json({ error: phoneValidation.error }, 400);
      }

      // 새 전화번호가 이미 사용 중인지 확인 (본인 제외)
      if (body.phone !== currentPhone) {
        const existingParticipant = await c.env.DB.prepare(
          'SELECT id FROM participants WHERE phone = ? AND deleted_at IS NULL AND id != ?'
        )
          .bind(body.phone, participant.id)
          .first();

        if (existingParticipant) {
          return c.json({ error: '이미 사용 중인 전화번호입니다.' }, 400);
        }
      }
    }

    // 주민번호 유효성 검사
    if (body.ssn_first) {
      const ssnValidation = validateSsnFirst(body.ssn_first);
      if (!ssnValidation.valid) {
        return c.json({ error: ssnValidation.error }, 400);
      }
    }

    // 업데이트 쿼리 구성
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (body.phone && body.phone !== currentPhone) {
      updates.push('phone = ?');
      values.push(body.phone);
    }

    if (body.ssn_first !== undefined) {
      updates.push('ssn_first = ?');
      values.push(body.ssn_first);
    }

    if (updates.length === 0) {
      return c.json({ error: '수정할 항목이 없습니다.' }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE participants SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values, participant.id)
      .run();

    return c.json({
      success: true,
      message: '정보가 수정되었습니다.'
    });
  } catch (error) {
    console.error('Error updating self info:', error);
    return c.json({ error: '정보 수정 중 오류가 발생했습니다.' }, 500);
  }
});

// 환불 계좌 정보 업데이트 (중복입금 등)
participantsRouter.put('/phone/:phone/refund-account', async (c) => {
  try {
    const phone = c.req.param('phone');
    const body = await c.req.json<{
      refund_amount: number;
      refund_bank: string;
      refund_account: string;
      refund_holder: string;
      refund_reason?: string;
    }>();

    if (!body.refund_amount || !body.refund_bank || !body.refund_account || !body.refund_holder) {
      return c.json({ error: '환불 정보를 모두 입력해주세요.' }, 400);
    }

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(phone)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다.' }, 404);
    }

    // 환불 정보 업데이트
    await c.env.DB.prepare(
      `UPDATE participants SET
        refund_amount = ?,
        refund_bank = ?,
        refund_account = ?,
        refund_holder = ?,
        refund_reason = ?,
        refund_status = 'pending'
      WHERE phone = ? AND deleted_at IS NULL`
    )
      .bind(
        body.refund_amount,
        body.refund_bank,
        body.refund_account,
        body.refund_holder,
        body.refund_reason || null,
        phone
      )
      .run();

    return c.json({
      success: true,
      message: '환불 계좌 정보가 등록되었습니다. 확인 후 환불 처리됩니다.'
    });
  } catch (error) {
    console.error('Error updating refund account:', error);
    return c.json({ error: '환불 계좌 등록 중 오류가 발생했습니다.' }, 500);
  }
});

// 환불/취소 목록 조회 (관리자용)
participantsRouter.get('/refunds', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT * FROM participants
       WHERE deleted_at IS NULL
         AND (is_cancelled = 1 OR refund_status IS NOT NULL)
       ORDER BY
         CASE WHEN refund_status = 'pending' THEN 0 ELSE 1 END,
         cancelled_at DESC,
         created_at DESC`
    ).all<Participant>();

    return c.json({
      success: true,
      data: result.results
    });
  } catch (error) {
    console.error('Error fetching refunds:', error);
    return c.json({ error: '환불 목록을 불러오는데 실패했습니다.' }, 500);
  }
});

// 환불 완료 처리 (관리자용)
participantsRouter.put('/:id/refund-complete', async (c) => {
  try {
    const id = c.req.param('id');
    const refundCompletedAt = getKSTDateTime();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(id)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    if (participant.refund_status !== 'pending') {
      return c.json({ error: '환불 대기 상태가 아닙니다.' }, 400);
    }

    // 환불 완료 처리
    await c.env.DB.prepare(
      `UPDATE participants SET
        refund_status = 'completed',
        refund_completed_at = ?
      WHERE id = ?`
    )
      .bind(refundCompletedAt, id)
      .run();

    return c.json({
      success: true,
      message: '환불 완료 처리되었습니다.'
    });
  } catch (error) {
    console.error('Error completing refund:', error);
    return c.json({ error: '환불 완료 처리 중 오류가 발생했습니다.' }, 500);
  }
});

// 개인정보 수집 동의
participantsRouter.put('/privacy-agree', async (c) => {
  try {
    const body = await c.req.json<{
      phone: string;
    }>();

    if (!body.phone) {
      return c.json({ error: '전화번호는 필수입니다.' }, 400);
    }

    const phone = body.phone.replace(/\D/g, '');

    // 참가자 조회 (본인 또는 동반자 - 취소/환불 여부 상관없이)
    const participant = await c.env.DB.prepare(`
      SELECT id, user_name, phone, guest2_phone
      FROM participants
      WHERE (REPLACE(REPLACE(phone, '-', ''), ' ', '') = ?
             OR REPLACE(REPLACE(guest2_phone, '-', ''), ' ', '') = ?)
      LIMIT 1
    `)
      .bind(phone, phone)
      .first<{ id: number; user_name: string; phone: string; guest2_phone: string | null }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    const agreedAt = getKSTDateTime();

    // 본인 전화번호인 경우
    const normalizedParticipantPhone = participant.phone.replace(/\D/g, '');
    const normalizedGuest2Phone = participant.guest2_phone?.replace(/\D/g, '') || '';

    if (normalizedParticipantPhone === phone) {
      // 본인 동의
      await c.env.DB.prepare(`
        UPDATE participants
        SET privacy_agreed = 1, privacy_agreed_at = ?
        WHERE id = ?
      `)
        .bind(agreedAt, participant.id)
        .run();
      console.log(`[Privacy] Main participant agreed: phone=${phone}, participant_id=${participant.id}, at=${agreedAt}`);
    } else if (normalizedGuest2Phone === phone) {
      // 동반자 동의
      await c.env.DB.prepare(`
        UPDATE participants
        SET guest2_privacy_agreed = 1, guest2_privacy_agreed_at = ?
        WHERE id = ?
      `)
        .bind(agreedAt, participant.id)
        .run();
      console.log(`[Privacy] Guest2 agreed: phone=${phone}, participant_id=${participant.id}, at=${agreedAt}`);
    }

    return c.json({
      success: true,
      message: '개인정보 수집에 동의하셨습니다.'
    });
  } catch (error) {
    console.error('Error privacy agree:', error);
    return c.json({ error: '동의 처리 중 오류가 발생했습니다.' }, 500);
  }
});
