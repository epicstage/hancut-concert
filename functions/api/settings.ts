// 설정 관련 라우트

import { Hono } from 'hono';
import type { Env } from './types';
import { getKSTDateTime } from './utils';

export const settingsRouter = new Hono<{ Bindings: Env }>();

// 메모리 기반 접속자 추적 (1분 이내 활성 사용자)
const ACTIVE_TIMEOUT = 1 * 60 * 1000; // 1분

// 접속자 핑 (프론트에서 주기적으로 호출)
settingsRouter.post('/ping', async (c) => {
  try {
    const now = Date.now();
    const visitorId = c.req.header('X-Visitor-ID') || 'unknown';

    // D1에 접속자 기록 (upsert)
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO visitors (visitor_id, last_seen) VALUES (?, ?)"
    ).bind(visitorId, now).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error recording ping:', error);
    return c.json({ success: false }, 500);
  }
});

// 현재 접속자 수 조회 (관리자용)
settingsRouter.get('/visitors', async (c) => {
  try {
    const now = Date.now();
    const cutoff = now - ACTIVE_TIMEOUT;

    // 5분 이내 활성 사용자 수
    const result = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM visitors WHERE last_seen > ?"
    ).bind(cutoff).first<{ count: number }>();

    // 오래된 기록 정리 (30분 이상)
    const cleanupCutoff = now - (30 * 60 * 1000);
    await c.env.DB.prepare(
      "DELETE FROM visitors WHERE last_seen < ?"
    ).bind(cleanupCutoff).run();

    return c.json({
      success: true,
      activeVisitors: result?.count || 0,
      timestamp: now
    });
  } catch (error) {
    console.error('Error getting visitors:', error);
    return c.json({ error: '접속자 수 조회 중 오류가 발생했습니다.' }, 500);
  }
});

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
