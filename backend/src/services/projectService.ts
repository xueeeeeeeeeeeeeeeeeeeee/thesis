import { v4 as uuidv4 } from 'uuid';
import { renderDraft } from './draftRenderer';
import { buildProfessionalPaper } from './professionalPaper';
import { resolveWritingProfile, type ResearchApproach } from './disciplineProfiles';
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
  ExperimentInput,
  DisciplineProfileKey,
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

interface DemoDisciplineConfig {
  designMethod: string;
  dataset: string;
  methodology: string;
  materials: string;
  procedure: string;
  metrics: ExperimentInput['metrics'];
  resultsDescription: string;
  notes: string;
  figureTitles: [string, string];
  chartLabels: string[];
  chartValues: number[];
  trendValues: number[];
}

function getDemoDisciplineConfig(
  key: DisciplineProfileKey,
  approach: ResearchApproach = 'disciplinary',
): DemoDisciplineConfig {
  if (key === 'material' && approach === 'societal_impact') {
    return {
      designMethod: '采用系统性文献综述、典型案例比较、生命周期与社会影响评价、利益相关方分析和情景分析，评估新材料的社会收益、分配效应、风险与治理条件。',
      dataset: '同行评议文献、官方统计、产业与政策报告、生命周期数据库及公开案例；当前 demo 不包含虚构问卷或实验数据。',
      methodology: '记录数据库与检索式，按纳入排除标准筛选证据；对能源、交通、医疗和信息技术案例进行比较，并从产业就业、健康、环境、公平和治理维度编码。',
      materials: '文献检索记录、政策和统计资料、案例材料、利益相关方分类表、生命周期与社会影响指标定义。',
      procedure: '1. 界定新材料类别与研究范围；2. 系统检索并评价证据质量；3. 选择不同成熟度与应用领域的案例；4. 开展案例比较和利益相关方分析；5. 评估社会影响、伦理风险与治理方案。',
      metrics: [
        { name: '证据覆盖度（演示）', value: '待检索', note: '按数据库、年份和研究类型统计' },
        { name: '利益相关方覆盖（演示）', value: '待编码', note: '研发、企业、劳动者、消费者、社区与监管者' },
        { name: '治理成熟度（演示）', value: '待评价', note: '标准、监管、追踪、回收和公众参与' },
      ],
      resultsDescription: '当前仅展示社会影响研究的证据框架，不代表已经完成调查、统计或因果识别。',
      notes: '正式论文需补充完整检索流程、案例选择依据、证据等级、指标来源、利益冲突和不确定性分析。',
      figureTitles: ['新材料社会影响维度（框架示意）', '利益相关方与治理覆盖（框架示意）'],
      chartLabels: ['Economy', 'Health', 'Environment', 'Equity'],
      chartValues: [0.72, 0.64, 0.58, 0.46],
      trendValues: [0.35, 0.48, 0.61, 0.74],
    };
  }
  const configs: Record<DisciplineProfileKey, DemoDisciplineConfig> = {
    nlp: {
      designMethod: '明确任务输入输出、语料数据集划分、强基线、模型或提示策略，并预注册自动指标与人工评价协议。',
      dataset: '待核验的公开语料或用户授权语料；固定训练/验证/测试划分，当前数值仅为模拟展示。',
      methodology: '比较词袋/预训练模型强基线与候选方法，统一训练预算，报告 F1、ROUGE、时延和人工评价一致性。',
      materials: '语料版本、标签规范、分词器、模型版本、提示模板、随机种子和推理环境。',
      procedure: '1. 固定语料划分；2. 复现强基线；3. 训练或推理候选方法；4. 计算自动指标；5. 开展消融、人工评价和误差分析。',
      metrics: [
        { name: 'F1（模拟）', value: '0.78', note: '待真实测试集核验' },
        { name: 'ROUGE-L（模拟）', value: '0.41', note: '待真实测试集核验' },
        { name: '推理时延（模拟）', value: '86', unit: 'ms/样本' },
      ],
      resultsDescription: '模拟结果仅展示 NLP 基线比较、人工评价与失败案例的报告格式，不代表真实模型性能。',
      notes: '正式论文需补充语料许可、数据泄漏检查、模型版本、提示模板、随机种子与逐类误差分析。',
      figureTitles: ['NLP 主指标与基线对比（模拟）', 'NLP 误差分析（模拟）'],
      chartLabels: ['Baseline', 'Proposed'], chartValues: [0.71, 0.78], trendValues: [0.34, 0.27, 0.21, 0.18],
    },
    cv: {
      designMethod: '固定图像数据集划分、输入分辨率、增强策略和预训练权重，在相同预算下比较视觉基线与候选模型。',
      dataset: '待核验的公开图像数据集或授权图像；保留类别分布和训练/验证/测试划分。',
      methodology: '统一骨干网络与训练轮次，报告 mAP/IoU、参数量、FLOPs、吞吐量及定性失败案例。',
      materials: '图像版本、标注规范、预处理与增强配置、模型权重、GPU 型号和随机种子。',
      procedure: '1. 审核标注；2. 固定划分与增强；3. 复现基线；4. 训练候选模型；5. 评估精度、效率、鲁棒性和失败案例。',
      metrics: [
        { name: 'mAP（模拟）', value: '0.42', note: '待真实测试集核验' },
        { name: 'IoU（模拟）', value: '0.67' },
        { name: 'FLOPs（模拟）', value: '18.5', unit: 'G' },
      ],
      resultsDescription: '模拟结果仅展示视觉任务精度、资源开销和鲁棒性报告格式。',
      notes: '正式论文需补充数据许可、标注一致性、权重、硬件和定性样例。',
      figureTitles: ['视觉模型主指标对比（模拟）', '视觉鲁棒性趋势（模拟）'],
      chartLabels: ['Baseline', 'Proposed'], chartValues: [0.36, 0.42], trendValues: [0.42, 0.39, 0.33, 0.26],
    },
    biology: {
      designMethod: '采用对照实验、细胞与分子表型检测、独立生物学重复及统计学分析构建递进证据链。',
      dataset: '待获取的细胞、组织或公开生物数据；当前 demo 仅使用模拟结构，不代表真实实验。',
      methodology: '采用随机分组、阴性与阳性对照、至少三次独立生物学重复，并结合表型检测与候选通路验证。',
      materials: '匹配研究问题的细胞、组织或公开生物数据；真实实验前登记来源、批次、纳入标准和伦理信息。',
      procedure: '1. 预注册假设与终点；2. 确定样本和对照；3. 执行表型与分子检测；4. 质量控制和统计分析；5. 功能救援验证。',
      metrics: [
        { name: '独立生物学重复', value: '3', unit: '次', note: '最低设计要求，非已完成实验' },
        { name: '相对表型（模拟）', value: '1.35', note: '待真实实验核验' },
        { name: '95%置信区间', value: '待计算' },
      ],
      resultsDescription: '当前结果为生物学统计报告方式的模拟展示，不代表已经完成真实生物实验。',
      notes: '正式论文必须补充真实样本、原始数据、伦理审批、统计结果和可核验引用。',
      figureTitles: ['实验组与对照组相对表型（模拟）', '剂量响应趋势（模拟）'],
      chartLabels: ['Control', 'Treatment'], chartValues: [1.0, 1.35], trendValues: [1.0, 1.08, 1.18, 1.31],
    },
    material: {
      designMethod: '围绕原料纯度、配比、制备和热处理窗口设计样品，并用物相、微观结构与性能测试建立结构性能关系。',
      dataset: '待制备的材料批次、原始谱图和性能测试记录；当前数值仅用于模拟报告结构。',
      methodology: '记录制备批次和工艺参数，使用 XRD、SEM/TEM 及目标性能测试进行多尺度表征与重复性分析。',
      materials: '原料来源与纯度、配比、炉温程序、样品尺寸、设备型号、校准记录和环境条件。',
      procedure: '1. 原料质控与配比；2. 制备及热处理；3. 物相和形貌表征；4. 性能测试；5. 结构性能关联、稳定性与失效分析。',
      metrics: [
        { name: '目标物相比例（模拟）', value: '82', unit: '%' },
        { name: '晶粒尺寸（模拟）', value: '46', unit: 'nm' },
        { name: '目标性能（模拟）', value: '1.18', note: '相对基线，待实测' },
      ],
      resultsDescription: '模拟结果仅展示物相、微观结构、性能和离散性的联合报告方式。',
      notes: '正式论文需附原始 XRD/显微图、设备校准、重复样品、稳定性和规模化限制。',
      figureTitles: ['材料物相与性能对比（模拟）', '结构性能关系趋势（模拟）'],
      chartLabels: ['Reference', 'Prepared'], chartValues: [0.92, 1.18], trendValues: [0.84, 0.97, 1.09, 1.18],
    },
    chemistry: {
      designMethod: '围绕试剂当量、溶剂、温度和时间开展条件筛选，以分离产率、选择性和完整谱学表征验证反应。',
      dataset: '待执行的反应批次、原始 NMR/MS/IR/色谱和称量记录；当前数值均为模拟。',
      methodology: '设置空白和关键机理对照，报告分离产率、选择性、纯度、原子经济性和 E-factor。',
      materials: '试剂来源与纯度、当量、溶剂、气氛、装置、温度、时间、后处理、纯化和安全数据表。',
      procedure: '1. 风险评估；2. 条件筛选；3. 重复最优条件；4. 分离纯化；5. 谱学表征、底物范围、机理对照与绿色评价。',
      metrics: [
        { name: '分离产率（模拟）', value: '78', unit: '%' },
        { name: '选择性（模拟）', value: '92', unit: '%' },
        { name: 'E-factor（模拟）', value: '18.4' },
      ],
      resultsDescription: '模拟结果仅展示反应优化、产物表征和绿色化学评价的报告格式。',
      notes: '正式论文需附原始谱图、色谱、纯度、重复实验、安全处置和放大风险。',
      figureTitles: ['反应条件与产率对比（模拟）', '选择性与绿色指标趋势（模拟）'],
      chartLabels: ['Condition A', 'Condition B'], chartValues: [0.61, 0.78], trendValues: [0.48, 0.63, 0.74, 0.78],
    },
    physics: {
      designMethod: '从控制方程、基本假设、量纲和边界条件出发，设计实验测量或数值离散，并验证误差传播与收敛性。',
      dataset: '待获取的实验观测或数值输出；记录物理量、单位、参数、网格和时间步长，当前数值为模拟。',
      methodology: '比较理论预测与测量/数值结果，报告拟合优度、不确定度、灵敏度、守恒检查和网格收敛。',
      materials: '实验装置或仿真代码、参数与单位、初始和边界条件、校准记录、网格、时间步长和代码版本。',
      procedure: '1. 定义方程与量纲；2. 设置初始和边界条件；3. 校准装置或验证代码；4. 扫描参数；5. 误差传播、灵敏度和收敛分析。',
      metrics: [
        { name: '相对不确定度（模拟）', value: '3.2', unit: '%' },
        { name: '拟合优度 R²（模拟）', value: '0.96' },
        { name: '网格收敛误差（模拟）', value: '1.4', unit: '%' },
      ],
      resultsDescription: '模拟结果仅展示物理量、单位、不确定度和理论/实验一致性的报告格式。',
      notes: '正式论文需补充方程推导、参数表、校准记录、误差预算、代码版本和独立重复。',
      figureTitles: ['理论与观测量对比（模拟）', '数值收敛性分析（模拟）'],
      chartLabels: ['Theory', 'Observed'], chartValues: [1.0, 0.97], trendValues: [0.12, 0.064, 0.031, 0.014],
    },
    ml: {
      designMethod: '定义学习问题、数据划分、目标函数和优化预算，在多个随机种子下与强基线公平比较并分析泛化与鲁棒性。',
      dataset: '待核验的公开或授权数据集；固定预处理和训练/验证/测试划分。',
      methodology: '统一超参数搜索预算，报告任务性能均值方差、显著性、训练成本、消融和分布外鲁棒性。',
      materials: '数据版本、预处理脚本、模型代码、搜索空间、随机种子、硬件和训练日志。',
      procedure: '1. 固定数据与评价协议；2. 复现强基线；3. 多随机种子训练；4. 主结果和显著性；5. 消融、鲁棒性和成本分析。',
      metrics: [
        { name: '任务性能均值（模拟）', value: '0.84' },
        { name: '跨种子标准差（模拟）', value: '0.012' },
        { name: '训练成本（模拟）', value: '6.5', unit: 'GPU·h' },
      ],
      resultsDescription: '模拟结果仅展示机器学习公平比较、方差、鲁棒性和成本报告格式。',
      notes: '正式论文需公开预处理、搜索空间、随机种子、训练日志和代码版本。',
      figureTitles: ['机器学习主结果对比（模拟）', '跨随机种子鲁棒性（模拟）'],
      chartLabels: ['Baseline', 'Proposed'], chartValues: [0.79, 0.84], trendValues: [0.81, 0.83, 0.84, 0.835],
    },
    ir: {
      designMethod: '固定语料、查询集和相关性标注，构建 BM25、稠密检索和重排序基线，并同时评价效果与在线成本。',
      dataset: '待核验的检索语料、查询集和相关性标注；固定索引版本与候选规模。',
      methodology: '统一索引与候选规模，报告 nDCG、MRR、Recall、显著性、查询时延和分查询误差。',
      materials: '语料版本、查询与标注、索引参数、负采样、模型权重、评测脚本和硬件。',
      procedure: '1. 固定语料和查询；2. 构建索引；3. 复现 BM25/稠密基线；4. 评估排序效果和时延；5. 分查询和失败案例分析。',
      metrics: [
        { name: 'nDCG@10（模拟）', value: '0.47' },
        { name: 'MRR@10（模拟）', value: '0.39' },
        { name: '查询时延（模拟）', value: '42', unit: 'ms' },
      ],
      resultsDescription: '模拟结果仅展示检索效果、显著性、时延和分查询分析的报告格式。',
      notes: '正式论文需固定语料和索引版本，补充相关性标注协议、评测脚本和在线实验边界。',
      figureTitles: ['检索主指标对比（模拟）', '效果与查询时延权衡（模拟）'],
      chartLabels: ['BM25', 'Proposed'], chartValues: [0.39, 0.47], trendValues: [0.31, 0.39, 0.44, 0.47],
    },
    general: {
      designMethod: '采用研究问题分解、文献归纳、结构化设计与证据评价相结合的方法。',
      dataset: '项目材料、待核验数据和分析记录；当前数值仅用于演示。',
      methodology: '预注册问题、变量和评价标准，保留质量控制、原始记录、不确定性与人工审阅。',
      materials: '项目材料、数据来源、处理步骤、分析环境和版本记录。',
      procedure: '1. 定义问题；2. 收集证据；3. 执行研究设计；4. 评价结果；5. 审核限制与可重复性。',
      metrics: [
        { name: '主要指标（模拟）', value: '0.75' },
        { name: '稳健性（模拟）', value: '0.68' },
        { name: '证据完整度（模拟）', value: '0.80' },
      ],
      resultsDescription: '模拟结果仅展示通用研究报告结构，不代表真实发现。',
      notes: '正式论文需补充真实材料、原始数据、方法细节和可核验引用。',
      figureTitles: ['主要研究指标对比（模拟）', '稳健性分析（模拟）'],
      chartLabels: ['Baseline', 'Proposed'], chartValues: [0.61, 0.75], trendValues: [0.55, 0.63, 0.7, 0.75],
    },
  };
  return configs[key];
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
    const artifacts: ProjectArtifacts = input.wordLimit
      ? { requirements: { wordLimit: input.wordLimit } }
      : {};

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
        JSON.stringify(artifacts),
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
    const currentArtifacts = project.artifacts ?? {};
    // 合并 artifacts（仅 dev 端点调用）
    const explicitArtifacts =
      (input as unknown as { artifacts?: Record<string, unknown> }).artifacts;
    const baseArtifacts = explicitArtifacts
      ? { ...currentArtifacts, ...explicitArtifacts }
      : currentArtifacts;
    const nextArtifacts =
      input.wordLimit !== undefined
        ? {
            ...baseArtifacts,
            requirements: {
              ...(baseArtifacts.requirements ?? {}),
              wordLimit: input.wordLimit,
            },
          }
        : baseArtifacts;

    await query(
      `UPDATE projects
       SET name = ?, discipline = ?, question = ?, description = ?,
           stage = ?, status = ?, mode = ?, template = ?, artifacts = ?, updated_at = ?
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
        JSON.stringify(nextArtifacts),
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

  /** 生成一套确定性的本地演示产物，确保从创建项目到 8 阶段完成的 demo 可跑通。 */
  async completeDemoPipeline(projectId: string): Promise<Project> {
    const project = await this.getById(projectId);
    const now = new Date();
    const topic = project.question || project.name || '科研自动化论文生成';
    const discipline = project.discipline || '综合学科';
    const wordLimit = project.artifacts?.requirements?.wordLimit;
    const professionalPaper = buildProfessionalPaper({
      projectName: project.name,
      discipline,
      question: topic,
      wordLimit,
      artifacts: project.artifacts,
    });
    const profile = resolveWritingProfile(discipline, topic);
    const demoConfig = getDemoDisciplineConfig(profile.key, profile.approach);
    const literature = profile.literatureTopics.map((literatureTopic, index) => ({
      title: `待检索与核验：${literatureTopic}（围绕“${topic}”）`,
      authors: ['待核验'],
      year: new Date().getFullYear(),
      venue: '候选文献主题，正式引用前须完成数据库检索',
      relevance: 96 - index * 5,
      abstract: `该条目用于提示${profile.label}方向的文献检索范围，不作为已核验参考文献。`,
    }));

    const design = {
      method: demoConfig.designMethod,
      hypothesis: `针对“${topic}”提出可证伪假设，并依据${profile.evidenceLanguage}控制结论强度。`,
      plan:
        `由${professionalPaper.writingPlan.agents.map((agent) => agent.role).join('、')}分章节协作，目标约 ${professionalPaper.writingPlan.targetCharacters} 字。`,
      dataset: demoConfig.dataset,
    };

    const experiment: ExperimentInput = {
      source: 'agent',
      methodology: demoConfig.methodology,
      materials: demoConfig.materials,
      procedure: demoConfig.procedure,
      metrics: demoConfig.metrics,
      resultsDescription: demoConfig.resultsDescription,
      notes: demoConfig.notes,
    };

    const evaluation = {
      metrics: [
        {
          name: '字数完成率',
          value: Number((professionalPaper.writingPlan.actualCharacters / professionalPaper.writingPlan.targetCharacters).toFixed(2)),
          baseline: 0.9,
        },
        { name: '章节完整率', value: 1, baseline: 0.85 },
        { name: '专业审校角色数', value: professionalPaper.writingPlan.agents.length, baseline: 4 },
      ],
      conclusion:
        '当前产物达到结构与字数要求，可作为专业初稿；结论强度仍受模拟数据和待核验引用限制。',
    };

    const paperSections = professionalPaper.paperSections;
    const discussion = paperSections.discussion
      ?? paperSections.errorAnalysis
      ?? paperSections.limitations
      ?? paperSections.safety
      ?? paperSections.results;

    const figures = [
      {
        name: demoConfig.figureTitles[0],
        title: demoConfig.figureTitles[0],
        caption: `该图仅演示${profile.label}结果报告格式，数值不代表真实研究结果。`,
        code: `import matplotlib.pyplot as plt\nlabels = ${JSON.stringify(demoConfig.chartLabels)}\nvalues = ${JSON.stringify(demoConfig.chartValues)}\nplt.bar(labels, values, color=['#6b7280', '#0f766e'])\nplt.ylabel('Illustrative metric')\nplt.title('${profile.key.toUpperCase()} comparison (illustrative)')`,
      },
      {
        name: demoConfig.figureTitles[1],
        title: demoConfig.figureTitles[1],
        caption: `模拟趋势仅用于说明${profile.label}中如何呈现敏感性、误差或稳健性。`,
        code: `import matplotlib.pyplot as plt\nx = list(range(1, ${demoConfig.trendValues.length + 1}))\ny = ${JSON.stringify(demoConfig.trendValues)}\nplt.plot(x, y, marker='o', color='#b45309')\nplt.xlabel('Condition')\nplt.ylabel('Illustrative metric')\nplt.title('${profile.key.toUpperCase()} analysis (illustrative)')`,
      },
    ];

    const submission = {
      target_venue: [
        {
          name: `${discipline} 方向课程论文 / Workshop Demo`,
          tier: 'Demo',
          reason: '适合展示系统流程、原型能力与初步结果。',
        },
      ],
      checklist: ['确认题目与研究问题', '补充真实文献', '核验实验数据', '统一引用格式', '导出最终稿件'],
      cover_letter:
        `本文提交一项围绕“${topic}”的科研自动化流程 demo，重点展示从项目创建到论文初稿生成的闭环能力。`,
      suggestion: '建议作为初稿继续编辑，补充真实实验和规范引用后再正式投稿。',
    };

    const artifacts: ProjectArtifacts & { submission: typeof submission } = {
      ...(project.artifacts ?? {}),
      requirements: {
        ...(project.artifacts?.requirements ?? {}),
        ...(wordLimit ? { wordLimit } : {}),
      },
      literature,
      design,
      experiment,
      evaluation,
      discussion,
      paperSections,
      writingPlan: professionalPaper.writingPlan,
      figures,
      submission,
    };
    const rendered = renderDraft(artifacts, project.template, {
      projectName: project.name,
      discipline: project.discipline,
      question: project.question,
    });
    artifacts.draftText = rendered.text;

    await query(
      `UPDATE projects
       SET stage = ?, status = ?, pipeline_status = ?, current_step = ?, artifacts = ?, updated_at = ?
       WHERE id = ?`,
      [
        'submit',
        'completed',
        'completed',
        'submit',
        JSON.stringify(artifacts),
        now,
        projectId,
      ],
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
        wordLimit: project.artifacts?.requirements?.wordLimit,
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
