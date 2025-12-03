// 좌석 그룹 설정 관련 라우트

import { Hono } from 'hono';
import type { Env } from './types';
import { requireAdmin } from './middleware';
import { getKSTDateTime } from './utils';

export const seatConfigRouter = new Hono<{ Bindings: Env }>();

// 현재 활성 좌석 그룹 설정 조회 (공개)
seatConfigRouter.get('/', async (c) => {
    try {
        const config = await c.env.DB.prepare(
            'SELECT * FROM seat_groups_config WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
        ).first<{ id: number; groups: string; created_at: string; is_active: number }>();

        if (!config) {
            // 기본값 반환
            return c.json({
                success: true,
                groups: ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하']
            });
        }

        return c.json({
            success: true,
            groups: JSON.parse(config.groups),
            config_id: config.id,
            created_at: config.created_at
        });
    } catch (error) {
        console.error('Error fetching seat config:', error);
        return c.json({ error: '좌석 그룹 설정 조회 중 오류가 발생했습니다.' }, 500);
    }
});

// 새 좌석 그룹 설정 생성 (관리자)
seatConfigRouter.post('/', requireAdmin, async (c) => {
    try {
        const body = await c.req.json<{ groups: string[] }>();

        if (!body.groups || !Array.isArray(body.groups) || body.groups.length === 0) {
            return c.json({ error: '좌석 그룹 배열은 필수입니다.' }, 400);
        }

        // 중복 체크
        const uniqueGroups = [...new Set(body.groups)];
        if (uniqueGroups.length !== body.groups.length) {
            return c.json({ error: '중복된 좌석 그룹이 있습니다.' }, 400);
        }

        const created_at = getKSTDateTime();

        // 기존 활성 설정 비활성화
        await c.env.DB.prepare(
            'UPDATE seat_groups_config SET is_active = 0'
        ).run();

        // 새 설정 추가
        const result = await c.env.DB.prepare(
            'INSERT INTO seat_groups_config (groups, created_at, is_active) VALUES (?, ?, 1)'
        )
            .bind(JSON.stringify(body.groups), created_at)
            .run();

        console.log(`[Admin] Seat groups config updated: ${JSON.stringify(body.groups)}`);

        return c.json({
            success: true,
            message: '좌석 그룹 설정이 업데이트되었습니다.',
            id: result.meta.last_row_id,
            groups: body.groups
        });
    } catch (error) {
        console.error('Error creating seat config:', error);
        return c.json({ error: '좌석 그룹 설정 생성 중 오류가 발생했습니다.' }, 500);
    }
});

// 모든 설정 이력 조회 (관리자)
seatConfigRouter.get('/history', requireAdmin, async (c) => {
    try {
        const configs = await c.env.DB.prepare(
            'SELECT * FROM seat_groups_config ORDER BY created_at DESC LIMIT 10'
        ).all<{ id: number; groups: string; created_at: string; is_active: number }>();

        return c.json({
            success: true,
            configs: configs.results.map(c => ({
                id: c.id,
                groups: JSON.parse(c.groups),
                created_at: c.created_at,
                is_active: c.is_active === 1
            }))
        });
    } catch (error) {
        console.error('Error fetching seat config history:', error);
        return c.json({ error: '설정 이력 조회 중 오류가 발생했습니다.' }, 500);
    }
});
