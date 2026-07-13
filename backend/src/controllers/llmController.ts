import type { Request, Response } from 'express';
import { llmService, type InterruptAction } from '../services/llmService';
import { wsService } from '../services/wsService';
import { success } from '../utils/response';
import { ApiError, asyncHandler, type ProjectStage } from '../types';

/**
 * LLM 控制器
 * 代理所有 LLM / Agent 相关请求到 Python 服务
 *
 * 当 Python 服务不可用时，控制器捕获异常并返回友好错误
 */

const INTERRUPT_ACTIONS: ReadonlyArray<InterruptAction> = [
  'confirm',
  'edit',
  'rollback',
  'abort',
];

/** 判断字符串是否为合法的中断动作 */
function parseInterruptAction(value: unknown): InterruptAction {
  if (typeof value !== 'string' || !INTERRUPT_ACTIONS.includes(value as InterruptAction)) {
    throw new ApiError(
      `HIL 中断 action 必须是 ${INTERRUPT_ACTIONS.join('/')} 之一`,
      400,
      -1,
    );
  }
  return value as InterruptAction;
}

/** 通用对话 */
export const chat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await llmService.chat(req.body);
    // 通过 WebSocket 推送对话进度（示例）
    wsService.broadcast('agent_progress', { event: 'chat_done', payload: { ok: true } });
    res.json(success(result, '对话成功'));
  } catch (err) {
    throw err;
  }
});

/** 触发 Agent 运行（兼容旧入参 + 新入参） */
export const runAgent = asyncHandler(async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const projectId =
    typeof body.project_id === 'string'
      ? body.project_id
      : typeof body.projectId === 'string'
        ? body.projectId
        : '';
  const question = typeof body.question === 'string' ? body.question : '';
  const discipline = typeof body.discipline === 'string' ? body.discipline : '';
  const startStage =
    typeof body.start_stage === 'string'
      ? (body.start_stage as ProjectStage)
      : typeof body.startStage === 'string'
        ? (body.startStage as ProjectStage)
        : undefined;

  if (!projectId || !question || !discipline) {
    throw new ApiError('runAgent 缺少必要字段 project_id/question/discipline', 400, -1);
  }

  const result = await llmService.runAgent({ projectId, question, discipline, startStage });
  res.json(success(result, 'Agent 运行已触发'));
});

/** 查询 Agent 状态 */
export const getAgentStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await llmService.getAgentStatus(id);
  res.json(success(result, '获取 Agent 状态成功'));
});

/** HIL 中断响应 */
export const interruptAgent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = parseInterruptAction(body.action);
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : undefined;
  const result = await llmService.interruptAgent(id, action, payload);
  res.json(success(result, 'HIL 中断响应已提交'));
});

/** 获取可用模型列表 */
export const listModels = asyncHandler(async (req: Request, res: Response) => {
  const result = await llmService.listModels();
  res.json(success(result, '获取模型列表成功'));
});
