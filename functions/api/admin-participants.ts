// 관리자 - 참가자 관리 라우트

import { Hono } from 'hono';
import type { Env, Participant, Seat } from './types';
import { VALID_SEAT_GROUPS } from './types';
import { requireAdmin } from './middleware';
import {
  generateAvailableSeats,
  getAssignedSeats,
  assignSeatsToParticipant,
  shuffleArray
} from './utils';

export const adminParticipantsRouter = new Hono<{ Bindings: Env }>();

// 모든 라우트에 인증 적용
adminParticipantsRouter.use('*', requireAdmin);

// 모든 참가자 조회 (삭제된 참가자 제외, 페이지네이션 및 정렬 지원)
adminParticipantsRouter.get('/', async (c) => {
  try {
    const search = c.req.query('search');
    const includeDeleted = c.req.query('include_deleted') === 'true';
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const sort = c.req.query('sort') || 'created_at';
    const order = c.req.query('order') === 'asc' ? 'ASC' : 'DESC';

    // 허용된 정렬 컬럼
    const allowedSortColumns = ['created_at', 'user_name', 'phone', 'is_paid', 'seat_full', 'seat_group', 'ssn_first', 'is_checked_in', 'id'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';

    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM participants';
    let countQuery = 'SELECT COUNT(*) as count FROM participants';
    const params: string[] = [];
    const conditions: string[] = [];

    // Soft Delete 필터 (기본적으로 삭제된 항목 제외)
    if (!includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (search) {
      conditions.push('(user_name LIKE ? OR phone LIKE ? OR guest2_name LIKE ? OR guest2_phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // LIMIT과 OFFSET을 쿼리에 직접 삽입 (바인딩 문제 회피)
    query += ` ORDER BY ${sortColumn} ${order} LIMIT ${limit} OFFSET ${offset}`;

    // 전체 개수 조회
    const totalResult = await c.env.DB.prepare(countQuery)
      .bind(...params)
      .first<{ count: number }>();

    const total = totalResult?.count || 0;

    // 참가자 목록 조회
    const result = await c.env.DB.prepare(query)
      .bind(...params) // limit, offset 제거
      .all<Participant>();

    return c.json({
      success: true,
      participants: result.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching participants:', error);
    return c.json({
      error: '조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 입금 상태 변경
adminParticipantsRouter.put('/:id/payment', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ is_paid: boolean }>();

    const isPaid = body.is_paid ? 1 : 0;

    await c.env.DB.prepare(
      'UPDATE participants SET is_paid = ? WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(isPaid, id)
      .run();

    console.log(`[Admin] Payment status changed: ID=${id}, is_paid=${isPaid}`);

    return c.json({
      success: true,
      message: '입금 상태가 변경되었습니다.',
      participant: {
        id,
        is_paid: isPaid
      }
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    return c.json({ error: '업데이트 중 오류가 발생했습니다.' }, 500);
  }
});

// 좌석 배정
adminParticipantsRouter.put('/:id/seat', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      seat_group: string;
      seat_row: string;
      seat_number: string;
      is_guest?: boolean;
    }>();

    if (body.seat_group && !VALID_SEAT_GROUPS.includes(body.seat_group as typeof VALID_SEAT_GROUPS[number])) {
      return c.json({ error: '유효하지 않은 그룹입니다. (가~하)' }, 400);
    }

    if (body.seat_row && !/^\d+$/.test(body.seat_row)) {
      return c.json({ error: '열 번호는 숫자만 입력 가능합니다.' }, 400);
    }
    if (body.seat_number && !/^\d+$/.test(body.seat_number)) {
      return c.json({ error: '좌석 번호는 숫자만 입력 가능합니다.' }, 400);
    }

    let seatFull: string | null = null;
    if (body.seat_group && body.seat_row && body.seat_number) {
      seatFull = `${body.seat_group}-${body.seat_row}-${body.seat_number}`;
    }

    if (body.is_guest) {
      await c.env.DB.prepare(
        'UPDATE participants SET seat_group_2 = ?, seat_row_2 = ?, seat_number_2 = ?, seat_full_2 = ? WHERE id = ?'
      )
        .bind(body.seat_group || null, body.seat_row || null, body.seat_number || null, seatFull, id)
        .run();
    } else {
      await c.env.DB.prepare(
        'UPDATE participants SET seat_group = ?, seat_row = ?, seat_number = ?, seat_full = ? WHERE id = ?'
      )
        .bind(body.seat_group || null, body.seat_row || null, body.seat_number || null, seatFull, id)
        .run();
    }

    return c.json({ success: true, message: '좌석이 배정되었습니다.', seat_full: seatFull });
  } catch (error) {
    console.error('Error updating seat:', error);
    return c.json({ error: '좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 개별 참가자 좌석 초기화
adminParticipantsRouter.delete('/:id/seat', async (c) => {
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

// 랜덤 좌석 배정
adminParticipantsRouter.post('/random-seats', async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];
      rowsPerGroup: number;
      seatsPerRow: number;
    }>();

    if (!body.groups || !body.rowsPerGroup || !body.seatsPerRow) {
      return c.json({ error: '그룹, 열 수, 좌석 수는 필수입니다.' }, 400);
    }

    const paidParticipants = await c.env.DB.prepare(
      'SELECT id, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") AND deleted_at IS NULL ORDER BY created_at ASC'
    ).all<{ id: number; ticket_count: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

    const totalSeatsNeeded = paidParticipants.results.reduce((sum, p) => sum + (p.ticket_count || 1), 0);
    const availableSeats = generateAvailableSeats(body.groups, body.rowsPerGroup, body.seatsPerRow);
    const assignedSet = await getAssignedSeats(c.env.DB);

    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.row}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < totalSeatsNeeded) {
      return c.json({
        error: `사용 가능한 좌석(${freeSeats.length}개)이 필요한 좌석 수(${totalSeatsNeeded}개)보다 적습니다.`
      }, 400);
    }

    const shuffledSeats = shuffleArray(freeSeats);

    let assignedCount = 0;
    let seatIndex = 0;

    for (const participant of paidParticipants.results) {
      const ticketCount = participant.ticket_count || 1;

      if (seatIndex >= shuffledSeats.length) break;

      const seat1 = shuffledSeats[seatIndex++];

      if (ticketCount === 2) {
        if (seatIndex >= shuffledSeats.length) {
          return c.json({ error: '2인 신청을 위한 두 번째 좌석이 부족합니다.' }, 400);
        }

        const seat2 = shuffledSeats[seatIndex++];
        await assignSeatsToParticipant(c.env.DB, participant.id, ticketCount, seat1, seat2);
        assignedCount += 2;
      } else {
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

// 연령대별 좌석 배정
adminParticipantsRouter.post('/age-based-seats', async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];
      rowsPerGroup: number;
      seatsPerRow: number;
    }>();

    if (!body.groups || !body.rowsPerGroup || !body.seatsPerRow) {
      return c.json({ error: '그룹, 열 수, 좌석 수는 필수입니다.' }, 400);
    }

    const paidParticipants = await c.env.DB.prepare(
      'SELECT id, ssn_first, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") AND deleted_at IS NULL ORDER BY created_at ASC'
    ).all<{ id: number; ssn_first: string | null; ticket_count: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

    const participantsWithSsn = paidParticipants.results.filter(p => p.ssn_first && p.ssn_first.length >= 2);
    const participantsWithoutSsn = paidParticipants.results.filter(p => !p.ssn_first || p.ssn_first.length < 2);

    if (participantsWithSsn.length === 0) {
      return c.json({ error: '주민번호 앞자리가 있는 입금 완료 참가자가 없습니다.' }, 400);
    }

    // 연령대별 정렬
    participantsWithSsn.sort((a, b) => {
      const yearA = parseInt(a.ssn_first!.substring(0, 2));
      const yearB = parseInt(b.ssn_first!.substring(0, 2));

      const getPriority = (year: number) => {
        if (year >= 0 && year <= 9) return 1;
        if (year >= 90 && year <= 99) return 2;
        if (year >= 80 && year <= 89) return 3;
        return 4;
      };

      const priorityA = getPriority(yearA);
      const priorityB = getPriority(yearB);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return yearA - yearB;
    });

    const sortedParticipants = [...participantsWithSsn, ...participantsWithoutSsn];
    const totalSeatsNeeded = sortedParticipants.reduce((sum, p) => sum + (p.ticket_count || 1), 0);
    const availableSeats = generateAvailableSeats(body.groups, body.rowsPerGroup, body.seatsPerRow);
    const assignedSet = await getAssignedSeats(c.env.DB);

    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.row}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < totalSeatsNeeded) {
      return c.json({
        error: `사용 가능한 좌석(${freeSeats.length}개)이 필요한 좌석 수(${totalSeatsNeeded}개)보다 적습니다.`
      }, 400);
    }

    let assignedCount = 0;
    let seatIndex = 0;

    for (const participant of sortedParticipants) {
      const ticketCount = participant.ticket_count || 1;

      if (seatIndex >= freeSeats.length) break;

      const seat1 = freeSeats[seatIndex++];

      if (ticketCount === 2) {
        if (seatIndex >= freeSeats.length) {
          return c.json({ error: '2인 신청을 위한 두 번째 좌석이 부족합니다.' }, 400);
        }

        const seat2 = freeSeats[seatIndex++];
        await assignSeatsToParticipant(c.env.DB, participant.id, ticketCount, seat1, seat2);
        assignedCount += 2;
      } else {
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

// 전체 좌석 초기화 (확인 토큰 필요)
adminParticipantsRouter.post('/reset-seats', async (c) => {
  try {
    const body = await c.req.json<{ confirmToken: string }>();

    // 확인 토큰 검증
    if (!body.confirmToken || body.confirmToken !== 'RESET_ALL_SEATS_CONFIRM') {
      return c.json({
        error: '좌석 초기화를 위해서는 확인 토큰이 필요합니다.',
        required_token: 'RESET_ALL_SEATS_CONFIRM'
      }, 400);
    }

    // 현재 좌석 배정 수 확인
    const assignedCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE seat_full IS NOT NULL OR seat_full_2 IS NOT NULL'
    ).first<{ count: number }>();

    if (!assignedCount || assignedCount.count === 0) {
      return c.json({
        success: true,
        message: '초기화할 좌석이 없습니다.',
        affected_count: 0
      });
    }

    // 좌석 초기화 실행
    await c.env.DB.prepare(
      'UPDATE participants SET seat_group = NULL, seat_row = NULL, seat_number = NULL, seat_full = NULL, seat_group_2 = NULL, seat_row_2 = NULL, seat_number_2 = NULL, seat_full_2 = NULL'
    ).run();

    console.log(`[Admin] Reset all seats. Affected: ${assignedCount.count} participants`);

    return c.json({
      success: true,
      message: `${assignedCount.count}명의 참가자 좌석이 초기화되었습니다.`,
      affected_count: assignedCount.count
    });
  } catch (error) {
    console.error('Error resetting seats:', error);
    return c.json({ error: '좌석 초기화 중 오류가 발생했습니다.' }, 500);
  }
});

// 좌석 및 입금 상태 전체 리셋 (확인 토큰 필요)
adminParticipantsRouter.post('/reset-all', async (c) => {
  try {
    const body = await c.req.json<{ confirmToken: string }>();

    // 확인 토큰 검증
    if (!body.confirmToken || body.confirmToken !== 'RESET_ALL_DATA_CONFIRM') {
      return c.json({
        error: '전체 리셋을 위해서는 확인 토큰이 필요합니다.',
        required_token: 'RESET_ALL_DATA_CONFIRM'
      }, 400);
    }

    // 영향받는 참가자 수 확인
    const totalCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE deleted_at IS NULL'
    ).first<{ count: number }>();

    // 좌석 및 입금 상태 초기화
    await c.env.DB.prepare(
      'UPDATE participants SET is_paid = 0, seat_group = NULL, seat_row = NULL, seat_number = NULL, seat_full = NULL, seat_group_2 = NULL, seat_row_2 = NULL, seat_number_2 = NULL, seat_full_2 = NULL WHERE deleted_at IS NULL'
    ).run();

    console.log(`[Admin] Reset all seats and payment status. Affected: ${totalCount?.count || 0} participants`);

    return c.json({
      success: true,
      message: `${totalCount?.count || 0}명의 참가자 좌석 및 입금 상태가 초기화되었습니다.`,
      affected_count: totalCount?.count || 0
    });
  } catch (error) {
    console.error('Error resetting all data:', error);
    return c.json({ error: '전체 리셋 중 오류가 발생했습니다.' }, 500);
  }
});


// 참가자 삭제 (Soft Delete)
adminParticipantsRouter.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    const participant = await c.env.DB.prepare(
      'SELECT id, user_name, deleted_at FROM participants WHERE id = ?'
    )
      .bind(id)
      .first<{ id: number; user_name: string; deleted_at: string | null }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    if (participant.deleted_at) {
      return c.json({ error: '이미 삭제된 참가자입니다.' }, 400);
    }

    // Soft Delete: deleted_at 컬럼에 현재 시간 기록
    const deletedAt = new Date().toISOString();
    await c.env.DB.prepare(
      'UPDATE participants SET deleted_at = ? WHERE id = ?'
    )
      .bind(deletedAt, id)
      .run();

    console.log(`[Admin] Soft deleted participant: ID=${id}, Name="${participant.user_name}"`);

    return c.json({
      success: true,
      message: `"${participant.user_name}" 참가자 정보가 삭제되었습니다.`,
      deleted_id: id,
      deleted_at: deletedAt,
      note: '삭제된 데이터는 복구 가능합니다.'
    });
  } catch (error) {
    console.error('Error deleting participant:', error);
    return c.json({ error: '삭제 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 복구 (Soft Delete 취소)
adminParticipantsRouter.post('/:id/restore', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    const participant = await c.env.DB.prepare(
      'SELECT id, user_name, deleted_at FROM participants WHERE id = ?'
    )
      .bind(id)
      .first<{ id: number; user_name: string; deleted_at: string | null }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    if (!participant.deleted_at) {
      return c.json({ error: '삭제되지 않은 참가자입니다.' }, 400);
    }

    // 복구: deleted_at을 NULL로 설정
    await c.env.DB.prepare(
      'UPDATE participants SET deleted_at = NULL WHERE id = ?'
    )
      .bind(id)
      .run();

    console.log(`[Admin] Restored participant: ID=${id}, Name="${participant.user_name}"`);

    return c.json({
      success: true,
      message: `"${participant.user_name}" 참가자 정보가 복구되었습니다.`,
      restored_id: id
    });
  } catch (error) {
    console.error('Error restoring participant:', error);
    return c.json({ error: '복구 중 오류가 발생했습니다.' }, 500);
  }
});
