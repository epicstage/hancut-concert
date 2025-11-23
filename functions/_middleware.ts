import { Hono } from 'hono';

// Cloudflare Workers 타입
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: any }>;
}

type Env = {
  DB?: D1Database;
  // 필요한 환경 변수 추가
  // JWT_SECRET?: string;
  // ADMIN_EMAILS?: string;
};

// Cloudflare Pages Functions 타입
interface PagesFunction<Env = any> {
  (context: {
    request: Request;
    env: Env;
    waitUntil: (promise: Promise<any>) => void;
    passThroughOnException: () => void;
    next: () => Promise<Response>;
    data: any;
  }): Response | Promise<Response>;
}

const app = new Hono<{ Bindings: Env }>();

// CORS 설정
app.use('*', async (c, next) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };

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
});

// API 라우트
const api = new Hono<{ Bindings: Env }>();

// 예시 API 엔드포인트
api.get('/hello', (c) => {
  return c.json({ message: 'Hello, World!' });
});

app.route('/api', api);

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

