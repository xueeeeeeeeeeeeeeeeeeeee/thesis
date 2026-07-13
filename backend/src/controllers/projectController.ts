import type { Response } from 'express';
import { projectService } from '../services/projectService';
import { llmService, type InterruptAction } from '../services/llmService';
import { success } from '../utils/response';
import {
  ApiError,
  asyncHandler,
  type AuthRequest,
  type CreateProjectInput,
  type UpdateProjectInput,
  type RollbackInput,
  type ProjectStage,
  type ProjectRequester,
  type PipelineMode,
  type DraftTemplate,
  type PipelineStatus,
} from '../types';
import { renderDraft, templateExtension, templateMime } from '../services/draftRenderer';

/**
 * 项目控制器
 * 处理项目的 CRUD、阶段推进、回滚以及论文生成流水线相关接口
 * 所有接口均需登录，普通用户只能访问自己的项目，admin 可访问全部
 */

const PIPELINE_MODES: ReadonlyArray<PipelineMode> = ['auto', 'manual'];
const DRAFT_TEMPLATES: ReadonlyArray<DraftTemplate> = [
  'ctex',
  'ieee',
  'journal',
  'markdown',
];
const PIPELINE_STATUSES: ReadonlyArray<PipelineStatus> = [
  'idle',
  'running',
  'interrupted',
  'completed',
  'aborted',
  'error',
];
const INTERRUPT_ACTIONS: ReadonlyArray<InterruptAction> = [
  'confirm',
  'edit',
  'rollback',
  'abort',
];

/** 构造访问者信息 */
function requesterOf(req: AuthRequest): ProjectRequester {
  const user = req.user;
  if (!user) {
    throw new ApiError('未登录', 401, -1);
  }
  return { id: user.id, role: user.role };
}

/** 把字符串限制为合法模板 */
function parseTemplate(value: unknown, fallback?: DraftTemplate): DraftTemplate {
  if (typeof value !== 'string') {
    if (fallback) return fallback;
    throw new ApiError('模板类型缺失', 400, -1);
  }
  if (!DRAFT_TEMPLATES.includes(value as DraftTemplate)) {
    throw new ApiError(
      `模板必须是 ${DRAFT_TEMPLATES.join('/')} 之一`,
      400,
      -1,
    );
  }
  return value as DraftTemplate;
}

function parseMode(value: unknown): PipelineMode {
  if (typeof value !== 'string' || !PIPELINE_MODES.includes(value as PipelineMode)) {
    throw new ApiError(
      `运行模式必须是 ${PIPELINE_MODES.join('/')} 之一`,
      400,
      -1,
    );
  }
  return value as PipelineMode;
}

function parsePipelineStatus(value: unknown): PipelineStatus {
  if (
    typeof value !== 'string' ||
    !PIPELINE_STATUSES.includes(value as PipelineStatus)
  ) {
    throw new ApiError(
      `流水线状态必须是 ${PIPELINE_STATUSES.join('/')} 之一`,
      400,
      -1,
    );
  }
  return value as PipelineStatus;
}

function parseInterruptAction(value: unknown): InterruptAction {
  if (
    typeof value !== 'string' ||
    !INTERRUPT_ACTIONS.includes(value as InterruptAction)
  ) {
    throw new ApiError(
      `HIL action 必须是 ${INTERRUPT_ACTIONS.join('/')} 之一`,
      400,
      -1,
    );
  }
  return value as InterruptAction;
}

// ──────────────────────────── 基础 CRUD ────────────────────────────

/** 获取项目列表（admin 看全部，普通用户只看自己的） */
export const listProjects = asyncHandler(async (req: AuthRequest, res: Response) => {
  const requester = requesterOf(req);
  const projects =
    requester.role === 'admin'
      ? await projectService.list()
      : await projectService.listByOwner(requester.id);
  res.json(success(projects, '获取项目列表成功'));
});

/** 获取项目详情（校验 owner） */
export const getProject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const project = await projectService.getById(id, requesterOf(req));
  res.json(success(project, '获取项目详情成功'));
});

/**
 * 创建项目（绑定当前用户为 owner，并懒启动 Agent）
 * 入参兼容旧字段 name/discipline/question/description，新增 mode/template
 */
