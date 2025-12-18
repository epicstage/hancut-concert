// 관리자 - 참가자 관리 라우트

import { Hono } from 'hono';
import type { Env, Participant, Seat } from './types';
import { VALID_SEAT_GROUPS } from './types';
import { requireAdmin } from './middleware';
import {
  generateAvailableSeats,
  getAssignedSeats,
  assignSeatsToParticipant,
  shuffleArray,
  findPairSeatsInSameGroup
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
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100000);
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

// ==================== 입금 내역 관리 API ====================
// 주의: /:id 패턴보다 먼저 정의해야 함

// 입금 내역 전체 조회
adminParticipantsRouter.get('/payment-records', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT * FROM payment_records ORDER BY row_index ASC
    `).all();

    return c.json({
      success: true,
      records: result.results || []
    });
  } catch (error) {
    console.error('Error fetching payment records:', error);
    return c.json({ error: '입금 내역 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 입금 내역 전체 저장 (기존 데이터 삭제 후 새로 저장, 중복 제거)
adminParticipantsRouter.post('/payment-records/sync', async (c) => {
  try {
    const body = await c.req.json();
    const records = body.records || [];

    // 중복 제거: 모든 주요 필드가 동일한 경우에만 중복으로 판단
    const seen = new Set<string>();
    const uniqueRecords = records.filter((record: any) => {
      // 모든 주요 필드를 조합하여 고유 키 생성
      const key = `${record.date || ''}|${record.type || ''}|${record.amount || ''}|${record.balance || ''}|${record.transactionType || ''}|${record.content || ''}|${record.memo || ''}`;
      if (seen.has(key)) {
        return false; // 완전히 동일한 행만 중복으로 제외
      }
      seen.add(key);
      return true;
    });

    const duplicateCount = records.length - uniqueRecords.length;

    // 기존 데이터 삭제
    await c.env.DB.prepare('DELETE FROM payment_records').run();

    // 새 데이터 배치 삽입 (100개씩 나눠서)
    if (uniqueRecords.length > 0) {
      const batchSize = 100;
      for (let batchStart = 0; batchStart < uniqueRecords.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, uniqueRecords.length);
        const batch = uniqueRecords.slice(batchStart, batchEnd);

        const statements = batch.map((record: any, idx: number) => {
          const i = batchStart + idx;
          return c.env.DB.prepare(`
            INSERT INTO payment_records (
              row_index, date, type, amount, balance, transaction_type,
              content, memo, matched_name, matched_phone_last4,
              matched_participant_id, approved
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            i,
            record.date || '',
            record.type || '',
            record.amount || '',
            record.balance || '',
            record.transactionType || '',
            record.content || '',
            record.memo || '',
            record.matchedName || '',
            record.matchedPhoneLast4 || '',
            record.matchedParticipantId || null,
            record.approved ? 1 : 0
          );
        });

        await c.env.DB.batch(statements);
      }
    }

    let message = `${uniqueRecords.length}개의 입금 내역이 저장되었습니다.`;
    if (duplicateCount > 0) {
      message += ` (중복 ${duplicateCount}개 제거됨)`;
    }

    return c.json({
      success: true,
      message,
      savedCount: uniqueRecords.length,
      duplicateCount
    });
  } catch (error) {
    console.error('Error syncing payment records:', error);
    return c.json({ error: '입금 내역 저장 중 오류가 발생했습니다.' }, 500);
  }
});

// 입금 내역 단건 업데이트 (승인 상태 변경 등)
adminParticipantsRouter.put('/payment-records/:index', async (c) => {
  try {
    const index = parseInt(c.req.param('index'));
    const body = await c.req.json();

    await c.env.DB.prepare(`
      UPDATE payment_records SET
        date = ?,
        type = ?,
        amount = ?,
        balance = ?,
        transaction_type = ?,
        content = ?,
        memo = ?,
        matched_name = ?,
        matched_phone_last4 = ?,
        matched_participant_id = ?,
        approved = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE row_index = ?
    `).bind(
      body.date || '',
      body.type || '',
      body.amount || '',
      body.balance || '',
      body.transactionType || '',
      body.content || '',
      body.memo || '',
      body.matchedName || '',
      body.matchedPhoneLast4 || '',
      body.matchedParticipantId || null,
      body.approved ? 1 : 0,
      index
    ).run();

    return c.json({
      success: true,
      message: '입금 내역이 업데이트되었습니다.'
    });
  } catch (error) {
    console.error('Error updating payment record:', error);
    return c.json({ error: '입금 내역 업데이트 중 오류가 발생했습니다.' }, 500);
  }
});

// 입금 내역 전체 삭제 (초기화)
adminParticipantsRouter.delete('/payment-records', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM payment_records').run();

    return c.json({
      success: true,
      message: '입금 내역이 초기화되었습니다.'
    });
  } catch (error) {
    console.error('Error deleting payment records:', error);
    return c.json({ error: '입금 내역 삭제 중 오류가 발생했습니다.' }, 500);
  }
});

// ==================== 참가자 관리 API ====================

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

