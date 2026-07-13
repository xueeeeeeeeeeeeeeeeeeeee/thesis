import { Router } from 'express';
import { wsService } from '../services/wsService';
import { success } from '../utils/response';
import { asyncHandler } from '../types';

/**
 * WebSocket 路由（HTTP 信息接口）
 *
 * 注意：真正的 WebSocket 连接由 wsService 在 HTTP server 的 upgrade 事件中处理，
 * 监听路径 /ws。此路由仅提供 WebSocket 状态查询与手动广播的 HTTP 接口，
 * 便于调试与前端获取连接信息。
 *
 * 挂载前缀: /api/ws
 *
 * GET  /          WebSocket 服务状态与客户端列表
 * POST /broadcast 手动向所有客户端广播事件
 */
const router: Router = Router();

/** WebSocket 服务状态 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const info = {
      path: '/ws',
      clientCount: wsService.getClientCount(),
      clients: wsService.getClients(),
    };
    res.json(success(info, '获取 WebSocket 状态成功'));
  }),
);

/** 手动广播事件（调试用） */
router.post(
  '/broadcast',
  asyncHandler(async (req, res) => {
    const { type, payload } = req.body as { type?: string; payload?: unknown };
    if (!type) {
      throw new Error('事件类型(type)不能为空');
    }
    wsService.broadcast(type as never, payload ?? {});
    res.json(success({ broadcast: true, clientCount: wsService.getClientCount() }, '广播成功'));
  }),
);

export default router;
