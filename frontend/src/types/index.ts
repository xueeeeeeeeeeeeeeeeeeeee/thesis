// 共享类型定义

// 用户角色
export type UserRole = 'admin' | 'user'

// 安全用户对象（不包含密码等敏感字段）
export interface SafeUser {
  id: string
  email: string
  username: string
  avatar?: string
  role: UserRole
  discipline: string
  apiKeys: {
    deepseek?: string
    kimi?: string
    qwen?: string
  }
  createdAt: string
  updatedAt: string
}

// 登录响应
export interface LoginResponse {
  token: string
  user: SafeUser
}

// 注册入参
export interface RegisterInput {
  email: string
  username: string
  password: string
  discipline?: string
}

// 登录入参
export interface LoginInput {
  email: string
  password: string
}

// 阶段状态机：8 个阶段
// 阶段名与后端/LLM 服务严格对齐：evaluate/discuss/write/submit
export type StageKey =
  | 'literature'
  | 'design'
  | 'experiment'
  | 'evaluate'
  | 'discuss'
  | 'write'
  | 'figure'
  | 'submit'

// 阶段定义
export interface Stage {
  key: StageKey
  label: string
  description: string
  color: string
}

// HIL（Human-in-the-Loop）中断点状态
export type HILStatus = 'pending' | 'approved' | 'edited' | 'rolled_back' | 'aborted'

// 项目状态（兼容后端 draft/completed/archived）
export type ProjectStatus =
  | 'running'
  | 'paused'
  | 'idle'
  | 'error'
  | 'done'
  | 'draft'
  | 'completed'
  | 'archived'

// 流水线推进模式
export type PipelineMode = 'auto' | 'manual'

// 初稿模板类型
export type DraftTemplate = 'ctex' | 'ieee' | 'journal' | 'markdown' | 'docx'

export type DisciplineProfileKey =
  | 'nlp'
  | 'cv'
  | 'biology'
  | 'material'
  | 'chemistry'
  | 'physics'
  | 'ml'
  | 'ir'
  | 'general'

// 流水线状态机
export type PipelineStatus =
  | 'idle'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'aborted'
  | 'error'

// 实验指标（通用三元组，适配多学科：CS 的 accuracy、化学的产率、生物的表达量、社科的相关系数）
export interface ExperimentFormMetric {
  name: string // 指标名（accuracy / 产率 / 表达量 / 相关系数）
  value: string // 指标值（字符串兼容不同精度）
  unit?: string // 单位（% / mg·mL⁻¹ / 倍 / 无）
  note?: string // 备注（测试集、置信区间、显著性）
}

// 用户输入的实验内容与结果（跨学科通用 schema）
export interface ExperimentFormData {
  source?: 'user' | 'agent'
  methodology: string // 实验方法/设计描述
  materials: string // 实验材料/数据来源
  procedure: string // 实验步骤/过程
  metrics: ExperimentFormMetric[] // 结构化指标列表
  resultsDescription: string // 结果文字描述
  rawLogs?: string // 原始日志/记录（可选）
  notes?: string // 其他备注（可选）
}

// 流水线产物
export interface PipelineArtifacts {
  requirements?: {
    wordLimit?: number
  }
  literature?: unknown[] // 文献列表
  design?: {
    method?: string
    hypothesis?: string
    plan?: string
  }
  experiment?: ExperimentFormData // 用户输入的实验内容与结果
  evaluation?: {
    metrics?: { name: string; value: number; baseline?: number }[]
    conclusion?: string
  }
  discussion?: {
    points?: string[]
    limitations?: string[]
  }
  paperSections?: Record<string, string> | { type: string; title: string; content: string }[]
  writingPlan?: {
    targetCharacters: number
    actualCharacters: number
    disciplineProfile: DisciplineProfileKey
    researchApproach: 'disciplinary' | 'societal_impact'
    agents: Array<{
      section: string
      role: string
      targetCharacters: number
      focus: string
    }>
    editorialChecks: string[]
  }
  figures?: { name: string; caption: string; dataUrl?: string }[]
  draftText?: string // 当前模板的渲染后草稿
  // DeepSeek 推理模型的思考过程（write 阶段产出）
  thinking?: {
    guide: string // 结构化写作指导（content）
    reasoning: string // 原始思考链（reasoning_content，可能为空）
    hasReasoning?: boolean // 是否有独立的思考链
  }
}

