import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  advanceProject,
  rollbackProject,
  getPipeline,
  resumePipeline,
  abortPipeline,
  runDemoPipeline,
  updatePipelineMode,
  updateDraftTemplate,
  getDraft,
  renderDraftHandler,
  downloadDraft,
} from '../controllers/projectController';
import { authenticate } from '../middleware/auth';

/**
 * 项目路由
 * 挂载前缀: /api/projects
 * 所有路由均需登录认证
 *
 * 基础 CRUD
 *   GET    /                       列表（普通用户只看自己的，admin 看全部）
 *   GET    /:id                    详情（校验 owner）
 *   POST   /                       创建（绑定当前用户为 owner）
 *   PATCH  /:id                    更新（校验 owner）
 *   DELETE /:id                    删除（校验 owner）
 *   POST   /:id/advance            推进阶段（校验 owner）
 *   POST   /:id/rollback           回滚阶段（校验 owner）
 *
 * 流水线控制
 *   GET    /:id/pipeline           获取项目 pipeline 状态
 *   POST   /:id/pipeline/resume    恢复/推进（body: {action, payload?}）
 *   POST   /:id/pipeline/abort     中止
 *   POST   /:id/pipeline/demo-run  本地跑完 8 阶段（demo 兜底）
 *   PATCH  /:id/pipeline/mode      切换 auto/manual
 *   PATCH  /:id/pipeline/template  切换初稿模板
 *
 * 初稿读写
 *   GET    /:id/draft              获取 draft 文本
 *   POST   /:id/draft/render       渲染初稿（body: {template}）
 *   GET    /:id/draft/download     下载 .tex/.md 文件
 */
const router: Router = Router();

// 全部路由强制认证
router.use(authenticate);

router.get('/', listProjects);
router.get('/:id', getProject);
router.post('/', createProject);
router.patch('/:id', updateProject);
router.post('/:id/artifacts/seed', async (req, res, next) => {
  // Debug 端点：直接覆盖/合并项目 artifacts，用于在没有完整 LLM 流水线的情况下
  // 验证 docx/markdown 模板的图片嵌入。生产环境应在非 dev 模式下禁用。
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ code: 403, message: '生产环境禁用' });
    }
    const { updateArtifacts } = await import('../controllers/projectController');
    return updateArtifacts(req, res, next);
  } catch (e) {
    return next(e);
  }
});
router.delete('/:id', deleteProject);
router.post('/:id/advance', advanceProject);
router.post('/:id/rollback', rollbackProject);

// 流水线相关
router.get('/:id/pipeline', getPipeline);
router.post('/:id/pipeline/resume', resumePipeline);
router.post('/:id/pipeline/abort', abortPipeline);
router.post('/:id/pipeline/demo-run', runDemoPipeline);
router.patch('/:id/pipeline/mode', updatePipelineMode);
router.patch('/:id/pipeline/template', updateDraftTemplate);

// 初稿相关
router.get('/:id/draft', getDraft);
router.post('/:id/draft/render', renderDraftHandler);
router.get('/:id/draft/download', downloadDraft);

export default router;
