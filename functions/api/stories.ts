// 사연 관리 API

import { Hono } from 'hono';
import type { Env } from './types';
import { requireAdmin } from './middleware';

interface Story {
  id: number;
  name: string;
  phone: string;
  title: string | null;
  content: string;
  is_read: number;
  created_at: string;
  deleted_at: string | null;
}

export const storiesRouter = new Hono<{ Bindings: Env }>();

// 사연 등록 (공개 API)
storiesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      phone: string;
      title?: string;
      content: string;
    }>();

    // 필수 필드 검증
    if (!body.name || !body.phone || !body.content) {
      return c.json({ error: '이름, 연락처, 사연 내용은 필수입니다.' }, 400);
    }

    // 전화번호 정규화
    const phone = body.phone.replace(/\D/g, '');
    if (phone.length < 10) {
      return c.json({ error: '올바른 연락처를 입력해주세요.' }, 400);
    }

    // 내용 길이 검증
    if (body.content.length > 5000) {
      return c.json({ error: '사연은 5000자 이내로 작성해주세요.' }, 400);
    }

    // 사연 저장
    const result = await c.env.DB.prepare(`
      INSERT INTO stories (name, phone, title, content)
      VALUES (?, ?, ?, ?)
    `)
      .bind(body.name.trim(), phone, body.title?.trim() || null, body.content.trim())
      .run();

    console.log(`[Story] New story submitted: name="${body.name}", phone=${phone.slice(-4)}`);

    return c.json({
      success: true,
      message: '사연이 성공적으로 전송되었습니다.',
      id: result.meta.last_row_id
    });
  } catch (error) {
    console.error('Error submitting story:', error);
    return c.json({ error: '사연 전송 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자용 사연 목록 조회
storiesRouter.get('/', requireAdmin, async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const offset = (page - 1) * limit;
    const includeRead = c.req.query('include_read') !== 'false';

    let query = 'SELECT * FROM stories WHERE deleted_at IS NULL';
    let countQuery = 'SELECT COUNT(*) as count FROM stories WHERE deleted_at IS NULL';

    if (!includeRead) {
      query += ' AND is_read = 0';
      countQuery += ' AND is_read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const [stories, totalResult] = await Promise.all([
      c.env.DB.prepare(query).bind(limit, offset).all<Story>(),
      c.env.DB.prepare(countQuery).first<{ count: number }>()
    ]);

    return c.json({
      success: true,
      stories: stories.results || [],
      pagination: {
        page,
        limit,
        total: totalResult?.count || 0,
        totalPages: Math.ceil((totalResult?.count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching stories:', error);
    return c.json({ error: '사연 목록 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자용 사연 읽음 표시
storiesRouter.put('/:id/read', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    await c.env.DB.prepare('UPDATE stories SET is_read = 1 WHERE id = ?')
      .bind(id)
      .run();

    return c.json({ success: true, message: '읽음 표시되었습니다.' });
  } catch (error) {
    console.error('Error marking story as read:', error);
    return c.json({ error: '읽음 표시 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자용 사연 삭제 (Soft Delete)
storiesRouter.delete('/:id', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    await c.env.DB.prepare(
      'UPDATE stories SET deleted_at = datetime("now", "+9 hours") WHERE id = ?'
    )
      .bind(id)
      .run();

    return c.json({ success: true, message: '사연이 삭제되었습니다.' });
  } catch (error) {
    console.error('Error deleting story:', error);
    return c.json({ error: '사연 삭제 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자용 통계
storiesRouter.get('/stats', requireAdmin, async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM stories
      WHERE deleted_at IS NULL
    `).first<{ total: number; unread: number }>();

    return c.json({
      success: true,
      stats: {
        total: stats?.total || 0,
        unread: stats?.unread || 0
      }
    });
  } catch (error) {
    console.error('Error fetching story stats:', error);
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500);
  }
});
