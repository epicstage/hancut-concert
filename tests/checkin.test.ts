import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCached, invalidateCache, invalidateCacheByPrefix, checkRateLimit } from '../functions/api/cache';
import type { KVNamespace } from '../functions/api/types';

// KV 모의 객체 생성
function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiration?: number }>();

  return {
    get: vi.fn(async <T>(key: string, options?: { type?: 'text' | 'json' }): Promise<T | string | null> => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiration && Date.now() > item.expiration) {
        store.delete(key);
        return null;
      }
      if (options?.type === 'json') {
        return JSON.parse(item.value) as T;
      }
      return item.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expiration = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiration });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async (options?: { prefix?: string }) => {
      const keys = Array.from(store.keys())
        .filter(k => !options?.prefix || k.startsWith(options.prefix))
        .map(name => ({ name }));
      return { keys, list_complete: true };
    }),
  };
}

describe('Cache Utilities', () => {
  let mockKV: KVNamespace;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  describe('getCached', () => {
    it('should return fallback result when cache is empty', async () => {
      const fallback = vi.fn().mockResolvedValue({ data: 'test' });

      const result = await getCached(mockKV, 'test-key', fallback, 60);

      expect(result).toEqual({ data: 'test' });
      expect(fallback).toHaveBeenCalledOnce();
    });

    it('should return cached value on second call', async () => {
      const fallback = vi.fn().mockResolvedValue({ data: 'test' });

      // 첫 번째 호출 - 캐시 저장
      await getCached(mockKV, 'test-key', fallback, 60);
      // 두 번째 호출 - 캐시 반환
      const result = await getCached(mockKV, 'test-key', fallback, 60);

      expect(result).toEqual({ data: 'test' });
      expect(fallback).toHaveBeenCalledOnce(); // fallback은 한 번만 호출
    });

    it('should execute fallback directly when cache is undefined', async () => {
      const fallback = vi.fn().mockResolvedValue('result');

      const result = await getCached(undefined, 'test-key', fallback, 60);

      expect(result).toBe('result');
      expect(fallback).toHaveBeenCalledOnce();
    });
  });

  describe('invalidateCache', () => {
    it('should delete specific key from cache', async () => {
      await mockKV.put('test-key', JSON.stringify({ data: 'test' }));

      await invalidateCache(mockKV, 'test-key');

      const result = await mockKV.get('test-key');
      expect(result).toBeNull();
    });

    it('should not throw when cache is undefined', async () => {
      await expect(invalidateCache(undefined, 'test-key')).resolves.toBeUndefined();
    });
  });

  describe('invalidateCacheByPrefix', () => {
    it('should delete all keys with matching prefix', async () => {
      await mockKV.put('checkin:stats', '"stats1"');
      await mockKV.put('checkin:list:1', '"list1"');
      await mockKV.put('other:key', '"other"');

      await invalidateCacheByPrefix(mockKV, 'checkin:');

      const checkinStats = await mockKV.get('checkin:stats');
      const checkinList = await mockKV.get('checkin:list:1');
      const otherKey = await mockKV.get('other:key');

      expect(checkinStats).toBeNull();
      expect(checkinList).toBeNull();
      expect(otherKey).toBe('"other"'); // 다른 prefix는 유지
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests under the limit', async () => {
      const result = await checkRateLimit(mockKV, 'user:123', 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should block requests over the limit', async () => {
      // 10번 요청 (limit: 10)
      for (let i = 0; i < 10; i++) {
        await checkRateLimit(mockKV, 'user:456', 10, 60);
      }

      // 11번째 요청은 차단
      const result = await checkRateLimit(mockKV, 'user:456', 10, 60);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow unlimited when cache is undefined', async () => {
      const result = await checkRateLimit(undefined, 'user:789', 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });
  });
});

describe('Checkin List Features', () => {
  describe('seat group validation', () => {
    const VALID_SEAT_GROUPS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

    it('should accept valid Korean seat groups', () => {
      const groups = ['가', '나', '다'];
      const invalidGroups = groups.filter(g => !VALID_SEAT_GROUPS.includes(g));
      expect(invalidGroups).toHaveLength(0);
    });

    it('should reject invalid seat groups', () => {
      const groups = ['가', 'A', '1'];
      const invalidGroups = groups.filter(g => !VALID_SEAT_GROUPS.includes(g));
      expect(invalidGroups).toEqual(['A', '1']);
    });

    it('should handle empty groups', () => {
      const groups: string[] = [];
      expect(groups.length).toBe(0);
    });
  });

  describe('allowed_seat_groups JSON parsing', () => {
    it('should parse JSON array correctly', () => {
      const jsonStr = '["가","나","다"]';
      const groups = JSON.parse(jsonStr);
      expect(groups).toEqual(['가', '나', '다']);
    });

    it('should handle null allowed_seat_groups', () => {
      const allowedGroups: string | null = null;
      const result = allowedGroups ? JSON.parse(allowedGroups) : null;
      expect(result).toBeNull();
    });

    it('should check if participant group is allowed', () => {
      const allowedGroups = ['가', '나', '다'];
      const participantGroup = '나';

      expect(allowedGroups.includes(participantGroup)).toBe(true);
    });

    it('should reject participant from wrong group', () => {
      const allowedGroups = ['가', '나', '다'];
      const participantGroup = '라';

      expect(allowedGroups.includes(participantGroup)).toBe(false);
    });
  });
});

describe('Rate Limiting for High Concurrency', () => {
  it('should handle 120 requests per minute per IP', async () => {
    const mockKV = createMockKV();
    const clientIP = '192.168.1.1';
    let allowed = 0;
    let blocked = 0;

    // 130번 요청 시뮬레이션
    for (let i = 0; i < 130; i++) {
      const result = await checkRateLimit(mockKV, `checkin:${clientIP}`, 120, 60);
      if (result.allowed) {
        allowed++;
      } else {
        blocked++;
      }
    }

    expect(allowed).toBe(120); // 120개 허용
    expect(blocked).toBe(10); // 10개 차단
  });

  it('should use different limits for different IPs', async () => {
    const mockKV = createMockKV();

    // IP 1: 5번 요청
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(mockKV, 'ip:1.1.1.1', 10, 60);
    }

    // IP 2: 첫 요청
    const ip2Result = await checkRateLimit(mockKV, 'ip:2.2.2.2', 10, 60);

    expect(ip2Result.allowed).toBe(true);
    expect(ip2Result.remaining).toBe(9); // IP 2는 별도 카운트
  });
});
