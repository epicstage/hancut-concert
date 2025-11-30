import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock D1 Database
function createMockDB() {
  const mockPrepare = vi.fn();
  const mockBind = vi.fn();
  const mockFirst = vi.fn();
  const mockAll = vi.fn();
  const mockRun = vi.fn();

  mockPrepare.mockReturnValue({
    bind: mockBind.mockReturnValue({
      first: mockFirst,
      all: mockAll,
      run: mockRun,
    }),
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });

  return {
    prepare: mockPrepare,
    _mocks: {
      prepare: mockPrepare,
      bind: mockBind,
      first: mockFirst,
      all: mockAll,
      run: mockRun,
    },
  };
}

// Test helper to create request
function createRequest(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new Request(`http://localhost${path}`, init);
}

describe('API Endpoints', () => {
  describe('POST /api/participants', () => {
    it('should validate required fields', async () => {
      const mockDB = createMockDB();
      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      // Test missing user_name
      const req1 = createRequest('POST', '/participants', { phone: '01012345678' });
      const res1 = await app.fetch(req1, { DB: mockDB });
      const data1 = await res1.json();

      expect(res1.status).toBe(400);
      expect(data1.error).toContain('이름');
    });

    it('should validate phone number format', async () => {
      const mockDB = createMockDB();
      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('POST', '/participants', {
        user_name: '홍길동',
        phone: '010-1234-5678', // Invalid format (contains hyphens)
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('전화번호');
    });

    it('should validate SSN first part', async () => {
      const mockDB = createMockDB();
      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('POST', '/participants', {
        user_name: '홍길동',
        phone: '01012345678',
        ssn_first: '991315', // Invalid month (13)
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('월');
    });

    it('should validate ticket_count (1 or 2 only)', async () => {
      const mockDB = createMockDB();
      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('POST', '/participants', {
        user_name: '홍길동',
        phone: '01012345678',
        ticket_count: 3, // Invalid
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('티켓');
    });

    it('should create participant successfully', async () => {
      const mockDB = createMockDB();
      mockDB._mocks.run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 1 },
      });

      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('POST', '/participants', {
        user_name: '홍길동',
        phone: '01012345678',
        ssn_first: '990115',
        ticket_count: 1,
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBe(1);
    });
  });

  describe('GET /api/participants/count', () => {
    it('should return participant count', async () => {
      const mockDB = createMockDB();
      mockDB._mocks.first.mockResolvedValue({ count: 42 });

      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('GET', '/participants/count');
      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(42);
    });
  });

  describe('GET /api/participants/phone/:phone', () => {
    it('should return participant by phone', async () => {
      const mockDB = createMockDB();
      const mockParticipant = {
        id: 1,
        user_name: '홍길동',
        phone: '01012345678',
        is_paid: 0,
      };
      mockDB._mocks.first.mockResolvedValue(mockParticipant);

      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('GET', '/participants/phone/01012345678');
      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.participant).toEqual(mockParticipant);
    });

    it('should return 404 if participant not found', async () => {
      const mockDB = createMockDB();
      mockDB._mocks.first.mockResolvedValue(null);

      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('GET', '/participants/phone/01099999999');
      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('찾을 수 없습니다');
    });
  });

  describe('PUT /api/participants/:id/name', () => {
    it('should update participant name', async () => {
      const mockDB = createMockDB();
      mockDB._mocks.run.mockResolvedValue({ success: true });

      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('PUT', '/participants/1/name', {
        user_name: '김철수',
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('수정');
    });

    it('should reject empty name', async () => {
      const mockDB = createMockDB();

      const { participantsRouter } = await import('../functions/api/participants');

      const app = new Hono();
      app.route('/participants', participantsRouter);

      const req = createRequest('PUT', '/participants/1/name', {
        user_name: '   ', // Empty after trim
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('이름');
    });
  });
});

describe('Seat API', () => {
  describe('GET /api/seat/:phone', () => {
    it('should return 403 before event date', async () => {
      const mockDB = createMockDB();

      const { seatsRouter } = await import('../functions/api/seats');

      const app = new Hono();
      app.route('/seat', seatsRouter);

      // Event date is 2025-12-14, test assumes current date is before this
      const req = createRequest('GET', '/seat/01012345678');
      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      // This test will pass until 2025-12-14
      expect(res.status).toBe(403);
      expect(data.error).toContain('행사 당일');
    });
  });
});

describe('Inquiry API', () => {
  describe('POST /api/inquiries', () => {
    it('should validate required fields', async () => {
      const mockDB = createMockDB();

      const { inquiriesRouter } = await import('../functions/api/inquiries');

      const app = new Hono();
      app.route('/inquiries', inquiriesRouter);

      const req = createRequest('POST', '/inquiries', {
        phone: '01012345678',
        // Missing content
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('필수');
    });

    it('should validate phone format', async () => {
      const mockDB = createMockDB();

      const { inquiriesRouter } = await import('../functions/api/inquiries');

      const app = new Hono();
      app.route('/inquiries', inquiriesRouter);

      const req = createRequest('POST', '/inquiries', {
        phone: '1234567890', // Only 10 digits
        content: '문의 내용',
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('전화번호');
    });

    it('should reject inquiry from non-participant', async () => {
      const mockDB = createMockDB();
      mockDB._mocks.first.mockResolvedValue(null); // No participant found

      const { inquiriesRouter } = await import('../functions/api/inquiries');

      const app = new Hono();
      app.route('/inquiries', inquiriesRouter);

      const req = createRequest('POST', '/inquiries', {
        phone: '01012345678',
        content: '문의 내용입니다.',
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('신청 내역');
    });

    it('should create inquiry for participant', async () => {
      const mockDB = createMockDB();
      // First call: find participant
      mockDB._mocks.first.mockResolvedValueOnce({ user_name: '홍길동' });
      // Second call: insert inquiry
      mockDB._mocks.run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 1 },
      });

      const { inquiriesRouter } = await import('../functions/api/inquiries');

      const app = new Hono();
      app.route('/inquiries', inquiriesRouter);

      const req = createRequest('POST', '/inquiries', {
        phone: '01012345678',
        content: '문의 내용입니다.',
      });

      const res = await app.fetch(req, { DB: mockDB });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('접수');
    });
  });
});