export const createProject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = body.name;
  const discipline = body.discipline;
  const question = body.question;
  const description = body.description;

  // 参数校验
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError('项目名称(name)不能为空', 400, -1);
  }
  if (!discipline || typeof discipline !== 'string' || !discipline.trim()) {
    throw new ApiError('学科(discipline)不能为空', 400, -1);
  }
  if (!question || typeof question !== 'string' || !question.trim()) {
    throw new ApiError('研究问题(question)不能为空', 400, -1);
  }

  const requester = requesterOf(req);
  const mode: PipelineMode = body.mode === 'manual' ? 'manual' : 'auto';
  const template = parseTemplate(body.template, 'markdown');

  // 1) 先创建项目（确保项目一定能落地）
  const project = await projectService.create(
    {
      name: name.trim(),
      discipline: discipline.trim(),
      question: question.trim(),
      description: typeof description === 'string' ? description : '',
      mode,
      template,
    },
    requester.id,
  );

  // 2) 懒启动 Agent（失败时静默降级，不影响创建）
  try {
    const withAgent = await projectService.getOrCreateAgentForProject(project.id, {});
    res.status(201).json(success(withAgent, '创建项目成功'));
  } catch (err) {
    // 兜底：返回原始项目对象
    res.status(201).json(success(project, '创建项目成功（Agent 启动待补）'));
  }
});

/** 更新项目（校验 owner） */
export const updateProject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  await projectService.getById(id, requester); // owner 校验
  const input = req.body as UpdateProjectInput;
  const project = await projectService.update(id, input);
  res.json(success(project, '更新项目成功'));
});

/** 删除项目（校验 owner） */
export const deleteProject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  await projectService.getById(id, requester); // owner 校验
  await projectService.remove(id);
  res.json(success(null, '删除项目成功'));
});

/** 推进到下一阶段（校验 owner） */
export const advanceProject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  await projectService.getById(id, requester); // owner 校验
  const project = await projectService.advance(id);
  res.json(success(project, '阶段推进成功'));
});

/** 回滚到指定阶段或版本（校验 owner） */
export const rollbackProject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  await projectService.getById(id, requester); // owner 校验
  const { version, stage } = (req.body ?? {}) as RollbackInput;
  const target: RollbackInput = {};
  if (typeof version === 'number') target.version = version;
  if (typeof stage === 'string') target.stage = stage as ProjectStage;
  const project = await projectService.rollback(id, target);
  res.json(success(project, '阶段回滚成功'));
});

// ──────────────────────────── 流水线控制 ────────────────────────────

/** 获取项目流水线状态（含 Agent 实时状态） */
export const getPipeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  const project = await projectService.getById(id, requester);

  // 尝试获取 Agent 实时状态，失败时返回 null（不阻塞）
  let agentStatus: unknown = null;
  if (project.agentId) {
    try {
      agentStatus = await llmService.getAgentStatus(project.agentId);
    } catch (err) {
      agentStatus = {
        available: false,
        message: `LLM 服务不可用: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  // 兼容旧字段名：LLM 服务返回的 hil_pending 在 agent 里
  const agentObj = (agentStatus ?? {}) as Record<string, unknown>;
  const hilPending = (agentObj.hil_pending ?? null) as unknown;

  res.json(
    success(
      {
        // 顶层快捷字段（前端轮询直接读这些，避免 data.project.xxx 套娃）
        status: project.pipelineStatus,
        currentStep: project.currentStep ?? project.stage,
        agentId: project.agentId ?? null,
        mode: project.mode,
        template: project.template,
        artifacts: project.artifacts ?? {},
        hilPending,
        // 完整对象（向后兼容已有消费者）
        project,
        summary: projectService.toPipelineSummary(project),
        agent: agentStatus,
      },
      '获取流水线状态成功',
    ),
  );
});

/**
 * 恢复 / 推进流水线
 * body: { action: 'confirm'|'edit'|'rollback'|'abort', payload?: object }
 */
export const resumePipeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  const project = await projectService.getById(id, requester);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = parseInterruptAction(body.action);
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : undefined;

  // 项目尚未绑定 agent 时，自动懒启动一个
  let effectiveProject = project;
  if (!project.agentId) {
    effectiveProject = await projectService.getOrCreateAgentForProject(project.id, {});
  }
  const agentId = effectiveProject.agentId ?? '';

  if (!agentId) {
    // LLM 服务不可用，返回友好错误
    await projectService.setPipelineStatus(project.id, 'error', 'LLM 服务不可用');
    throw new ApiError(
      'LLM 服务暂不可用，无法恢复流水线，请稍后重试或启动 Python 服务',
      503,
      -1,
    );
  }

  try {
    const result = await llmService.interruptAgent(agentId, action, payload);
    // 把 LLM 返回的 AgentStatus 同步到 project（stage/artifacts/pipelineStatus）
    // result 形如 AgentStatusResponse，含 stage / artifacts / hil_pending 等
    const agentStatus = (result ?? undefined) as
      | import('../services/llmService').AgentStatusResponse
      | undefined;
    if (agentStatus) {
      await projectService.syncFromAgent(project.id, agentStatus);
    }
    // 兜底：若 LLM 未返回 status 字段，按 action 推断
    if (!agentStatus || !agentStatus.status) {
      const nextStatus: PipelineStatus = action === 'abort' ? 'aborted' : 'running';
      await projectService.setPipelineStatus(project.id, nextStatus, action);
    }
    res.json(success({ agentId, action, result }, '流水线恢复指令已提交'));
  } catch (err) {
    // LLM 服务异常时不影响前端显示
    const message = err instanceof Error ? err.message : String(err);
    await projectService.setPipelineStatus(project.id, 'error', message);
    throw new ApiError(`恢复流水线失败: ${message}`, 503, -1);
  }
});

/** 中止流水线 */
export const abortPipeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  const project = await projectService.getById(id, requester);

  let agentResult: unknown = null;
  if (project.agentId) {
    try {
      agentResult = await llmService.interruptAgent(project.agentId, 'abort');
    } catch (err) {
      agentResult = {
        skipped: true,
        message: `LLM 服务不可用，已仅在本地中止: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }
  const updated = await projectService.setPipelineStatus(project.id, 'aborted', 'abort');
  res.json(success({ project: updated, agentResult }, '流水线已中止'));
});

