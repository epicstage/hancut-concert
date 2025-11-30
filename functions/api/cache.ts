// KV 캐시 유틸리티
// 대규모 동시접속 처리를 위한 캐싱 레이어

import type { Env, KVNamespace } from './types';
import { CacheTTL } from './types';

/**
 * 캐시에서 값을 가져옴 (없으면 fallback 함수 실행 후 캐싱)
 */
export async function getCached<T>(
  cache: KVNamespace | undefined,
  key: string,
  fallback: () => Promise<T>,
  ttl: number = CacheTTL.STATS
): Promise<T> {
  // 캐시가 없으면 직접 실행
  if (!cache) {
    return fallback();
  }

  try {
    // 캐시에서 조회
    const cached = await cache.get<T>(key, { type: 'json' });
    if (cached !== null) {
      return cached;
    }
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    // 캐시 에러시 fallback 실행
  }

  // fallback 실행 후 캐싱
  const result = await fallback();

  try {
    await cache.put(key, JSON.stringify(result), { expirationTtl: ttl });
  } catch (error) {
    console.error(`Cache put error for key ${key}:`, error);
    // 캐시 저장 실패해도 결과는 반환
  }

  return result;
}

/**
 * 캐시 무효화 (특정 키)
 */
export async function invalidateCache(
  cache: KVNamespace | undefined,
  key: string
): Promise<void> {
  if (!cache) return;

  try {
    await cache.delete(key);
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error);
  }
}

/**
 * 캐시 무효화 (prefix로 시작하는 모든 키)
 */
export async function invalidateCacheByPrefix(
  cache: KVNamespace | undefined,
  prefix: string
): Promise<void> {
  if (!cache) return;

  try {
    const keys = await cache.list({ prefix });
    await Promise.all(keys.keys.map(k => cache.delete(k.name)));
  } catch (error) {
    console.error(`Cache prefix delete error for prefix ${prefix}:`, error);
  }
}

/**
 * 체크인 관련 캐시 전체 무효화
 */
export async function invalidateCheckinCache(cache: KVNamespace | undefined): Promise<void> {
  if (!cache) return;

  await invalidateCacheByPrefix(cache, 'checkin:');
}

/**
 * Rate Limiting 체크 (sliding window)
 * 지정된 시간 내 요청 수 제한
 */
export async function checkRateLimit(
  cache: KVNamespace | undefined,
  identifier: string,
  maxRequests: number = 60,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // 캐시가 없으면 무제한 허용
  if (!cache) {
    return { allowed: true, remaining: maxRequests, resetAt: 0 };
  }

  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  try {
    // 현재 요청 기록 조회
    const data = await cache.get<{ requests: number[]; }>(key, { type: 'json' });
    const requests = data?.requests || [];

    // 윈도우 밖의 오래된 요청 제거
    const validRequests = requests.filter(t => now - t < windowMs);

    if (validRequests.length >= maxRequests) {
      // 제한 초과
      const oldestRequest = Math.min(...validRequests);
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestRequest + windowMs
      };
    }

    // 새 요청 추가
    validRequests.push(now);
    await cache.put(key, JSON.stringify({ requests: validRequests }), {
      expirationTtl: windowSeconds + 10 // 약간의 여유
    });

    return {
      allowed: true,
      remaining: maxRequests - validRequests.length,
      resetAt: validRequests[0] + windowMs
    };
  } catch (error) {
    console.error(`Rate limit check error for ${identifier}:`, error);
    // 에러시 허용 (가용성 우선)
    return { allowed: true, remaining: maxRequests, resetAt: 0 };
  }
}

/**
 * 요청 수 증가 없이 Rate Limit 상태만 확인
 */
export async function getRateLimitStatus(
  cache: KVNamespace | undefined,
  identifier: string,
  maxRequests: number = 60,
  windowSeconds: number = 60
): Promise<{ current: number; max: number; remaining: number }> {
  if (!cache) {
    return { current: 0, max: maxRequests, remaining: maxRequests };
  }

  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  try {
    const data = await cache.get<{ requests: number[]; }>(key, { type: 'json' });
    const requests = data?.requests || [];
    const validRequests = requests.filter(t => now - t < windowMs);

    return {
      current: validRequests.length,
      max: maxRequests,
      remaining: Math.max(0, maxRequests - validRequests.length)
    };
  } catch {
    return { current: 0, max: maxRequests, remaining: maxRequests };
  }
}
