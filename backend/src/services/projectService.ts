import { v4 as uuidv4 } from 'uuid';
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStage,
  ProjectVersion,
  ProjectRequester,
  PipelineStatus,
  PipelineMode,
  DraftTemplate,
  ProjectArtifacts,
  HilItem,
} from '../types';
import { STAGE_ORDER, ApiError } from '../types';
import { llmService, type AgentStatusResponse } from './llmService';
import { query } from '../db/pool';

/**
 * 项目服务（MySQL 持久化版）
 * versions / hilQueue / artifacts 用 JSON 列存
 * 服务重启后数据保留
 */

/** 流水线产物摘要（用于 WebSocket 推送，避免一次性塞全量数据） */
export interface PipelineSummary {
  projectId: string;
  status: PipelineStatus;
  /** 旧字段，保留兼容 */
  step?: string;
  /** 新字段，与前端 applyPipelineUpdate 对齐 */
  currentStep?: string;
  mode: PipelineMode;
  template: DraftTemplate;
  agentId?: string;
  /** 完整 artifacts，WS 推送时前端可即时刷新 */
  artifacts?: ProjectArtifacts;
  hasDraft: boolean;
  sectionKeys: string[];
  figureCount: number;
}

/** 数据库行结构 */
interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  discipline: string;
  question: string;
  description: string | null;
  stage: string;
  status: string;
  mode: string;
  template: string;
  pipeline_status: string;
  agent_id: string | null;
  current_step: string | null;
  artifacts: unknown;
  versions: unknown;
  hil_queue: unknown;
  created_at: Date;
  updated_at: Date;
}

/**
 * 解析 JSON 列：兼容 mysql2 自动反序列化（对象/数组）和原始字符串两种情况。
 * mysql2 对 JSON 列默认返回已解析的 JS 对象，直接 JSON.parse 会抛错。
 */
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    if (value.length === 0) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  // mysql2 已自动解析为对象/数组
  return value as T;
}

