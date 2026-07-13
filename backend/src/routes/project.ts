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
router.delete('/:id', deleteProject);
router.post('/:id/advance', advanceProject);
router.post('/:id/rollback', rollbackProject);

// 流水线相关
router.get('/:id/pipeline', getPipeline);
router.post('/:id/pipeline/resume', resumePipeline);
router.post('/:id/pipeline/abort', abortPipeline);
router.patch('/:id/pipeline/mode', updatePipelineMode);
router.patch('/:id/pipeline/template', updateDraftTemplate);

// 初稿相关
router.get('/:id/draft', getDraft);
router.post('/:id/draft/render', renderDraftHandler);
router.get('/:id/draft/download', downloadDraft);

export default router;
