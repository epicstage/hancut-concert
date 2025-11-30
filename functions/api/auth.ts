// 인증 관련 라우트

import { Hono } from 'hono';
import type { Env } from './types';
import { generateJwtToken, JWT_EXPIRATION } from './utils';

export const authRouter = new Hono<{ Bindings: Env }>();

// 관리자 로그인
authRouter.post('/login', async (c) => {
  try {
    const adminPassword = c.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD is not set in environment');
      return c.json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }, 500);
    }

    const body = await c.req.json<{ password: string }>();

    if (!body.password) {
      return c.json({ error: '비밀번호를 입력해주세요.' }, 400);
    }

    if (body.password !== adminPassword) {
      return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
    }

    const token = await generateJwtToken(c.env);

    return c.json({
      success: true,
      token,
      expiresIn: JWT_EXPIRATION,
    });
  } catch (error) {
    console.error('Error in admin login:', error);
    return c.json({ error: '로그인 중 오류가 발생했습니다.' }, 500);
  }
});