// HIL 提案载荷
export interface HILProposal {
  stage: StageKey
  reason: string
  agentProposal: string
  metadata?: Record<string, unknown>
}

// 项目实体（字段对齐后端：stage / ownerId / versions / hilQueue / 流水线相关字段）
export interface Project {
  id: string
  name: string
  discipline: string // 学科
  stage: StageKey // 后端字段
  currentStage?: StageKey // 兼容旧字段
  progress?: number // 0-100，后端暂未返回
  status: ProjectStatus
  updatedAt: string
  createdAt: string
  description: string
  owner?: string // 旧字段
  ownerId?: string // 后端字段
  question?: string // 后端字段
  wordLimit?: number // 兼容表单/本地产物，后端实际存在 artifacts.requirements.wordLimit
  versions?: Version[] // 版本列表
  hilQueue?: unknown[] // HIL 队列
  // 流水线相关
  mode?: PipelineMode // 推进模式
  template?: DraftTemplate // 初稿模板
  pipelineStatus?: PipelineStatus // 流水线状态
  agentId?: string // 当前 Agent ID
  currentStep?: StageKey // 流水线当前阶段
  artifacts?: PipelineArtifacts // 各阶段产物
}

// HIL 中断点审阅项
export interface HILItem {
  id: string
  projectId: string
  projectName: string
  stage: StageKey
  title: string
  agentProposal: string
  userEdit?: string
  status: HILStatus
  createdAt: string
  reason: string // 触发中断的原因
}

// 文献来源
export type LiteratureSource = 'arXiv' | 'S2' | 'OpenAlex' | 'PubMed'

// 文献实体
export interface Literature {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  citations: number
  relevance: number // 0-100
  source: LiteratureSource
  abstract: string
  sections: LiteratureSection[]
  doi?: string
  url?: string
}

// 文献分段
export interface LiteratureSection {
  type: 'Abstract' | 'Intro' | 'Method' | 'Results' | 'Discussion'
  content: string
}

// 实验状态
export type ExperimentStatus = 'running' | 'queued' | 'completed' | 'failed' | 'killed'

// 实验实体
export interface Experiment {
  id: string
  projectId: string
  name: string
  status: ExperimentStatus
  startedAt: string
  finishedAt?: string
  code: string
  logs: string[]
  metrics: ExperimentMetric[]
  resources: {
    cpu: number // 0-100
    memory: number // MB
    gpu: number // 0-100
  }
}

// 实验指标
export interface ExperimentMetric {
  name: string
  value: number
  history: number[]
}

// 论文章节
export interface PaperSection {
  id: string
  type: 'Abstract' | 'Introduction' | 'Method' | 'Results' | 'Discussion' | 'Conclusion'
  title: string
  content: string
  citations: string[] // 引用 ID 列表
}

// 论文引用
export interface PaperCitation {
  id: string
  key: string // 如 [1]
  text: string
  valid: boolean // 引用校验是否通过
}

// 版本实体
export interface Version {
  id: string
  projectId: string
  version: string // 如 v1.0.0
  createdAt: string
  stage: StageKey
  summary: string
  author: string
}

// LLM 模型档位
export type LLMTier = 'strong' | 'cheap' | 'long' | 'embedding'

// LLM 配置
export interface LLMConfig {
  tier: LLMTier
  provider: string
  model: string
  apiKey: string
  enabled: boolean
}

// RAG 配置
export interface RAGConfig {
  sources: {
    arXiv: boolean
    s2: boolean
    openAlex: boolean
    pubMed: boolean
  }
  chunkStrategy: 'fixed' | 'semantic' | 'sentence'
  chunkSize: number
  overlap: number
  reranker: boolean
  topK: number
}

// 用户配置
export interface UserConfig {
  llm: LLMConfig[]
  rag: RAGConfig
  discipline: string
}

// 通用 API 响应
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

// 活动时间线项
export interface ActivityItem {
  id: string
  time: string
  content: string
  type: 'info' | 'success' | 'warning' | 'error'
}
