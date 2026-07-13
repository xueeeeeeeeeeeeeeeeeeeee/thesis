import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * 类型定义集合
 * 贯穿整个后端的核心数据结构
 */

/** 项目阶段（与 LLM 服务 8 阶段对齐，去掉旧 topic/hypothesis/analysis/review） */
export type ProjectStage =
  | 'literature'   // 文献综述
  | 'design'       // 实验设计
  | 'experiment'   // 实验执行
  | 'evaluate'     // 结果评价
  | 'discuss'      // 讨论
  | 'write'        // 论文撰写
  | 'figure'       // 画图
  | 'submit';      // 投稿

/** 项目状态 */
export type ProjectStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

/** 流水线运行模式：auto 全自动 / manual 手动逐步触发 */
export type PipelineMode = 'auto' | 'manual';

/** 论文初稿模板 */
export type DraftTemplate = 'ctex' | 'ieee' | 'journal' | 'markdown';

/** 流水线状态 */
export type PipelineStatus =
  | 'idle'        // 空闲，未启动
  | 'running'     // 运行中
  | 'interrupted' // HIL 中断
  | 'completed'   // 已完成
  | 'aborted'     // 已中止
  | 'error';      // 异常

/** 实验指标（通用三元组，适配多学科：CS 的 accuracy、化学的产率、生物的表达量、社科的相关系数） */
export interface ExperimentMetric {
  /** 指标名（如 accuracy / 产率 / 表达量 / 相关系数） */
  name: string;
  /** 指标值（字符串以兼容不同精度与单位） */
  value: string;
  /** 单位（如 % / mg·mL⁻¹ / 倍 / 无） */
  unit?: string;
  /** 备注（如测试集、置信区间、显著性） */
  note?: string;
}

/**
 * 用户输入的实验内容与结果（跨学科通用 schema）。
 * experiment 阶段由用户手动填写，evaluate 阶段基于此评估。
 */
export interface ExperimentInput {
  /** 数据来源标识：user=用户输入 / agent=LLM 模拟（兼容 auto 模式回退） */
  source?: 'user' | 'agent';
  /** 实验方法/设计描述（可参考 design 阶段的 experiment_design 预填） */
  methodology: string;
  /** 实验材料/数据来源（数据集 / 试剂 / 样本 / 被试 / 文献语料等） */
  materials: string;
  /** 实验步骤/过程（可有序号或自由文本） */
  procedure: string;
  /** 结构化指标列表（通用，适配各学科） */
  metrics: ExperimentMetric[];
  /** 结果文字描述（图表说明、现象描述、关键发现） */
  resultsDescription: string;
  /** 原始日志/记录（可选，代码运行日志、实验观测记录等） */
  rawLogs?: string;
  /** 其他备注（可选） */
  notes?: string;
}

/** 流水线产物（分阶段沉淀的中间结果） */
export interface ProjectArtifacts {
  /** 文献综述产物 */
  literature?: unknown;
  /** 实验/方案设计产物 */
  design?: unknown;
  /** 实验执行产物（用户输入的实验内容与结果） */
  experiment?: ExperimentInput;
  /** 评估产物 */
  evaluation?: unknown;
  /** 讨论文本 */
  discussion?: string;
  /** 论文章节字典（abstract/introduction/method/results/discussion/conclusion） */
  paperSections?: Record<string, string>;
  /** 论文图表元数据列表 */
  figures?: Array<Record<string, unknown>>;
  /** 最近一次渲染出的初稿文本 */
  draftText?: string;
}

/** 项目版本快照 */
export interface ProjectVersion {
  /** 版本号 */
  version: number;
  /** 阶段 */
  stage: ProjectStage;
  /** 快照时间戳 */
  timestamp: string;
  /** 变更说明 */
  note: string;
  /** 快照数据 */
  snapshot: {
    name: string;
    discipline: string;
    question: string;
    description: string;
  };
}

/** HIL（Human-in-the-loop）待办项 */
export interface HilItem {
  /** 待办 ID */
  id: string;
  /** 关联阶段 */
  stage: ProjectStage;
  /** 标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 状态 */
  status: 'pending' | 'approved' | 'rejected';
  /** 创建时间 */
  createdAt: string;
  /** 处理时间 */
  resolvedAt?: string;
}

