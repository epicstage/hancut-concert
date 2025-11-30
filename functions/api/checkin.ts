// 체크인 관련 라우트
// 다중 체크인 리스트 지원 + 대규모 동시접속 처리

import { Hono } from 'hono';
import type { Env, CheckinList, CheckinRecord, Participant } from './types';
import { CacheKeys, CacheTTL, VALID_SEAT_GROUPS } from './types';
import { requireAdmin } from './middleware';
import { getKSTDateTime, errorResponse, ErrorCode } from './utils';
import { getCached, invalidateCache, invalidateCacheByPrefix, checkRateLimit } from './cache';

export const checkinRouter = new Hono<{ Bindings: Env }>();

// 모든 라우트에 인증 적용
checkinRouter.use('*', requireAdmin);

// ============================================
// 체크인 리스트 관리 API
// ============================================

// 체크인 리스트 목록 조회
checkinRouter.get('/lists', async (c) => {
  try {
    const lists = await getCached<CheckinList[]>(
      c.env.CACHE,
      CacheKeys.CHECKIN_LIST_ALL,
      async () => {
        const result = await c.env.DB.prepare(`
          SELECT
            cl.*,
            COALESCE(
              (SELECT COUNT(*) FROM checkin_records cr WHERE cr.checkin_list_id = cl.id),
              0
            ) as checked_in_count
          FROM checkin_lists cl
          ORDER BY cl.created_at DESC
        `).all<CheckinList>();
        return result.results;
      },
      CacheTTL.LIST
    );

    return c.json({ success: true, lists });
  } catch (error) {
    console.error('Error fetching checkin lists:', error);
    return errorResponse(c, 500, '체크인 리스트 조회 중 오류가 발생했습니다.');
  }
});

// 활성 체크인 리스트만 조회
checkinRouter.get('/lists/active', async (c) => {
  try {
    const lists = await getCached<CheckinList[]>(
      c.env.CACHE,
      `${CacheKeys.CHECKIN_LIST_ALL}:active`,
      async () => {
        const result = await c.env.DB.prepare(`
          SELECT
            cl.*,
            COALESCE(
              (SELECT COUNT(*) FROM checkin_records cr WHERE cr.checkin_list_id = cl.id),
              0
            ) as checked_in_count
          FROM checkin_lists cl
          WHERE cl.is_active = 1
          ORDER BY cl.created_at DESC
        `).all<CheckinList>();
        return result.results;
      },
      CacheTTL.STATS
    );

    return c.json({ success: true, lists });
  } catch (error) {
    console.error('Error fetching active checkin lists:', error);
    return errorResponse(c, 500, '체크인 리스트 조회 중 오류가 발생했습니다.');
  }
});

