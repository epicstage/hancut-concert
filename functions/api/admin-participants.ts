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

// 모든 참가자 조회
adminParticipantsRouter.get('/', async (c) => {
  try {
    const search = c.req.query('search');

    let query = 'SELECT * FROM participants';
    const params: string[] = [];

    if (search) {
      query += ' WHERE user_name LIKE ? OR phone LIKE ? OR guest2_name LIKE ? OR guest2_phone LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all<Participant>();

    return c.json({ success: true, participants: result.results || [] });
  } catch (error) {
    console.error('Error fetching participants:', error);
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 입금 상태 변경
adminParticipantsRouter.put('/:id/payment', async (c) => {
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
      'SELECT id, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") ORDER BY created_at ASC'
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
      'SELECT id, ssn_first, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") ORDER BY created_at ASC'
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

// 전체 좌석 초기화
adminParticipantsRouter.post('/reset-seats', async (c) => {
  try {
    await c.env.DB.prepare(
      'UPDATE participants SET seat_group = NULL, seat_row = NULL, seat_number = NULL, seat_full = NULL, seat_group_2 = NULL, seat_row_2 = NULL, seat_number_2 = NULL, seat_full_2 = NULL'
    ).run();

    return c.json({
      success: true,
      message: '모든 참가자의 좌석이 초기화되었습니다.'
    });
  } catch (error) {
    console.error('Error resetting seats:', error);
    return c.json({ error: '좌석 초기화 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 삭제
adminParticipantsRouter.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    const participant = await c.env.DB.prepare('SELECT id, user_name FROM participants WHERE id = ?')
      .bind(id)
      .first<{ id: number; user_name: string }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

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
