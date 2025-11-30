// 미들웨어

import type { Context, Next } from 'hono';
import type { Env } from './types';
import { verifyJwtToken, ADMIN_TOKEN_HEADER } from './utils';

// CORS 헤더
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  'Access-Control-Allow-Credentials': 'true',
};

// CORS 미들웨어
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  await next();

  Object.entries(corsHeaders).forEach(([key, value]) => {
    c.res.headers.set(key, value);
  });
}

// 관리자 인증 미들웨어
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const adminPassword = c.env.ADMIN_PASSWORD;
  const token = c.req.header(ADMIN_TOKEN_HEADER);

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD is not set in environment');
    return c.json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }, 500);
  }

  if (!token) {
    return c.json({ error: '관리자 권한이 필요합니다.' }, 401);
  }

  const isValid = await verifyJwtToken(token, c.env);
  if (!isValid) {
    return c.json({ error: '인증이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.' }, 401);
  }

  await next();
}