// 랜덤 좌석 배정 (새 형식: 그룹-번호)
// 2인 신청자는 반드시 같은 그룹에 배정
adminParticipantsRouter.post('/random-seats', async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];
      rowsPerGroup?: number;  // deprecated, 호환성 유지용
      seatsPerRow?: number;   // deprecated, 호환성 유지용
    }>();

    if (!body.groups || body.groups.length === 0) {
      return c.json({ error: '좌석 그룹 배열은 필수입니다.' }, 400);
    }

    const paidParticipants = await c.env.DB.prepare(
      'SELECT id, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") AND deleted_at IS NULL ORDER BY created_at ASC'
    ).all<{ id: number; ticket_count: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

    const totalSeatsNeeded = paidParticipants.results.reduce((sum, p) => sum + (p.ticket_count || 1), 0);
    const availableSeats = generateAvailableSeats(body.groups);
    const assignedSet = await getAssignedSeats(c.env.DB);

    // 새 형식: "그룹-번호" (예: "A-1")
    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < totalSeatsNeeded) {
      return c.json({
        error: `사용 가능한 좌석(${freeSeats.length}개)이 필요한 좌석 수(${totalSeatsNeeded}개)보다 적습니다.`
      }, 400);
    }

    // 1인/2인 참가자 분리
    const singleParticipants = paidParticipants.results.filter(p => (p.ticket_count || 1) === 1);
    const pairParticipants = paidParticipants.results.filter(p => p.ticket_count === 2);

    // 셔플
    const shuffledSingles = shuffleArray(singleParticipants);
    const shuffledPairs = shuffleArray(pairParticipants);

    let assignedCount = 0;
    const usedSeats = new Set<string>();

    // 2인 신청자 먼저 배정 (같은 그룹 보장)
    for (const participant of shuffledPairs) {
      const pairResult = findPairSeatsInSameGroup(freeSeats, usedSeats);
      if (!pairResult) {
        return c.json({ error: '2인 신청자를 위한 같은 그룹 좌석이 부족합니다.' }, 400);
      }

      const { seat1, seat2 } = pairResult;
      usedSeats.add(`${seat1.group}-${seat1.number}`);
      usedSeats.add(`${seat2.group}-${seat2.number}`);

      await assignSeatsToParticipant(c.env.DB, participant.id, 2, seat1, seat2);
      assignedCount += 2;
    }

    // 1인 신청자 배정
    const remainingSeats = shuffleArray(freeSeats.filter(seat => {
      const seatKey = `${seat.group}-${seat.number}`;
      return !usedSeats.has(seatKey);
    }));

    let seatIndex = 0;
    for (const participant of shuffledSingles) {
      if (seatIndex >= remainingSeats.length) break;

      const seat = remainingSeats[seatIndex++];
      await assignSeatsToParticipant(c.env.DB, participant.id, 1, seat);
      assignedCount += 1;
    }

    return c.json({
      success: true,
      message: `${assignedCount}명의 참가자에게 좌석이 랜덤 배정되었습니다. (2인 신청자는 같은 그룹)`,
      assigned_count: assignedCount,
      total_available: availableSeats.length,
      groups_used: body.groups,
      pair_count: shuffledPairs.length,
      single_count: shuffledSingles.length
    });
  } catch (error) {
    console.error('Error random seat assignment:', error);
    return c.json({ error: '랜덤 좌석 배정 중 오류가 발생했습니다.' }, 500);
  }
});