/** 切换流水线模式 */
export const updatePipelineMode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  await projectService.getById(id, requester);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = parseMode(body.mode);
  const project = await projectService.setMode(id, mode);
  res.json(success(project, `流水线模式已切换为 ${mode}`));
});

/** 切换初稿模板 */
export const updateDraftTemplate = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const requester = requesterOf(req);
    await projectService.getById(id, requester);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const template = parseTemplate(body.template);
    const project = await projectService.setTemplate(id, template);
    res.json(success(project, `初稿模板已切换为 ${template}`));
  },
);

// ──────────────────────────── 初稿读写 ────────────────────────────

/** 获取项目当前 draft 文本与模板 */
export const getDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requester = requesterOf(req);
  const project = await projectService.getById(id, requester);
  const artifacts = project.artifacts ?? {};
  res.json(
    success(
      {
        template: project.template,
        text: artifacts.draftText ?? '',
        sections: artifacts.paperSections ?? {},
        figures: artifacts.figures ?? [],
        hasDraft:
          typeof artifacts.draftText === 'string' && artifacts.draftText.length > 0,
        updatedAt: project.updatedAt,
      },
      '获取初稿成功',
    ),
  );
});

/**
 * 渲染初稿：按指定模板重新生成 draftText 并落库
 * body: { template: DraftTemplate }
 */
export const renderDraftHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const requester = requesterOf(req);
    const project = await projectService.getById(id, requester);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const template = parseTemplate(body.template, project.template);
    const artifacts = project.artifacts ?? {};
    const rendered = renderDraft(artifacts, template, {
      projectName: project.name,
      discipline: project.discipline,
      question: project.question,
    });
    const updated = await projectService.setArtifacts(project.id, {
      draftText: rendered.text,
    });
    await projectService.setTemplate(project.id, rendered.template);
    res.json(
      success(
        {
          template: rendered.template,
          text: rendered.text,
          length: rendered.text.length,
          updatedAt: updated.updatedAt,
        },
        '初稿渲染成功',
      ),
    );
  },
);

/** 下载初稿文件 */
export const downloadDraft = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const requester = requesterOf(req);
    const project = await projectService.getById(id, requester);
    const artifacts = project.artifacts ?? {};
    const text =
      typeof artifacts.draftText === 'string' && artifacts.draftText.length > 0
        ? artifacts.draftText
        : renderDraft(artifacts, project.template, {
            projectName: project.name,
            discipline: project.discipline,
            question: project.question,
          }).text;
    const ext = templateExtension(project.template);
    const mime = templateMime(project.template);
    // 兼容中文文件名：basic 用 ASCII 安全名，filename* 用 RFC 5987 UTF-8
    const safeBase =
      project.name.replace(/[^\w一-龥\-_.]/g, '_').replace(/[^\x20-\x7E]/g, '_') || 'draft';
    const utf8Name = `${project.name || 'draft'}.${ext}`;
    const asciiName = `${safeBase || 'draft'}.${ext}`;
    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
    );
    res.send(text);
  },
);
