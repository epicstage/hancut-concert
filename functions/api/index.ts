// API 라우터 통합

import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware';

// 라우터 임포트
import { authRouter } from './auth';
import { participantsRouter } from './participants';
import { adminParticipantsRouter } from './admin-participants';
import { inquiriesRouter } from './inquiries';
import { seatsRouter } from './seats';
import { checkinRouter } from './checkin';

// 메인 앱 생성
export const app = new Hono<{ Bindings: Env }>();

// CORS 미들웨어 적용
app.use('*', corsMiddleware);

// API 라우트 등록
const api = new Hono<{ Bindings: Env }>();

// 인증
api.route('/auth', authRouter);

// 참가자 (공개)
api.route('/participants', participantsRouter);

// 참가자 관리 (관리자)
api.route('/admin/participants', adminParticipantsRouter);

// 문의
api.route('/inquiries', inquiriesRouter);
api.route('/admin/inquiries', inquiriesRouter);

// 좌석 확인
api.route('/seat', seatsRouter);

// 체크인
api.route('/admin/checkin', checkinRouter);

// API 라우트 마운트
app.route('/api', api);

export type { Env };
