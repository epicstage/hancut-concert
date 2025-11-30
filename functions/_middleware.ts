// Cloudflare Pages Functions 미들웨어
// 모듈화된 API 라우터를 사용

import { app } from './api/index';
import type { Env } from './api/types';

// Cloudflare Pages Functions 타입
interface PagesFunction<E = unknown> {
  (context: {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<unknown>) => void;
    passThroughOnException: () => void;
    next: () => Promise<Response>;
    data: unknown;
  }): Response | Promise<Response>;
}

// Cloudflare Pages Functions는 onRequest 핸들러를 사용
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  // API 경로만 처리하고, 나머지는 정적 파일로 넘김
  if (url.pathname.startsWith('/api/')) {
    return app.fetch(context.request, context.env, context);
  }

  // 정적 파일은 그대로 제공
  return context.next();
};
