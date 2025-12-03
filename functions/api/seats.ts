// 좌석 확인 라우트

import { Hono } from 'hono';
import type { Env } from './types';

export const seatsRouter = new Hono<{ Bindings: Env }>();

// 좌석 확인 (행사 당일 이후)
seatsRouter.get('/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');
    const eventDate = new Date('2025-12-21');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);

    if (today < eventDate) {
      return c.json({ error: '행사 당일 오픈됩니다.' }, 403);
    }

    // Soft Delete 적용: deleted_at IS NULL 조건 추가
    const participant = await c.env.DB.prepare(
      'SELECT seat_full, seat_full_2, seat_group, seat_row, seat_number, ticket_count, guest2_name FROM participants WHERE phone = ? AND deleted_at IS NULL'
    )
      .bind(phone)
      .first<{
        seat_full: string | null;
        seat_full_2: string | null;
        seat_group: string | null;
        seat_row: string | null;
        seat_number: string | null;
        ticket_count: number;
        guest2_name: string | null;
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
      seat_full_2: participant.seat_full_2,
      seat_group: participant.seat_group,
      seat_row: participant.seat_row,
      seat_number: participant.seat_number,
      ticket_count: participant.ticket_count,
      guest2_name: participant.guest2_name,
    });
  } catch (error) {
    console.error('Error fetching seat:', error);
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500);
  }
});