// 체크인 리스트 생성
checkinRouter.post('/lists', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description?: string;
      allowed_seat_groups?: string[];
    }>();

    if (!body.name || body.name.trim().length === 0) {
      return errorResponse(c, 400, '리스트 이름은 필수입니다.', ErrorCode.VALIDATION_ERROR);
    }

    // 좌석 그룹 유효성 검사
    let allowedGroups: string | null = null;
    if (body.allowed_seat_groups && body.allowed_seat_groups.length > 0) {
      const invalidGroups = body.allowed_seat_groups.filter(
        g => !VALID_SEAT_GROUPS.includes(g as typeof VALID_SEAT_GROUPS[number])
      );
      if (invalidGroups.length > 0) {
        return errorResponse(c, 400, `유효하지 않은 좌석 그룹: ${invalidGroups.join(', ')}`, ErrorCode.VALIDATION_ERROR);
      }
      allowedGroups = JSON.stringify(body.allowed_seat_groups);
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO checkin_lists (name, description, allowed_seat_groups)
      VALUES (?, ?, ?)
    `)
      .bind(body.name.trim(), body.description?.trim() || null, allowedGroups)
      .run();

    // 캐시 무효화
    await invalidateCacheByPrefix(c.env.CACHE, 'checkin:lists');

    return c.json({
      success: true,
      message: '체크인 리스트가 생성되었습니다.',
      id: result.meta.last_row_id
    });
  } catch (error) {
    console.error('Error creating checkin list:', error);
    return errorResponse(c, 500, '체크인 리스트 생성 중 오류가 발생했습니다.');
  }
});

// 체크인 리스트 수정
checkinRouter.put('/lists/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return errorResponse(c, 400, '유효하지 않은 리스트 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    const body = await c.req.json<{
      name?: string;
      description?: string;
      is_active?: boolean;
      allowed_seat_groups?: string[] | null;
    }>();

    // 기존 데이터 조회
    const existing = await c.env.DB.prepare(
      'SELECT * FROM checkin_lists WHERE id = ?'
    ).bind(id).first<CheckinList>();

    if (!existing) {
      return errorResponse(c, 404, '체크인 리스트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    // 업데이트할 값 준비
    const name = body.name?.trim() || existing.name;
    const description = body.description !== undefined ? body.description?.trim() || null : existing.description;
    const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

    let allowedGroups = existing.allowed_seat_groups;
    if (body.allowed_seat_groups !== undefined) {
      if (body.allowed_seat_groups === null || body.allowed_seat_groups.length === 0) {
        allowedGroups = null;
      } else {
        const invalidGroups = body.allowed_seat_groups.filter(
          g => !VALID_SEAT_GROUPS.includes(g as typeof VALID_SEAT_GROUPS[number])
        );
        if (invalidGroups.length > 0) {
          return errorResponse(c, 400, `유효하지 않은 좌석 그룹: ${invalidGroups.join(', ')}`, ErrorCode.VALIDATION_ERROR);
        }
        allowedGroups = JSON.stringify(body.allowed_seat_groups);
      }
    }

    await c.env.DB.prepare(`
      UPDATE checkin_lists
      SET name = ?, description = ?, is_active = ?, allowed_seat_groups = ?
      WHERE id = ?
    `)
      .bind(name, description, isActive, allowedGroups, id)
      .run();

    // 캐시 무효화
    await invalidateCacheByPrefix(c.env.CACHE, 'checkin:');

    return c.json({ success: true, message: '체크인 리스트가 수정되었습니다.' });
  } catch (error) {
    console.error('Error updating checkin list:', error);
    return errorResponse(c, 500, '체크인 리스트 수정 중 오류가 발생했습니다.');
  }
});

// 체크인 리스트 삭제
checkinRouter.delete('/lists/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return errorResponse(c, 400, '유효하지 않은 리스트 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    // 체크인 기록이 있는지 확인
    const recordCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM checkin_records WHERE checkin_list_id = ?'
    ).bind(id).first<{ count: number }>();

    if (recordCount && recordCount.count > 0) {
      return errorResponse(
        c, 400,
        `이 리스트에 ${recordCount.count}개의 체크인 기록이 있습니다. 기록을 먼저 삭제하거나 비활성화해주세요.`,
        ErrorCode.CONFLICT
      );
    }

    await c.env.DB.prepare('DELETE FROM checkin_lists WHERE id = ?').bind(id).run();

    // 캐시 무효화
    await invalidateCacheByPrefix(c.env.CACHE, 'checkin:');

    return c.json({ success: true, message: '체크인 리스트가 삭제되었습니다.' });
  } catch (error) {
    console.error('Error deleting checkin list:', error);
    return errorResponse(c, 500, '체크인 리스트 삭제 중 오류가 발생했습니다.');
  }
});

// ============================================
// 체크인 처리 API
// ============================================

// 특정 리스트에 QR 체크인
checkinRouter.post('/lists/:listId/checkin', async (c) => {
  const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';

  // Rate Limiting 체크 (IP당 분당 120회)
  const rateLimit = await checkRateLimit(c.env.CACHE, `checkin:${clientIP}`, 120, 60);
  if (!rateLimit.allowed) {
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)));
    return errorResponse(c, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }
  c.header('X-RateLimit-Remaining', String(rateLimit.remaining));

  try {
    const listId = parseInt(c.req.param('listId'));
    if (isNaN(listId)) {
      return errorResponse(c, 400, '유효하지 않은 리스트 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    const body = await c.req.json<{
      qrData?: string;
      participantId?: number;
      checkedInBy?: string;
    }>();

    // 참가자 ID 결정 (QR 또는 직접 입력)
    let participantId: number;
    if (body.participantId) {
      participantId = body.participantId;
    } else if (body.qrData) {
      try {
        const qrParsed = JSON.parse(body.qrData);
        participantId = qrParsed.id;
      } catch {
        return errorResponse(c, 400, '유효하지 않은 QR 코드 형식입니다.', ErrorCode.VALIDATION_ERROR);
      }
    } else {
      return errorResponse(c, 400, 'QR 데이터 또는 참가자 ID가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }

    if (!participantId || typeof participantId !== 'number') {
      return errorResponse(c, 400, '유효하지 않은 참가자 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    // 체크인 리스트 확인 (캐시 활용)
    const list = await getCached<CheckinList | null>(
      c.env.CACHE,
      `checkin:list:${listId}`,
      async () => {
        return c.env.DB.prepare(
          'SELECT * FROM checkin_lists WHERE id = ?'
        ).bind(listId).first<CheckinList>();
      },
      CacheTTL.LIST
    );

    if (!list) {
      return errorResponse(c, 404, '체크인 리스트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    if (!list.is_active) {
      return errorResponse(c, 400, '비활성화된 체크인 리스트입니다.', ErrorCode.VALIDATION_ERROR);
    }

    // 참가자 확인
    const participant = await c.env.DB.prepare(`
      SELECT id, user_name, phone, is_paid, seat_group, seat_row, seat_number, seat_full
      FROM participants WHERE id = ?
    `)
      .bind(participantId)
      .first<{
        id: number;
        user_name: string;
        phone: string;
        is_paid: number;
        seat_group: string | null;
        seat_row: string | null;
        seat_number: string | null;
        seat_full: string | null;
      }>();

    if (!participant) {
      return errorResponse(c, 404, '참가자를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    // 입금 확인
    if (!participant.is_paid) {
      return c.json({
        success: false,
        error: '입금이 확인되지 않은 참가자입니다.',
        code: ErrorCode.VALIDATION_ERROR,
        participant: {
          id: participant.id,
          user_name: participant.user_name,
          phone: participant.phone,
          seat_full: participant.seat_full
        }
      }, 400);
    }

    // 좌석 그룹 제한 확인
    if (list.allowed_seat_groups && participant.seat_group) {
      const allowedGroups: string[] = JSON.parse(list.allowed_seat_groups);
      if (!allowedGroups.includes(participant.seat_group)) {
        return c.json({
          success: false,
          error: `이 입구는 ${allowedGroups.join(', ')} 구역만 입장 가능합니다.`,
          code: ErrorCode.FORBIDDEN,
          participant: {
            id: participant.id,
            user_name: participant.user_name,
            seat_full: participant.seat_full,
            seat_group: participant.seat_group
          },
          allowedGroups
        }, 403);
      }
    }

    // 체크인 처리 (INSERT OR IGNORE로 Race Condition 방지)
    const checkedInAt = getKSTDateTime();
    const insertResult = await c.env.DB.prepare(`
      INSERT OR IGNORE INTO checkin_records (participant_id, checkin_list_id, checked_in_at, checked_in_by)
      VALUES (?, ?, ?, ?)
    `)
      .bind(participantId, listId, checkedInAt, body.checkedInBy || null)
      .run();

    // INSERT가 무시되었으면 이미 체크인된 것 (changes가 0이거나 last_row_id가 없으면)
    if (!insertResult.meta.changes || insertResult.meta.changes === 0) {
      const existingRecord = await c.env.DB.prepare(`
        SELECT checked_in_at FROM checkin_records
        WHERE participant_id = ? AND checkin_list_id = ?
      `)
        .bind(participantId, listId)
        .first<{ checked_in_at: string }>();

      return c.json({
        success: true,
        message: '이미 체크인된 참가자입니다.',
        alreadyCheckedIn: true,
        participant: {
          id: participant.id,
          user_name: participant.user_name,
          phone: participant.phone,
          seat_full: participant.seat_full,
          checked_in_at: existingRecord?.checked_in_at
        }
      });
    }

    // 기존 is_checked_in 필드도 업데이트 (하위 호환성)
    await c.env.DB.prepare(
      'UPDATE participants SET is_checked_in = 1 WHERE id = ?'
    )
      .bind(participantId)
      .run();

    // 통계 캐시 무효화
    await invalidateCache(c.env.CACHE, CacheKeys.CHECKIN_STATS);
    await invalidateCache(c.env.CACHE, `checkin:stats:${listId}`);

    return c.json({
      success: true,
      message: '체크인되었습니다.',
      participant: {
        id: participant.id,
        user_name: participant.user_name,
        phone: participant.phone,
        seat_full: participant.seat_full,
        checked_in_at: checkedInAt
      },
      list: {
        id: list.id,
        name: list.name
      }
    });
  } catch (error) {
    console.error('Error processing check-in:', error);
    return errorResponse(c, 500, '체크인 처리 중 오류가 발생했습니다.');
  }
});

// 기존 QR 체크인 API (하위 호환성 유지, 기본 리스트 사용)
checkinRouter.post('/', async (c) => {
  const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';

  // Rate Limiting
  const rateLimit = await checkRateLimit(c.env.CACHE, `checkin:${clientIP}`, 120, 60);
  if (!rateLimit.allowed) {
    return errorResponse(c, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  try {
    const body = await c.req.json<{ qrData: string }>();

    if (!body.qrData) {
      return errorResponse(c, 400, 'QR 코드 데이터가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }

    // QR 코드 데이터 파싱
    let participantData: { id?: number };
    try {
      participantData = JSON.parse(body.qrData);
    } catch {
      return errorResponse(c, 400, '유효하지 않은 QR 코드 형식입니다.', ErrorCode.VALIDATION_ERROR);
    }

    if (!participantData.id) {
      return errorResponse(c, 400, '참가자 ID가 없습니다.', ErrorCode.VALIDATION_ERROR);
    }

    // 참가자 확인
    const participant = await c.env.DB.prepare(
      'SELECT id, user_name, phone, is_paid, is_checked_in, seat_full FROM participants WHERE id = ?'
    )
      .bind(participantData.id)
      .first<{
        id: number;
        user_name: string;
        phone: string;
        is_paid: number;
        is_checked_in: number;
        seat_full: string | null;
      }>();

    if (!participant) {
      return errorResponse(c, 404, '참가자를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    // 입금 확인
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
          seat_full: participant.seat_full,
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

    // 캐시 무효화
    await invalidateCache(c.env.CACHE, CacheKeys.CHECKIN_STATS);

    return c.json({
      success: true,
      message: '입장 확인되었습니다.',
      participant: {
        id: participant.id,
        user_name: participant.user_name,
        phone: participant.phone,
        seat_full: participant.seat_full,
        is_checked_in: true,
        checked_in_at: checkedInAt
      }
    });
  } catch (error) {
    console.error('Error processing check-in:', error);
    return errorResponse(c, 500, '입장 확인 처리 중 오류가 발생했습니다.');
  }
});

// ============================================
// 통계 API
// ============================================

// 전체 체크인 통계 (캐싱 적용)
checkinRouter.get('/stats', async (c) => {
  try {
    const stats = await getCached(
      c.env.CACHE,
      CacheKeys.CHECKIN_STATS,
      async () => {
        const total = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1'
        ).first<{ count: number }>();

        const checkedIn = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1 AND is_checked_in = 1'
        ).first<{ count: number }>();

        return {
          total: total?.count || 0,
          checkedIn: checkedIn?.count || 0,
          remaining: (total?.count || 0) - (checkedIn?.count || 0)
        };
      },
      CacheTTL.STATS
    );

    return c.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching check-in stats:', error);
    return errorResponse(c, 500, '통계 조회 중 오류가 발생했습니다.');
  }
});

// 특정 체크인 리스트 통계
checkinRouter.get('/lists/:listId/stats', async (c) => {
  try {
    const listId = parseInt(c.req.param('listId'));
    if (isNaN(listId)) {
      return errorResponse(c, 400, '유효하지 않은 리스트 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    const stats = await getCached(
      c.env.CACHE,
      `checkin:stats:${listId}`,
      async () => {
        const list = await c.env.DB.prepare(
          'SELECT * FROM checkin_lists WHERE id = ?'
        ).bind(listId).first<CheckinList>();

        if (!list) {
          return null;
        }

        // 해당 리스트의 체크인 수
        const checkedIn = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM checkin_records WHERE checkin_list_id = ?'
        ).bind(listId).first<{ count: number }>();

        // 해당 그룹의 전체 유료 참가자 수
        let total = 0;
        if (list.allowed_seat_groups) {
          const groups: string[] = JSON.parse(list.allowed_seat_groups);
          const placeholders = groups.map(() => '?').join(',');
          const totalResult = await c.env.DB.prepare(
            `SELECT COUNT(*) as count FROM participants WHERE is_paid = 1 AND seat_group IN (${placeholders})`
          ).bind(...groups).first<{ count: number }>();
          total = totalResult?.count || 0;
        } else {
          const totalResult = await c.env.DB.prepare(
            'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1'
          ).first<{ count: number }>();
          total = totalResult?.count || 0;
        }

        return {
          list: {
            id: list.id,
            name: list.name,
            allowed_seat_groups: list.allowed_seat_groups ? JSON.parse(list.allowed_seat_groups) : null
          },
          total,
          checkedIn: checkedIn?.count || 0,
          remaining: total - (checkedIn?.count || 0)
        };
      },
      CacheTTL.STATS
    );

    if (!stats) {
      return errorResponse(c, 404, '체크인 리스트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    return c.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching list stats:', error);
    return errorResponse(c, 500, '통계 조회 중 오류가 발생했습니다.');
  }
});

// 모든 리스트의 통계 요약
checkinRouter.get('/stats/all', async (c) => {
  try {
    const allStats = await getCached(
      c.env.CACHE,
      'checkin:stats:all',
      async () => {
        // 전체 통계
        const total = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1'
        ).first<{ count: number }>();

        const checkedIn = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM participants WHERE is_paid = 1 AND is_checked_in = 1'
        ).first<{ count: number }>();

        // 각 리스트별 통계
        const lists = await c.env.DB.prepare(`
          SELECT
            cl.id, cl.name, cl.is_active, cl.allowed_seat_groups,
            COUNT(cr.id) as checked_in_count
          FROM checkin_lists cl
          LEFT JOIN checkin_records cr ON cl.id = cr.checkin_list_id
          GROUP BY cl.id
          ORDER BY cl.created_at DESC
        `).all<{
          id: number;
          name: string;
          is_active: number;
          allowed_seat_groups: string | null;
          checked_in_count: number;
        }>();

        return {
          overall: {
            total: total?.count || 0,
            checkedIn: checkedIn?.count || 0,
            remaining: (total?.count || 0) - (checkedIn?.count || 0),
            percentage: total?.count ? Math.round((checkedIn?.count || 0) / total.count * 100) : 0
          },
          lists: lists.results.map(l => ({
            id: l.id,
            name: l.name,
            is_active: l.is_active === 1,
            allowed_seat_groups: l.allowed_seat_groups ? JSON.parse(l.allowed_seat_groups) : null,
            checked_in_count: l.checked_in_count
          }))
        };
      },
      CacheTTL.STATS
    );

    return c.json({ success: true, ...allStats });
  } catch (error) {
    console.error('Error fetching all stats:', error);
    return errorResponse(c, 500, '통계 조회 중 오류가 발생했습니다.');
  }
});

// ============================================
// 체크인 기록 조회 API
// ============================================

// 특정 리스트의 체크인 기록 조회 (페이지네이션)
checkinRouter.get('/lists/:listId/records', async (c) => {
  try {
    const listId = parseInt(c.req.param('listId'));
    if (isNaN(listId)) {
      return errorResponse(c, 400, '유효하지 않은 리스트 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    const records = await c.env.DB.prepare(`
      SELECT
        cr.id, cr.checked_in_at, cr.checked_in_by,
        p.id as participant_id, p.user_name, p.phone, p.seat_full
      FROM checkin_records cr
      JOIN participants p ON cr.participant_id = p.id
      WHERE cr.checkin_list_id = ?
      ORDER BY cr.checked_in_at DESC
      LIMIT ? OFFSET ?
    `)
      .bind(listId, limit, offset)
      .all<{
        id: number;
        checked_in_at: string;
        checked_in_by: string | null;
        participant_id: number;
        user_name: string;
        phone: string;
        seat_full: string | null;
      }>();

    const totalCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM checkin_records WHERE checkin_list_id = ?'
    ).bind(listId).first<{ count: number }>();

    return c.json({
      success: true,
      records: records.results,
      pagination: {
        page,
        limit,
        total: totalCount?.count || 0,
        totalPages: Math.ceil((totalCount?.count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching checkin records:', error);
    return errorResponse(c, 500, '체크인 기록 조회 중 오류가 발생했습니다.');
  }
});

// 체크인 취소 (관리자 전용)
checkinRouter.delete('/lists/:listId/records/:recordId', async (c) => {
  try {
    const listId = parseInt(c.req.param('listId'));
    const recordId = parseInt(c.req.param('recordId'));

    if (isNaN(listId) || isNaN(recordId)) {
      return errorResponse(c, 400, '유효하지 않은 ID입니다.', ErrorCode.VALIDATION_ERROR);
    }

    // 기록 조회
    const record = await c.env.DB.prepare(
      'SELECT * FROM checkin_records WHERE id = ? AND checkin_list_id = ?'
    ).bind(recordId, listId).first<CheckinRecord>();

    if (!record) {
      return errorResponse(c, 404, '체크인 기록을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    // 기록 삭제
    await c.env.DB.prepare(
      'DELETE FROM checkin_records WHERE id = ?'
    ).bind(recordId).run();

    // 다른 리스트에 체크인 기록이 있는지 확인
    const otherRecords = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM checkin_records WHERE participant_id = ?'
    ).bind(record.participant_id).first<{ count: number }>();

    // 다른 기록이 없으면 is_checked_in 초기화
    if (!otherRecords || otherRecords.count === 0) {
      await c.env.DB.prepare(
        'UPDATE participants SET is_checked_in = 0 WHERE id = ?'
      ).bind(record.participant_id).run();
    }

    // 캐시 무효화
    await invalidateCacheByPrefix(c.env.CACHE, 'checkin:');

    return c.json({ success: true, message: '체크인이 취소되었습니다.' });
  } catch (error) {
    console.error('Error canceling check-in:', error);
    return errorResponse(c, 500, '체크인 취소 중 오류가 발생했습니다.');
  }
});