// 연령대별 좌석 배정 (새 형식: 그룹-번호)
// 어린 사람(2000년대생 → 90년대생 → 80년대생 순)이 앞자리(A그룹)에 배정
// 2인 신청자는 반드시 같은 그룹에 배정
adminParticipantsRouter.post('/age-based-seats', async (c) => {
  try {
    const body = await c.req.json<{
      groups: string[];
      rowsPerGroup?: number;  // deprecated, 호환성 유지용
      seatsPerRow?: number;   // deprecated, 호환성 유지용
    }>();

    if (!body.groups || body.groups.length === 0) {
      return c.json({ error: '좌석 그룹 배열은 필수입니다.' }, 400);
    }

    const paidParticipants = await c.env.DB.prepare(
      'SELECT id, ssn_first, ticket_count FROM participants WHERE is_paid = 1 AND (seat_full IS NULL OR seat_full = "") AND deleted_at IS NULL ORDER BY created_at ASC'
    ).all<{ id: number; ssn_first: string | null; ticket_count: number }>();

    if (!paidParticipants.results || paidParticipants.results.length === 0) {
      return c.json({ error: '좌석을 배정할 입금 완료 참가자가 없습니다.' }, 400);
    }

    // 연령대 우선순위 함수
    const getPriority = (ssnFirst: string | null) => {
      if (!ssnFirst || ssnFirst.length < 2) return 999; // SSN 없으면 맨 뒤

      const year = parseInt(ssnFirst.substring(0, 2));
      if (year >= 0 && year <= 25) return 1;   // 2000~2025년생 (가장 젊음)
      if (year >= 90 && year <= 99) return 2;  // 1990년대생
      if (year >= 80 && year <= 89) return 3;  // 1980년대생
      if (year >= 70 && year <= 79) return 4;  // 1970년대생
      if (year >= 60 && year <= 69) return 5;  // 1960년대생
      return 6;
    };

    // 1인/2인 분리
    const singleParticipants = paidParticipants.results.filter(p => (p.ticket_count || 1) === 1);
    const pairParticipants = paidParticipants.results.filter(p => p.ticket_count === 2);

    // 연령대별 정렬
    const sortByAge = (a: typeof paidParticipants.results[0], b: typeof paidParticipants.results[0]) => {
      const priorityA = getPriority(a.ssn_first);
      const priorityB = getPriority(b.ssn_first);

      if (priorityA !== priorityB) return priorityA - priorityB;

      // 같은 연령대 내 세부 정렬
      if (!a.ssn_first || !b.ssn_first) return 0;
      const yearA = parseInt(a.ssn_first.substring(0, 2));
      const yearB = parseInt(b.ssn_first.substring(0, 2));

      if (priorityA === 1) return yearB - yearA; // 2000년대: 25가 00보다 앞
      return yearA - yearB; // 1900년대: 90이 99보다 앞
    };

    singleParticipants.sort(sortByAge);
    pairParticipants.sort(sortByAge);

    const totalSeatsNeeded = paidParticipants.results.reduce((sum, p) => sum + (p.ticket_count || 1), 0);
    const availableSeats = generateAvailableSeats(body.groups);
    const assignedSet = await getAssignedSeats(c.env.DB);

    // 새 형식: "그룹-번호" (예: "A-1")
    const freeSeats = availableSeats.filter(seat => {
      const seatFull = `${seat.group}-${seat.number}`;
      return !assignedSet.has(seatFull);
    });

    if (freeSeats.length < totalSeatsNeeded) {
      return c.json({
        error: `사용 가능한 좌석(${freeSeats.length}개)이 필요한 좌석 수(${totalSeatsNeeded}개)보다 적습니다.`
      }, 400);
    }

    let assignedCount = 0;
    const usedSeats = new Set<string>();

    // 2인 신청자와 1인 신청자를 연령대순으로 병합하되, 2인은 같은 그룹 보장
    // 전략: 연령대 순서대로 처리하면서 2인은 같은 그룹에서 연속 좌석 찾기

    // 모든 참가자를 연령대순 정렬
    const allParticipants = [...paidParticipants.results].sort(sortByAge);

    // 그룹별 좌석을 순서대로 관리
    const seatsByGroup: Record<string, { seat: Seat; used: boolean }[]> = {};
    for (const seat of freeSeats) {
      if (!seatsByGroup[seat.group]) seatsByGroup[seat.group] = [];
      seatsByGroup[seat.group].push({ seat, used: false });
    }
    // 각 그룹 내 좌석 번호순 정렬
    for (const group of Object.keys(seatsByGroup)) {
      seatsByGroup[group].sort((a, b) => parseInt(a.seat.number) - parseInt(b.seat.number));
    }

    // 그룹 순서 (A부터)
    const groupOrder = body.groups;
    let currentGroupIndex = 0;

    // 각 그룹에서 다음 사용 가능한 좌석 인덱스
    const groupSeatIndex: Record<string, number> = {};
    for (const g of groupOrder) groupSeatIndex[g] = 0;

    // 2인용 같은 그룹 연속 좌석 찾기 함수
    const findPairInGroup = (startGroupIdx: number): { seat1: Seat; seat2: Seat; groupIdx: number } | null => {
      for (let gi = startGroupIdx; gi < groupOrder.length; gi++) {
        const group = groupOrder[gi];
        const seats = seatsByGroup[group] || [];
        const available = seats.filter(s => !s.used);

        if (available.length < 2) continue;

        // 연속 좌석 찾기
        for (let i = 0; i < available.length - 1; i++) {
          const num1 = parseInt(available[i].seat.number);
          const num2 = parseInt(available[i + 1].seat.number);
          if (num2 - num1 === 1) {
            return { seat1: available[i].seat, seat2: available[i + 1].seat, groupIdx: gi };
          }
        }
        // 연속 없으면 같은 그룹 아무거나
        if (available.length >= 2) {
          return { seat1: available[0].seat, seat2: available[1].seat, groupIdx: gi };
        }
      }
      return null;
    };

    // 1인용 좌석 찾기
    const findSingleSeat = (startGroupIdx: number): { seat: Seat; groupIdx: number } | null => {
      for (let gi = startGroupIdx; gi < groupOrder.length; gi++) {
        const group = groupOrder[gi];
        const seats = seatsByGroup[group] || [];
        const available = seats.find(s => !s.used);
        if (available) {
          return { seat: available.seat, groupIdx: gi };
        }
      }
      return null;
    };

    // 좌석 사용 표시
    const markUsed = (seat: Seat) => {
      const group = seat.group;
      const entry = seatsByGroup[group]?.find(s => s.seat.number === seat.number);
      if (entry) entry.used = true;
    };

    for (const participant of allParticipants) {
      const ticketCount = participant.ticket_count || 1;

      if (ticketCount === 2) {
        const pair = findPairInGroup(0); // 전체 그룹에서 찾기 (연령대순 앞그룹 우선)
        if (!pair) {
          return c.json({ error: '2인 신청자를 위한 같은 그룹 좌석이 부족합니다.' }, 400);
        }
        markUsed(pair.seat1);
        markUsed(pair.seat2);
        await assignSeatsToParticipant(c.env.DB, participant.id, 2, pair.seat1, pair.seat2);
        assignedCount += 2;
      } else {
        const single = findSingleSeat(0);
        if (!single) {
          return c.json({ error: '1인 신청자를 위한 좌석이 부족합니다.' }, 400);
        }
        markUsed(single.seat);
        await assignSeatsToParticipant(c.env.DB, participant.id, 1, single.seat);
        assignedCount += 1;
      }
    }

    return c.json({
      success: true,
      message: `${assignedCount}명의 참가자에게 연령대별로 좌석이 배정되었습니다.`,
      assigned_count: assignedCount,
      total_available: availableSeats.length,
      groups_used: body.groups,
      with_ssn: participantsWithSsn.length,
      without_ssn: participantsWithoutSsn.length
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


// 참가자 정보 수정 (이름, 전화번호, 생년월일, 동반자 정보)
adminParticipantsRouter.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      user_name?: string;
      phone?: string;
      ssn_first?: string;
      guest2_name?: string;
      guest2_phone?: string;
      guest2_ssn_first?: string;
    }>();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(id)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    // 업데이트할 필드 준비
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (body.user_name !== undefined) {
      if (!body.user_name.trim()) {
        return c.json({ error: '이름은 필수입니다.' }, 400);
      }
      updates.push('user_name = ?');
      values.push(body.user_name.trim());
    }

    if (body.phone !== undefined) {
      if (!body.phone.trim()) {
        return c.json({ error: '전화번호는 필수입니다.' }, 400);
      }
      // 전화번호 중복 확인 (본인 제외)
      const existingPhone = await c.env.DB.prepare(
        'SELECT id FROM participants WHERE phone = ? AND id != ? AND deleted_at IS NULL'
      )
        .bind(body.phone, id)
        .first();
      if (existingPhone) {
        return c.json({ error: '이미 사용 중인 전화번호입니다.' }, 400);
      }
      updates.push('phone = ?');
      values.push(body.phone.trim());
    }

    if (body.ssn_first !== undefined) {
      updates.push('ssn_first = ?');
      values.push(body.ssn_first ? body.ssn_first.trim() : null);
    }

    if (body.guest2_name !== undefined) {
      updates.push('guest2_name = ?');
      values.push(body.guest2_name ? body.guest2_name.trim() : null);
    }

    if (body.guest2_phone !== undefined) {
      if (body.guest2_phone) {
        // 동반자 전화번호 중복 확인
        const existingGuest2Phone = await c.env.DB.prepare(
          'SELECT id FROM participants WHERE (phone = ? OR guest2_phone = ?) AND id != ? AND deleted_at IS NULL'
        )
          .bind(body.guest2_phone, body.guest2_phone, id)
          .first();
        if (existingGuest2Phone) {
          return c.json({ error: '동반자 전화번호가 이미 사용 중입니다.' }, 400);
        }
      }
      updates.push('guest2_phone = ?');
      values.push(body.guest2_phone ? body.guest2_phone.trim() : null);
    }

    if (body.guest2_ssn_first !== undefined) {
      updates.push('guest2_ssn_first = ?');
      values.push(body.guest2_ssn_first ? body.guest2_ssn_first.trim() : null);
    }

    if (updates.length === 0) {
      return c.json({ error: '수정할 항목이 없습니다.' }, 400);
    }

    // 업데이트 실행 (id는 숫자로 바인딩)
    await c.env.DB.prepare(
      `UPDATE participants SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    )
      .bind(...values, id)
      .run();

    console.log(`[Admin] Updated participant: ID=${id}, Fields=${updates.join(', ')}`);

    return c.json({
      success: true,
      message: '참가자 정보가 수정되었습니다.',
      updated_fields: updates.map(u => u.split(' = ')[0])
    });
  } catch (error) {
    console.error('Error updating participant:', error);
    return c.json({ error: '참가자 정보 수정 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 삭제 (아카이브 테이블로 이동)
adminParticipantsRouter.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE id = ?'
    )
      .bind(id)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    const deletedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // 아카이브 테이블로 이동
    await c.env.DB.prepare(
      `INSERT INTO participants_archive (
        original_id, user_name, phone, original_phone, is_paid,
        seat_group, seat_row, seat_number, seat_full, ssn_first,
        guest2_name, guest2_phone, guest2_ssn_first, guest2_password, is_guest2_completed,
        ticket_count, seat_group_2, seat_row_2, seat_number_2, seat_full_2,
        is_checked_in, deleted_at, is_cancelled, cancelled_at, cancel_reason,
        refund_amount, refund_bank, refund_account, refund_holder, refund_status,
        refund_completed_at, refund_reason, password, privacy_agreed, privacy_agreed_at,
        guest2_privacy_agreed, guest2_privacy_agreed_at, created_at, archive_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        participant.id, participant.user_name, participant.phone, participant.phone,
        participant.is_paid, participant.seat_group, participant.seat_row, participant.seat_number,
        participant.seat_full, participant.ssn_first, participant.guest2_name, participant.guest2_phone,
        participant.guest2_ssn_first, participant.guest2_password, participant.is_guest2_completed, participant.ticket_count,
        participant.seat_group_2, participant.seat_row_2, participant.seat_number_2, participant.seat_full_2,
        participant.is_checked_in, deletedAt, participant.is_cancelled, participant.cancelled_at,
        participant.cancel_reason, participant.refund_amount, participant.refund_bank, participant.refund_account,
        participant.refund_holder, participant.refund_status, participant.refund_completed_at,
        participant.refund_reason, participant.password, participant.privacy_agreed, participant.privacy_agreed_at,
        participant.guest2_privacy_agreed, participant.guest2_privacy_agreed_at, participant.created_at, 'deleted'
      )
      .run();

    // 연결된 payment_records의 참조 해제
    await c.env.DB.prepare('UPDATE payment_records SET matched_participant_id = NULL WHERE matched_participant_id = ?')
      .bind(id)
      .run();

    // 연결된 checkin_records 삭제
    await c.env.DB.prepare('DELETE FROM checkin_records WHERE participant_id = ?')
      .bind(id)
      .run();

    // 원본 테이블에서 삭제
    await c.env.DB.prepare('DELETE FROM participants WHERE id = ?')
      .bind(id)
      .run();

    console.log(`[Admin] Deleted and archived participant: ID=${id}, Name="${participant.user_name}"`);

    return c.json({
      success: true,
      message: `"${participant.user_name}" 참가자 정보가 삭제되었습니다.`,
      deleted_id: id,
      deleted_at: deletedAt,
      note: '삭제된 데이터는 아카이브에 보관됩니다.'
    });
  } catch (error) {
    console.error('Error deleting participant:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: '삭제 중 오류가 발생했습니다.', details: errorMessage }, 500);
  }
});

// 동반자만 취소 (2인 신청 -> 1인 신청으로 변경)
adminParticipantsRouter.delete('/:id/guest2', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    const participant = await c.env.DB.prepare(
      'SELECT id, user_name, ticket_count, guest2_name, deleted_at FROM participants WHERE id = ?'
    )
      .bind(id)
      .first<{ id: number; user_name: string; ticket_count: number; guest2_name: string | null; deleted_at: string | null }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    if (participant.deleted_at) {
      return c.json({ error: '이미 삭제된 참가자입니다.' }, 400);
    }

    if (participant.ticket_count !== 2) {
      return c.json({ error: '2인 신청이 아닙니다. 동반자 취소가 불가합니다.' }, 400);
    }

    const guest2Name = participant.guest2_name || '동반자';

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
        seat_full_2 = NULL
      WHERE id = ?`
    )
      .bind(id)
      .run();

    console.log(`[Admin] Cancelled guest2: ParticipantID=${id}, MainName="${participant.user_name}", Guest2Name="${guest2Name}"`);

    return c.json({
      success: true,
      message: `"${participant.user_name}"님의 동반자 "${guest2Name}"가 취소되었습니다. (2인 → 1인 신청으로 변경)`,
      participant_id: id,
      cancelled_guest: guest2Name
    });
  } catch (error) {
    console.error('Error cancelling guest2:', error);
    return c.json({ error: '동반자 취소 중 오류가 발생했습니다.' }, 500);
  }
});

// 참가자 복구 (아카이브에서 복구)
adminParticipantsRouter.post('/:id/restore', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 아카이브 ID입니다.' }, 400);
    }

    // 아카이브에서 해당 데이터 찾기
    const archived = await c.env.DB.prepare(
      'SELECT * FROM participants_archive WHERE id = ?'
    )
      .bind(id)
      .first<any>();

    if (!archived) {
      return c.json({ error: '아카이브에서 참가자를 찾을 수 없습니다.' }, 404);
    }

    // 원본 전화번호로 중복 확인
    const existingPhone = await c.env.DB.prepare(
      'SELECT id FROM participants WHERE phone = ?'
    )
      .bind(archived.original_phone)
      .first();

    if (existingPhone) {
      return c.json({
        error: `이 전화번호(${archived.original_phone})로 이미 다른 참가자가 등록되어 있습니다. 먼저 해당 참가자를 삭제하거나 전화번호를 변경해주세요.`
      }, 400);
    }

    // participants 테이블로 복구 (원본 ID 유지 시도)
    await c.env.DB.prepare(
      `INSERT INTO participants (
        id, user_name, phone, is_paid, seat_group, seat_row, seat_number, seat_full,
        ssn_first, guest2_name, guest2_phone, guest2_ssn_first, is_guest2_completed,
        ticket_count, seat_group_2, seat_row_2, seat_number_2, seat_full_2,
        is_checked_in, is_cancelled, cancelled_at, cancel_reason,
        refund_amount, refund_bank, refund_account, refund_holder, refund_status,
        refund_completed_at, refund_reason, password, privacy_agreed, privacy_agreed_at,
        guest2_privacy_agreed, guest2_privacy_agreed_at, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
      .bind(
        archived.original_id, archived.user_name, archived.original_phone, archived.is_paid,
        archived.seat_group, archived.seat_row, archived.seat_number, archived.seat_full,
        archived.ssn_first, archived.guest2_name, archived.guest2_phone, archived.guest2_ssn_first,
        archived.is_guest2_completed, archived.ticket_count, archived.seat_group_2, archived.seat_row_2,
        archived.seat_number_2, archived.seat_full_2, archived.is_checked_in, archived.is_cancelled,
        archived.cancelled_at, archived.cancel_reason, archived.refund_amount, archived.refund_bank,
        archived.refund_account, archived.refund_holder, archived.refund_status, archived.refund_completed_at,
        archived.refund_reason, archived.password, archived.privacy_agreed, archived.privacy_agreed_at,
        archived.guest2_privacy_agreed, archived.guest2_privacy_agreed_at, archived.created_at
      )
      .run();

    // 아카이브에서 삭제
    await c.env.DB.prepare('DELETE FROM participants_archive WHERE id = ?')
      .bind(id)
      .run();

    console.log(`[Admin] Restored participant from archive: ArchiveID=${id}, OriginalID=${archived.original_id}, Name="${archived.user_name}"`);

    return c.json({
      success: true,
      message: `"${archived.user_name}" 참가자 정보가 복구되었습니다.`,
      restored_id: archived.original_id
    });
  } catch (error) {
    console.error('Error restoring participant:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: '복구 중 오류가 발생했습니다.', details: errorMessage }, 500);
  }
});

// 참가자 강제 등록 (관리자가 직접 등록)
adminParticipantsRouter.post('/add', async (c) => {
  try {
    const body = await c.req.json<{
      user_name: string;
      phone: string;
      ssn_first?: string;
      is_paid?: boolean;
      ticket_count?: number;
      guest2_name?: string;
      guest2_phone?: string;
      guest2_ssn_first?: string;
      seat_group?: string;
      seat_row?: number;
      seat_number?: number;
      seat_full?: string;
      admin_note?: string;
    }>();

    // 필수 필드 검증
    if (!body.user_name || !body.phone) {
      return c.json({ error: '이름과 전화번호는 필수입니다.' }, 400);
    }

    // 전화번호 정규화 (하이픈 제거)
    const phone = body.phone.replace(/-/g, '');

    // 전화번호 중복 확인 (활성 참가자만 - 삭제된 데이터는 아카이브로 이동됨)
    const existingPhone = await c.env.DB.prepare(
      'SELECT id, user_name FROM participants WHERE phone = ?'
    )
      .bind(phone)
      .first<{ id: number; user_name: string }>();

    if (existingPhone) {
      return c.json({
        error: `이미 등록된 전화번호입니다. (기존 참가자: ${existingPhone.user_name}, ID: ${existingPhone.id})`
      }, 400);
    }

    const ticketCount = body.ticket_count || 1;
    const isPaid = body.is_paid ? 1 : 0;
    const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // 참가자 등록
    const result = await c.env.DB.prepare(
      `INSERT INTO participants (
        user_name, phone, ssn_first, ticket_count, is_paid,
        guest2_name, guest2_phone, guest2_ssn_first,
        seat_group, seat_row, seat_number, seat_full,
        is_guest2_completed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.user_name.trim(),
        phone,
        body.ssn_first || null,
        ticketCount,
        isPaid,
        body.guest2_name || null,
        body.guest2_phone ? body.guest2_phone.replace(/-/g, '') : null,
        body.guest2_ssn_first || null,
        body.seat_group || null,
        body.seat_row || null,
        body.seat_number || null,
        body.seat_full || null,
        ticketCount === 2 && body.guest2_name ? 1 : 0,
        createdAt
      )
      .run();

    const newId = result.meta.last_row_id;

    console.log(`[Admin] Force-added participant: ID=${newId}, Name="${body.user_name}", Phone="${phone}", Note="${body.admin_note || ''}"`);

    return c.json({
      success: true,
      message: `"${body.user_name}"님이 성공적으로 등록되었습니다.`,
      participant: {
        id: newId,
        user_name: body.user_name,
        phone: phone,
        ticket_count: ticketCount,
        is_paid: isPaid
      }
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: '참가자 등록 중 오류가 발생했습니다.', details: errorMessage }, 500);
  }
});

// 참가자 전체 정보 수정 (관리자용)
adminParticipantsRouter.put('/:id/full', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      user_name?: string;
      phone?: string;
      ssn_first?: string | null;
      ticket_count?: number;
      is_paid?: number;
      is_checked_in?: number;
      // 동반자 정보
      guest2_name?: string | null;
      guest2_phone?: string | null;
      guest2_ssn_first?: string | null;
      // 취소/환불 정보
      is_cancelled?: number;
      refund_status?: string | null;
      refund_amount?: number | null;
      refund_bank?: string | null;
      refund_account?: string | null;
      refund_holder?: string | null;
      refund_reason?: string | null;
      // 좌석 정보
      seat_group?: string | null;
      seat_row?: number | null;
      seat_number?: number | null;
      seat_full?: string | null;
      seat_group_2?: string | null;
      seat_row_2?: number | null;
      seat_number_2?: number | null;
      seat_full_2?: string | null;
    }>();

    // 참가자 존재 확인
    const participant = await c.env.DB.prepare(
      'SELECT * FROM participants WHERE id = ?'
    )
      .bind(id)
      .first<Participant>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    // 전화번호 중복 확인 (본인 제외)
    if (body.phone && body.phone !== participant.phone) {
      const existingPhone = await c.env.DB.prepare(
        'SELECT id FROM participants WHERE phone = ? AND id != ? AND deleted_at IS NULL'
      )
        .bind(body.phone, id)
        .first();
      if (existingPhone) {
        return c.json({ error: '이미 사용 중인 전화번호입니다.' }, 400);
      }
    }

    // 업데이트 쿼리 생성
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    // 기본 정보
    if (body.user_name !== undefined) {
      updates.push('user_name = ?');
      values.push(body.user_name);
    }
    if (body.phone !== undefined) {
      updates.push('phone = ?');
      values.push(body.phone);
    }
    if (body.ssn_first !== undefined) {
      updates.push('ssn_first = ?');
      values.push(body.ssn_first);
    }
    if (body.ticket_count !== undefined) {
      updates.push('ticket_count = ?');
      values.push(body.ticket_count);
    }
    if (body.is_paid !== undefined) {
      updates.push('is_paid = ?');
      values.push(body.is_paid);
    }
    if (body.is_checked_in !== undefined) {
      updates.push('is_checked_in = ?');
      values.push(body.is_checked_in);
    }

    // 동반자 정보
    if (body.guest2_name !== undefined) {
      updates.push('guest2_name = ?');
      values.push(body.guest2_name);
    }
    if (body.guest2_phone !== undefined) {
      updates.push('guest2_phone = ?');
      values.push(body.guest2_phone);
    }
    if (body.guest2_ssn_first !== undefined) {
      updates.push('guest2_ssn_first = ?');
      values.push(body.guest2_ssn_first);
    }

    // 동반자 정보가 입력되면 is_guest2_completed 자동 설정
    if (body.guest2_name !== undefined || body.guest2_phone !== undefined) {
      // 동반자 이름이 있으면 완료, 없으면 미완료
      const hasGuestName = body.guest2_name !== undefined ? !!body.guest2_name : !!participant.guest2_name;
      updates.push('is_guest2_completed = ?');
      values.push(hasGuestName ? 1 : 0);
    }

    // 취소/환불 정보
    if (body.is_cancelled !== undefined) {
      updates.push('is_cancelled = ?');
      values.push(body.is_cancelled);
    }
    if (body.refund_status !== undefined) {
      updates.push('refund_status = ?');
      values.push(body.refund_status);
    }
    if (body.refund_amount !== undefined) {
      updates.push('refund_amount = ?');
      values.push(body.refund_amount);
    }
    if (body.refund_bank !== undefined) {
      updates.push('refund_bank = ?');
      values.push(body.refund_bank);
    }
    if (body.refund_account !== undefined) {
      updates.push('refund_account = ?');
      values.push(body.refund_account);
    }
    if (body.refund_holder !== undefined) {
      updates.push('refund_holder = ?');
      values.push(body.refund_holder);
    }
    if (body.refund_reason !== undefined) {
      updates.push('refund_reason = ?');
      values.push(body.refund_reason);
    }

    // 좌석 정보 (본인)
    if (body.seat_group !== undefined) {
      updates.push('seat_group = ?');
      values.push(body.seat_group);
    }
    if (body.seat_row !== undefined) {
      updates.push('seat_row = ?');
      values.push(body.seat_row);
    }
    if (body.seat_number !== undefined) {
      updates.push('seat_number = ?');
      values.push(body.seat_number);
    }
    if (body.seat_full !== undefined) {
      updates.push('seat_full = ?');
      values.push(body.seat_full);
    }

    // 좌석 정보 (동반자)
    if (body.seat_group_2 !== undefined) {
      updates.push('seat_group_2 = ?');
      values.push(body.seat_group_2);
    }
    if (body.seat_row_2 !== undefined) {
      updates.push('seat_row_2 = ?');
      values.push(body.seat_row_2);
    }
    if (body.seat_number_2 !== undefined) {
      updates.push('seat_number_2 = ?');
      values.push(body.seat_number_2);
    }
    if (body.seat_full_2 !== undefined) {
      updates.push('seat_full_2 = ?');
      values.push(body.seat_full_2);
    }

    if (updates.length === 0) {
      return c.json({ error: '수정할 항목이 없습니다.' }, 400);
    }

    // 업데이트 실행
    await c.env.DB.prepare(
      `UPDATE participants SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values, id)
      .run();

    console.log(`[Admin] Full update participant: ID=${id}, Fields=${updates.length}`);

    return c.json({
      success: true,
      message: '참가자 정보가 수정되었습니다.',
      updated_fields: updates.map(u => u.split(' = ')[0])
    });
  } catch (error) {
    console.error('Error full updating participant:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: '참가자 정보 수정 중 오류가 발생했습니다.', details: errorMessage }, 500);
  }
});

// 참가자 비밀번호 리셋 (생년월일로 초기화)
adminParticipantsRouter.post('/:id/reset-password', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ target?: 'main' | 'guest' }>();
    const target = body.target || 'main';

    if (isNaN(id)) {
      return c.json({ error: '유효하지 않은 참가자 ID입니다.' }, 400);
    }

    const participant = await c.env.DB.prepare(
      'SELECT id, user_name, ssn_first, guest2_name, guest2_ssn_first FROM participants WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(id)
      .first<{ id: number; user_name: string; ssn_first: string | null; guest2_name: string | null; guest2_ssn_first: string | null }>();

    if (!participant) {
      return c.json({ error: '참가자를 찾을 수 없습니다.' }, 404);
    }

    if (target === 'guest') {
      // 동반자 비밀번호 리셋
      if (!participant.guest2_name) {
        return c.json({ error: '동반자 정보가 없습니다.' }, 400);
      }
      await c.env.DB.prepare('UPDATE participants SET guest2_password = NULL WHERE id = ?')
        .bind(id)
        .run();

      console.log(`[Admin] Reset guest password: ID=${id}, Guest="${participant.guest2_name}"`);

      return c.json({
        success: true,
        message: `동반자 "${participant.guest2_name}"의 비밀번호가 생년월일(${participant.guest2_ssn_first || '미등록'})로 초기화되었습니다.`,
        reset_to: participant.guest2_ssn_first
      });
    } else {
      // 본인 비밀번호 리셋
      await c.env.DB.prepare('UPDATE participants SET password = NULL WHERE id = ?')
        .bind(id)
        .run();

      console.log(`[Admin] Reset password: ID=${id}, Name="${participant.user_name}"`);

      return c.json({
        success: true,
        message: `"${participant.user_name}"의 비밀번호가 생년월일(${participant.ssn_first || '미등록'})로 초기화되었습니다.`,
        reset_to: participant.ssn_first
      });
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: '비밀번호 초기화 중 오류가 발생했습니다.', details: errorMessage }, 500);
  }
});

// 대시보드 통계 조회 (전체 데이터 기준)
adminParticipantsRouter.get('/dashboard-stats', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_records,
        SUM(CASE WHEN ticket_count = 2 THEN 2 ELSE 1 END) as total_people,
        SUM(CASE WHEN is_paid = 1 THEN (CASE WHEN ticket_count = 2 THEN 2 ELSE 1 END) ELSE 0 END) as paid_people,
        SUM(CASE WHEN seat_full IS NOT NULL AND seat_full != '' THEN 1 ELSE 0 END) +
          SUM(CASE WHEN seat_full_2 IS NOT NULL AND seat_full_2 != '' THEN 1 ELSE 0 END) as seated_people,
        SUM(CASE WHEN is_checked_in = 1 THEN (CASE WHEN ticket_count = 2 THEN 2 ELSE 1 END) ELSE 0 END) as checked_in_people
      FROM participants
      WHERE deleted_at IS NULL
    `).first<{
      total_records: number;
      total_people: number;
      paid_people: number;
      seated_people: number;
      checked_in_people: number;
    }>();

    return c.json({
      success: true,
      stats: {
        totalRecords: stats?.total_records || 0,
        totalPeople: stats?.total_people || 0,
        paidPeople: stats?.paid_people || 0,
        seatedPeople: stats?.seated_people || 0,
        checkedInPeople: stats?.checked_in_people || 0
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 개인정보 동의 현황 조회
adminParticipantsRouter.get('/privacy-stats', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_records,
        SUM(CASE WHEN ticket_count = 2 THEN 2 ELSE 1 END) as total_people,
        SUM(CASE WHEN privacy_agreed = 1 THEN 1 ELSE 0 END) as main_agreed,
        SUM(CASE WHEN ticket_count = 2 AND guest2_privacy_agreed = 1 THEN 1 ELSE 0 END) as guest_agreed,
        SUM(CASE WHEN ticket_count = 2 THEN 1 ELSE 0 END) as two_person_count
      FROM participants
      WHERE deleted_at IS NULL AND is_cancelled = 0
    `).first<{
      total_records: number;
      total_people: number;
      main_agreed: number;
      guest_agreed: number;
      two_person_count: number;
    }>();

    const totalPeople = stats?.total_people || 0;
    const totalAgreed = (stats?.main_agreed || 0) + (stats?.guest_agreed || 0);
    const rate = totalPeople > 0 ? Math.round((totalAgreed / totalPeople) * 100) : 0;

    return c.json({
      success: true,
      stats: {
        total: totalPeople,
        agreed: totalAgreed,
        pending: totalPeople - totalAgreed,
        rate: rate
      }
    });
  } catch (error) {
    console.error('Error fetching privacy stats:', error);
    return c.json({ error: '동의 현황 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 아카이브(삭제된) 참가자 목록 조회
adminParticipantsRouter.get('/archive', async (c) => {
  try {
    const search = c.req.query('search');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100000);
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM participants_archive';
    let countQuery = 'SELECT COUNT(*) as count FROM participants_archive';
    const params: string[] = [];

    if (search) {
      const whereClause = ' WHERE user_name LIKE ? OR phone LIKE ? OR original_phone LIKE ? OR guest2_name LIKE ?';
      query += whereClause;
      countQuery += whereClause;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY archived_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const totalResult = await c.env.DB.prepare(countQuery)
      .bind(...params)
      .first<{ count: number }>();

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all<any>();

    return c.json({
      success: true,
      participants: result.results || [],
      pagination: {
        page,
        limit,
        total: totalResult?.count || 0,
        totalPages: Math.ceil((totalResult?.count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching archived participants:', error);
    return c.json({ error: '아카이브 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 아카이브 데이터 전체 다운로드 (엑셀용)
adminParticipantsRouter.get('/archive/download', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM participants_archive ORDER BY archived_at DESC'
    ).all<any>();

    return c.json({
      success: true,
      participants: result.results || [],
      total: result.results?.length || 0
    });
  } catch (error) {
    console.error('Error downloading archived participants:', error);
    return c.json({ error: '아카이브 다운로드 중 오류가 발생했습니다.' }, 500);
  }
});

