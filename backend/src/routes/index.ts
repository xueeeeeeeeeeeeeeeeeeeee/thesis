import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth';
import projectRouter from './project';
import llmRouter from './llm';
import ragRouter from './rag';
import wsRouter from './ws';

/**
 * 路由聚合
 *
 * - /health                健康检查
 * - /api/auth              账号认证
 * - /api/projects          项目管理
 * - /api/llm               LLM 代理
 * - /api/rag               RAG 代理
 * - /api/ws                WebSocket 状态信息
 */
const router: Router = Router();

router.use('/', healthRouter);
router.use('/api/auth', authRouter);
router.use('/api/projects', projectRouter);
router.use('/api/llm', llmRouter);
router.use('/api/rag', ragRouter);
router.use('/api/ws', wsRouter);

export default router;