/** 把数据库行转成 Project 实体 */
function rowToProject(row: ProjectRow): Project {
  const artifacts = parseJsonColumn<ProjectArtifacts>(row.artifacts, {});
  const versions = parseJsonColumn<ProjectVersion[]>(row.versions, []);
  const hilQueue = parseJsonColumn<HilItem[]>(row.hil_queue, []);
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    discipline: row.discipline,
    question: row.question,
    description: row.description ?? '',
    stage: row.stage as ProjectStage,
    status: row.status as Project['status'],
    mode: row.mode as PipelineMode,
    template: row.template as DraftTemplate,
    pipelineStatus: row.pipeline_status as PipelineStatus,
    agentId: row.agent_id ?? undefined,
    currentStep: row.current_step ?? undefined,
    artifacts,
    versions,
    hilQueue,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

class ProjectService {
  /** 获取全部项目列表 */
  async list(): Promise<Project[]> {
    const rows = await query<ProjectRow[]>('SELECT * FROM projects ORDER BY created_at DESC');
    return rows.map(rowToProject);
  }

  /** 按 owner 过滤项目列表 */
  async listByOwner(ownerId: string): Promise<Project[]> {
    const rows = await query<ProjectRow[]>(
      'SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC',
      [ownerId],
    );
    return rows.map(rowToProject);
  }

  /**
   * 根据 ID 获取项目
   * @param id 项目 ID
   * @param requester 访问者信息；提供时将做 owner 校验（admin 放行）
   */
  async getById(id: string, requester?: ProjectRequester): Promise<Project> {
    const rows = await query<ProjectRow[]>('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      throw new ApiError(`项目不存在: ${id}`, 404, -1);
    }
    const project = rowToProject(rows[0]);
    if (requester && requester.role !== 'admin' && project.ownerId !== requester.id) {
      throw new ApiError('无权访问该项目', 403, -1);
    }
    return project;
  }

  /** 创建项目（需绑定创建者 ownerId） */
  async create(input: CreateProjectInput, ownerId: string): Promise<Project> {
    const now = new Date();
    const id = uuidv4();
    const initialStage: ProjectStage = 'literature';
    const mode: PipelineMode = input.mode === 'manual' ? 'manual' : 'auto';
    const template: DraftTemplate = input.template ?? 'markdown';
    const description = input.description ?? '';

    const versionSnapshot: ProjectVersion = {
      version: 1,
      stage: initialStage,
      timestamp: now.toISOString(),
      note: '项目创建',
      snapshot: {
        name: input.name,
        discipline: input.discipline,
        question: input.question,
        description,
      },
    };

    await query(
      `INSERT INTO projects
        (id, owner_id, name, discipline, question, description, stage, status, mode, template,
         pipeline_status, artifacts, versions, hil_queue, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerId,
        input.name,
        input.discipline,
        input.question,
        description,
        initialStage,
        'draft',
        mode,
        template,
        'idle',
        JSON.stringify({}),
        JSON.stringify([versionSnapshot]),
        JSON.stringify([]),
        now,
        now,
      ],
    );

    return this.getById(id);
  }

  /** 更新项目（部分字段） */
  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const project = await this.getById(id);
    const now = new Date();
    const newMode = input.mode !== undefined ? input.mode : project.mode;
    const newTemplate = input.template !== undefined ? input.template : project.template;

    await query(
      `UPDATE projects
       SET name = ?, discipline = ?, question = ?, description = ?,
           stage = ?, status = ?, mode = ?, template = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.name ?? project.name,
        input.discipline ?? project.discipline,
        input.question ?? project.question,
        input.description ?? project.description,
        input.stage ?? project.stage,
        input.status ?? project.status,
        newMode,
        newTemplate,
        now,
        id,
      ],
    );

    const updated = await this.getById(id);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /** 删除项目 */
  async remove(id: string): Promise<void> {
    await this.getById(id); // 不存在会抛 404
    await query('DELETE FROM projects WHERE id = ?', [id]);
  }

  /** 推进到下一阶段 */
  async advance(id: string): Promise<Project> {
    const project = await this.getById(id);
    const currentIndex = STAGE_ORDER.indexOf(project.stage);
    if (currentIndex < 0 || currentIndex >= STAGE_ORDER.length - 1) {
      throw new ApiError(`项目已处于最后阶段，无法继续推进: ${project.stage}`, 400, -1);
    }
    const nextStage = STAGE_ORDER[currentIndex + 1];
    return this.changeStage(project, nextStage, `阶段推进: ${project.stage} -> ${nextStage}`);
  }

  /** 回滚到指定阶段或版本 */
  async rollback(id: string, target?: { version?: number; stage?: ProjectStage }): Promise<Project> {
    const project = await this.getById(id);

    // 优先按版本号回滚
    if (target?.version !== undefined) {
      const targetVersion = project.versions.find((v) => v.version === target.version);
      if (!targetVersion) {
        throw new ApiError(`版本不存在: ${target.version}`, 400, -1);
      }
      // 恢复快照内容
      const restored: Project = {
        ...project,
        name: targetVersion.snapshot.name,
        discipline: targetVersion.snapshot.discipline,
        question: targetVersion.snapshot.question,
        description: targetVersion.snapshot.description,
      };
      return this.changeStage(restored, targetVersion.stage, `回滚到版本 ${targetVersion.version}`);
    }

    // 按阶段回滚
    if (target?.stage !== undefined) {
      return this.changeStage(project, target.stage, `回滚到阶段: ${target.stage}`);
    }

    // 默认回滚到上一阶段
    const currentIndex = STAGE_ORDER.indexOf(project.stage);
    if (currentIndex <= 0) {
      throw new ApiError(`项目已处于初始阶段，无法回滚: ${project.stage}`, 400, -1);
    }
    const prevStage = STAGE_ORDER[currentIndex - 1];
    return this.changeStage(project, prevStage, `回滚到上一阶段: ${prevStage}`);
  }

  // ───────────────────────── 流水线相关扩展 ─────────────────────────

  /**
   * 把 LLM AgentStatus 同步到 project（stage / artifacts / pipelineStatus / currentStep）。
   */
  async syncFromAgent(projectId: string, agent: AgentStatusResponse | undefined | null): Promise<Project> {
    if (!agent) return this.getById(projectId);
    const project = await this.getById(projectId);
    const now = new Date();

    let newStage = project.stage;
    let newStep = project.currentStep;
    const stage = typeof agent.stage === 'string' ? agent.stage : undefined;
    if (stage && STAGE_ORDER.includes(stage as ProjectStage)) {
      newStage = stage as ProjectStage;
      newStep = stage as ProjectStage;
    }

    let newArtifacts = project.artifacts ?? {};
    if (agent.artifacts && typeof agent.artifacts === 'object') {
      // LLM 服务用 snake_case（paper_sections/experiment_design/experiment_results/draft_text），
      // 前端用 camelCase。这里统一转 camelCase，保证两端字段名对齐。
      const SNAKE_CAMEL_MAP: Record<string, string> = {
        paper_sections: 'paperSections',
        experiment_design: 'experimentDesign',
        experiment_results: 'experimentResults',
        draft_text: 'draftText',
        hil_queue: 'hilQueue',
      };
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(agent.artifacts as Record<string, unknown>)) {
        normalized[SNAKE_CAMEL_MAP[k] ?? k] = v;
      }
      newArtifacts = { ...newArtifacts, ...normalized };
    }

    let newPipelineStatus = project.pipelineStatus;
    let newStatus = project.status;
    const agentStatus = String(agent.status ?? '');
    if (agentStatus === 'completed') {
      newPipelineStatus = 'completed';
      newStatus = 'completed';
    } else if (agentStatus === 'interrupted') {
      newPipelineStatus = 'interrupted';
      newStatus = 'paused';
    } else if (agentStatus === 'aborted') {
      newPipelineStatus = 'aborted';
      newStatus = 'paused';
    } else if (agentStatus === 'error') {
      newPipelineStatus = 'error';
      newStatus = 'paused';
    } else if (agentStatus === 'running') {
      newPipelineStatus = 'running';
      newStatus = 'running';
    }

    await query(
      `UPDATE projects
       SET stage = ?, current_step = ?, artifacts = ?, pipeline_status = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        newStage,
        newStep ?? null,
        JSON.stringify(newArtifacts),
        newPipelineStatus,
        newStatus,
        now,
        projectId,
      ],
    );

    const updated = await this.getById(projectId);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /** 绑定 Agent ID 到项目 */
  async attachAgent(projectId: string, agentId: string): Promise<Project> {
    const project = await this.getById(projectId);
    const now = new Date();
    await query(
      'UPDATE projects SET agent_id = ?, updated_at = ? WHERE id = ?',
      [agentId, now, projectId],
    );
    const updated = await this.getById(projectId);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /** 设置流水线状态 */
  async setPipelineStatus(projectId: string, status: PipelineStatus, step?: string): Promise<Project> {
    const project = await this.getById(projectId);
    const now = new Date();
    let newStatus = project.status;
    if (status === 'running') newStatus = 'running';
    else if (status === 'completed') newStatus = 'completed';
    else if (status === 'aborted' || status === 'error') newStatus = 'paused';

    await query(
      `UPDATE projects
       SET pipeline_status = ?, current_step = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        status,
        step !== undefined ? step : project.currentStep ?? null,
        newStatus,
        now,
        projectId,
      ],
    );

    const updated = await this.getById(projectId);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /** 合并设置流水线产物 */
  async setArtifacts(projectId: string, artifacts: Partial<ProjectArtifacts>): Promise<Project> {
    const project = await this.getById(projectId);
    const base: ProjectArtifacts = project.artifacts ?? {};
    const merged = { ...base, ...artifacts };
    const now = new Date();
    await query(
      'UPDATE projects SET artifacts = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(merged), now, projectId],
    );
    const updated = await this.getById(projectId);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /** 切换流水线运行模式 */
  async setMode(projectId: string, mode: PipelineMode): Promise<Project> {
    const project = await this.getById(projectId);
    const now = new Date();
    await query(
      'UPDATE projects SET mode = ?, updated_at = ? WHERE id = ?',
      [mode, now, projectId],
    );
    const updated = await this.getById(projectId);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /** 切换初稿模板 */
  async setTemplate(projectId: string, template: DraftTemplate): Promise<Project> {
    const project = await this.getById(projectId);
    const now = new Date();
    await query(
      'UPDATE projects SET template = ?, updated_at = ? WHERE id = ?',
      [template, now, projectId],
    );
    const updated = await this.getById(projectId);
    this.broadcastPipelineUpdate(updated);
    return updated;
  }

  /**
   * 懒启动 Agent
   */
  async getOrCreateAgentForProject(
    projectId: string,
    payload: { startStage?: ProjectStage },
  ): Promise<Project> {
    const project = await this.getById(projectId);
    if (
      project.agentId &&
      project.pipelineStatus !== 'completed' &&
      project.pipelineStatus !== 'aborted' &&
      project.pipelineStatus !== 'error'
    ) {
      return project;
    }
    try {
      const resp = await llmService.runAgent({
        projectId: project.id,
        question: project.question,
        discipline: project.discipline,
        startStage: payload.startStage ?? project.stage,
        mode: project.mode,
        template: project.template,
      });
      await this.attachAgent(project.id, resp.agent_id ?? '');
      await this.syncFromAgent(project.id, resp.status);
      return this.getById(projectId);
    } catch (err) {
      console.warn(
        `[projectService] 启动 Agent 失败（不影响项目创建）: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.setPipelineStatus(project.id, 'idle', '等待启动');
      return this.getById(projectId);
    }
  }

  /** 构造流水线摘要（WS 推送用，字段名与前端对齐） */
  toPipelineSummary(project: Project): PipelineSummary {
    const artifacts = project.artifacts ?? {};
    const sections = artifacts.paperSections ?? {};
    return {
      projectId: project.id,
      status: project.pipelineStatus,
      // 字段名与前端 applyPipelineUpdate 对齐（旧字段 step 保留兼容）
      currentStep: project.currentStep,
      step: project.currentStep,
      mode: project.mode,
      template: project.template,
      agentId: project.agentId,
      // 推送完整 artifacts，前端可即时刷新高亮组件
      artifacts,
      hasDraft: typeof artifacts.draftText === 'string' && artifacts.draftText.length > 0,
      sectionKeys: Object.keys(sections),
      figureCount: Array.isArray(artifacts.figures) ? artifacts.figures.length : 0,
    };
  }

  // ───────────────────────── 内部辅助 ─────────────────────────

  /** 切换阶段并记录版本快照 */
  private async changeStage(project: Project, newStage: ProjectStage, note: string): Promise<Project> {
    const now = new Date();
    const previousStage = project.stage;

    const nextVersionNumber =
      project.versions.length > 0
        ? Math.max(...project.versions.map((v) => v.version)) + 1
        : 1;

    const versionSnapshot: ProjectVersion = {
      version: nextVersionNumber,
      stage: newStage,
      timestamp: now.toISOString(),
      note,
      snapshot: {
        name: project.name,
        discipline: project.discipline,
        question: project.question,
        description: project.description,
      },
    };

    const newVersions = [...project.versions, versionSnapshot];

    await query(
      `UPDATE projects
       SET stage = ?, status = ?, versions = ?, updated_at = ?
       WHERE id = ?`,
      [newStage, 'running', JSON.stringify(newVersions), now, project.id],
    );

    const updated = await this.getById(project.id);

    // 触发阶段变更事件（延迟导入避免循环依赖）
    void import('./wsService').then(({ wsService }) => {
      wsService.broadcast('stage_change', {
        projectId: project.id,
        from: previousStage,
        to: newStage,
        version: nextVersionNumber,
        note,
      });
      wsService.broadcast('pipeline_update', this.toPipelineSummary(updated));
    });

    return updated;
  }

  /** 广播 pipeline_update 事件 */
  private broadcastPipelineUpdate(project: Project): void {
    const summary = this.toPipelineSummary(project);
    void import('./wsService').then(({ wsService }) => {
      wsService.broadcast('pipeline_update', summary);
    });
  }
}

export const projectService = new ProjectService();
