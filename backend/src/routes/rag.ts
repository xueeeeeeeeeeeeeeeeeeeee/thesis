import { Router } from 'express';
import { query, ingest, sources } from '../controllers/ragController';

/**
 * RAG 路由
 * 挂载前缀: /api/rag
 *
 * POST /query    检索
 * POST /ingest   导入文献
 * GET  /sources  数据源列表
 */
const router: Router = Router();

router.post('/query', query);
router.post('/ingest', ingest);
router.get('/sources', sources);

export default router;
