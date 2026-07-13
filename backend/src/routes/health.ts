import { Router } from 'express';
import { config } from '../config';
import { success } from '../utils/response';

/**
 * 健康检查路由
 * GET /health → 服务健康状态
 */
const router: Router = Router();

router.get('/health', (_req, res) => {
  res.json(
    success(
      {
        status: 'ok',
        service: config.serviceName,
        time: new Date().toISOString(),
        version: config.version,
        env: config.nodeEnv,
      },
      '服务正常',
    ),
  );
});

export default router;
