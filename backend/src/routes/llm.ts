import { Router } from 'express';
import {
  chat,
  runAgent,
  getAgentStatus,
  interruptAgent,
  listModels,
} from '../controllers/llmController';

/**
 * LLM 路由
 * 挂载前缀: /api/llm
 *
 * POST   /chat                 通用对话
 * POST   /agents/run           触发 Agent 运行
 * GET    /agents/:id/status    Agent 状态查询
 * POST   /agents/:id/interrupt HIL 中断响应
 * GET    /models               可用模型列表
 */
const router: Router = Router();

router.post('/chat', chat);
router.post('/agents/run', runAgent);
router.get('/agents/:id/status', getAgentStatus);
router.post('/agents/:id/interrupt', interruptAgent);
router.get('/models', listModels);

export default router;
