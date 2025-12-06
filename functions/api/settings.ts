// 설정 관련 라우트

import { Hono } from 'hono';
import type { Env } from './types';
import { getKSTDateTime } from './utils';

export const settingsRouter = new Hono<{ Bindings: Env }>();

// 오픈 상태 조회 (공개)
settingsRouter.get('/is-open', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'is_open'"
    ).first<{ value: string }>();

    const isOpen = result?.value === 'true';

    return c.json({
      success: true,
      isOpen,
    });
  } catch (error) {
    console.error('Error getting is_open setting:', error);
    return c.json({ error: '설정 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 오픈 상태 변경 (관리자 전용)
settingsRouter.post('/is-open', async (c) => {
  try {
    const body = await c.req.json<{ isOpen: boolean }>();
    const value = body.isOpen ? 'true' : 'false';
    const updated_at = getKSTDateTime();

    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('is_open', ?, ?)"
    ).bind(value, updated_at).run();

    return c.json({
      success: true,
      isOpen: body.isOpen,
      message: body.isOpen ? '신청이 오픈되었습니다.' : '신청이 마감되었습니다.',
    });
  } catch (error) {
    console.error('Error updating is_open setting:', error);
    return c.json({ error: '설정 변경 중 오류가 발생했습니다.' }, 500);
  }
});