/** 项目主体 */
export interface Project {
  id: string;
  /** 创建者用户 ID */
  ownerId: string;
  name: string;
  discipline: string;
  question: string;
  description: string;
  stage: ProjectStage;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  versions: ProjectVersion[];
  hilQueue: HilItem[];
  /** 流水线运行模式 */
  mode: PipelineMode;
  /** 论文初稿模板 */
  template: DraftTemplate;
  /** 流水线状态 */
  pipelineStatus: PipelineStatus;
  /** 关联的 Python Agent ID（懒启动，可为空字符串） */
  agentId?: string;
  /** 当前执行阶段描述（更细粒度于 stage） */
  currentStep?: string;
  /** 流水线产物（按阶段沉淀） */
  artifacts?: ProjectArtifacts;
}

/** 创建项目入参 */
export interface CreateProjectInput {
  name: string;
  discipline: string;
  question: string;
  description?: string;
  /** 流水线模式，可选，默认 auto */
  mode?: PipelineMode;
  /** 初稿模板，可选，默认 markdown */
  template?: DraftTemplate;
}

/** 更新项目入参 */
export interface UpdateProjectInput {
  name?: string;
  discipline?: string;
  question?: string;
  description?: string;
  stage?: ProjectStage;
  status?: ProjectStatus;
  /** 流水线运行模式 */
  mode?: PipelineMode;
  /** 论文初稿模板 */
  template?: DraftTemplate;
}

/** 回滚入参 */
export interface RollbackInput {
  /** 回滚到的版本号 */
  version?: number;
  /** 或回滚到的阶段 */
  stage?: ProjectStage;
}

/** 阶段顺序（8 阶段，与 LLM 服务一致） */
export const STAGE_ORDER: ProjectStage[] = [
  'literature',
  'design',
  'experiment',
  'evaluate',
  'discuss',
  'write',
  'figure',
  'submit',
];

/** LLM 对话请求 */
export interface LlmChatRequest {
  /** 模型名称 */
  model?: string;
  /** 对话消息 */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** 温度 */
  temperature?: number;
  /** 最大 token */
  maxTokens?: number;
  /** 是否流式 */
  stream?: boolean;
}

/** Agent 运行请求 */
export interface AgentRunRequest {
  /** Agent 类型 */
  agentType: string;
  /** 项目 ID */
  projectId?: string;
  /** 输入参数 */
  input: Record<string, unknown>;
  /** 配置 */
  config?: Record<string, unknown>;
}

/** RAG 查询请求 */
export interface RagQueryRequest {
  query: string;
  topK?: number;
  filters?: Record<string, unknown>;
}

/** RAG 导入请求 */
export interface RagIngestRequest {
  source: string;
  documents: Array<Record<string, unknown>>;
}

/** WebSocket 事件类型 */
export type WsEventType =
  | 'agent_progress'
  | 'log_line'
  | 'hil_required'
  | 'stage_change'
  | 'experiment_status'
  | 'pipeline_update'
  | 'heartbeat'
  | 'connected';

/** WebSocket 消息结构 */
export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

/** WebSocket 客户端信息 */
export interface WsClient {
  id: string;
  ws: import('ws').WebSocket;
  isAlive: boolean;
  connectedAt: string;
}

/** 异步包装的 RequestHandler，自动把抛出错误交给 errorHandler */
export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/** 包装异步控制器，统一捕获异常 */
export const asyncHandler =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** 自定义业务错误 */
export class ApiError extends Error {
  statusCode: number;
  code: number;
  constructor(message: string, statusCode: number = 500, code: number = -1) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** 用户角色 */
export type UserRole = 'admin' | 'user';

/** 用户的 LLM API Key 集合 */
export interface UserApiKeys {
  deepseek?: string;
  kimi?: string;
  qwen?: string;
}

/** 用户实体 */
export interface User {
  id: string;
  /** 邮箱（登录账号） */
  email: string;
  /** 显示名 */
  username: string;
  /** bcrypt 哈希 */
  passwordHash: string;
  avatar?: string;
  role: UserRole;
  /** 默认学科 */
  discipline: string;
  /** 用户的 LLM API Key */
  apiKeys: UserApiKeys;
  createdAt: string;
  updatedAt: string;
}

/** 注册入参 */
export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  discipline?: string;
}

/** 登录入参 */
export interface LoginInput {
  email: string;
  password: string;
}

/** 修改密码入参 */
export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}

/** 更新用户配置入参 */
export interface UpdateUserInput {
  username?: string;
  avatar?: string;
  discipline?: string;
  apiKeys?: Partial<UserApiKeys>;
}

/** JWT payload */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/** 认证请求扩展：authenticate 中间件挂载 user */
export interface AuthRequest extends Request {
  user?: User;
}

/** 访问者信息（用于项目归属校验） */
export interface ProjectRequester {
  id: string;
  role: UserRole;
}
