// 문의 관련 라우트

import { Hono } from 'hono';
import type { Env, Inquiry } from './types';
import { requireAdmin } from './middleware';
import { getKSTDateTime, validatePhone } from './utils';

export const inquiriesRouter = new Hono<{ Bindings: Env }>();

// 전화번호로 문의 내역 조회 (공개)
inquiriesRouter.get('/phone/:phone', async (c) => {
  try {
    const phone = c.req.param('phone');

    const inquiries = await c.env.DB.prepare(
      'SELECT * FROM inquiries WHERE phone = ? ORDER BY created_at DESC'
    )
      .bind(phone)
      .all<Inquiry>();

    return c.json({
      success: true,
      inquiries: inquiries.results || [],
    });
  } catch (error) {
    console.error('Error fetching inquiries by phone:', error);
    return c.json({ error: '문의 내역을 불러오는 중 오류가 발생했습니다.' }, 500);
  }
});

// 문의 생성 (공개)
inquiriesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      phone: string;
      content: string;
    }>();

    if (!body.phone || !body.content) {
      return c.json({ error: '전화번호, 문의내용은 필수입니다.' }, 400);
    }

    const phoneValidation = validatePhone(body.phone);
    if (!phoneValidation.valid) {
      return c.json({ error: phoneValidation.error }, 400);
    }

    const created_at = getKSTDateTime();

    // 신청자 확인
    const participant = await c.env.DB.prepare(
      'SELECT user_name FROM participants WHERE (phone = ? OR guest2_phone = ?) AND deleted_at IS NULL LIMIT 1'
    )
      .bind(body.phone, body.phone)
      .first<{ user_name: string }>();

    if (!participant) {
      return c.json({ error: '신청 내역을 찾을 수 없습니다. 신청 시 사용한 전화번호를 확인해주세요.' }, 400);
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO inquiries (user_name, phone, content, created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(participant.user_name, body.phone, body.content.trim(), created_at)
      .run();

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      message: '문의가 접수되었습니다.',
    });
  } catch (error) {
    console.error('Error creating inquiry:', error);
    return c.json({ error: '문의 접수 중 오류가 발생했습니다.' }, 500);
  }
});

// ===== 관리자 라우트 =====

// 관리자: 문의 목록 조회 (필터 지원)
inquiriesRouter.get('/', requireAdmin, async (c) => {
  try {
    const filter = c.req.query('filter'); // 'unanswered', 'answered', 또는 undefined (전체)

    let query = 'SELECT * FROM inquiries';

    if (filter === 'unanswered') {
      query += ' WHERE is_answered = 0';
    } else if (filter === 'answered') {
      query += ' WHERE is_answered = 1';
    }

    query += ' ORDER BY created_at DESC';

    const inquiries = await c.env.DB.prepare(query).all<Inquiry>();

    return c.json({
      success: true,
      inquiries: inquiries.results || [],
      filter: filter || 'all'
    });
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    return c.json({ error: '문의 목록을 불러오는 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 문의 답변
inquiriesRouter.put('/:id/answer', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      answer: string;
    }>();

    if (!body.answer || !body.answer.trim()) {
      return c.json({ error: '답변 내용을 입력해주세요.' }, 400);
    }

    const answered_at = getKSTDateTime();

    await c.env.DB.prepare(
      'UPDATE inquiries SET answer = ?, answered_at = ?, is_answered = 1 WHERE id = ?'
    )
      .bind(body.answer.trim(), answered_at, id)
      .run();

    return c.json({
      success: true,
      message: '답변이 등록되었습니다.',
    });
  } catch (error) {
    console.error('Error updating inquiry answer:', error);
    return c.json({ error: '답변 등록 중 오류가 발생했습니다.' }, 500);
  }
});

// 관리자: 문의 삭제
inquiriesRouter.delete('/:id', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    await c.env.DB.prepare('DELETE FROM inquiries WHERE id = ?')
      .bind(id)
      .run();

    return c.json({
      success: true,
      message: '문의가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Error deleting inquiry:', error);
    return c.json({ error: '문의 삭제 중 오류가 발생했습니다.' }, 500);
  }
});
