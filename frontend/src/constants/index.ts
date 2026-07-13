import type { Stage, StageKey, DraftTemplate } from '@/types'

// 8 阶段状态机：文献 → 设计 → 实验 → 评价 → 讨论 → 撰写 → 画图 → 投稿
export const STAGES: Stage[] = [
  {
    key: 'literature',
    label: '文献',
    description: '检索、筛选、整理论文，构建 RAG 知识库',
    color: '#2563eb',
  },
  {
    key: 'design',
    label: '设计',
    description: '生成研究方案、假设与实验设计',
    color: '#0891b2',
  },
  {
    key: 'experiment',
    label: '实验',
    description: '执行代码、训练模型、采集指标',
    color: '#16a34a',
  },
  {
    key: 'evaluate',
    label: '评价',
    description: '评估实验结果，对照基线',
    color: '#ca8a04',
  },
  {
    key: 'discuss',
    label: '讨论',
    description: '分析结论，挖掘创新点与局限',
    color: '#d97706',
  },
  {
    key: 'write',
    label: '撰写',
    description: '撰写论文各章节初稿',
    color: '#dc2626',
  },
  {
    key: 'figure',
    label: '画图',
    description: '生成图表、流程图与可视化',
    color: '#9333ea',
  },
  {
    key: 'submit',
    label: '投稿',
    description: '格式化与目标期刊/会议投稿',
    color: '#6d28d9',
  },
]

// 根据 key 获取阶段定义（对未知 key 返回安全默认值，避免渲染崩溃）
export const getStage = (key: StageKey | string | undefined | null): Stage => {
  if (!key) return STAGES[0]
  return STAGES.find((s) => s.key === key) ?? { key: key as StageKey, label: String(key), description: '', color: '#64748b' }
}

// 阶段索引
export const getStageIndex = (key: StageKey | string | undefined | null): number => {
  if (!key) return 0
  const idx = STAGES.findIndex((s) => s.key === key)
  return idx < 0 ? 0 : idx
}

// HIL 中断点：4 个（位置与之前略有不同，定位在阶段之间）
export const HIL_STAGES: {
  key: StageKey
  label: string
  reason: string
  description: string
  // 该 HIL 发生在哪个阶段之后，UI 上紧贴该阶段显示
  afterStage: StageKey
}[] = [
  {
    key: 'design',
    label: 'literature → design 之间',
    reason: '文献筛选已完成，需用户拍板研究方向',
    description: '在文献与设计之间，Agent 提交文献摘要与候选研究问题等待人工确认',
    afterStage: 'literature',
  },
  {
    key: 'experiment',
    label: 'design → experiment 之间',
    reason: '研究方案涉及算力消耗与关键假设，需用户授权',
    description: '在设计与实验之间，Agent 提交实验计划等待人工授权',
    afterStage: 'design',
  },
  {
    key: 'discuss',
    label: 'evaluate → discuss 之间',
    reason: '评估结果需用户解读后再进入讨论',
    description: '在评价与讨论之间，Agent 提交评估指标等待人工解读',
    afterStage: 'evaluate',
  },
  {
    key: 'figure',
    label: 'write → figure 之间',
    reason: '论文初稿需用户校阅后再进入画图阶段',
    description: '在撰写与画图之间，Agent 提交论文初稿等待人工校阅',
    afterStage: 'write',
  },
]

// 4 个初稿模板
export const DRAFT_TEMPLATES: {
  key: DraftTemplate
  label: string
  ext: string
  description: string
}[] = [
  {
    key: 'markdown',
    label: 'Markdown',
    ext: '.md',
    description: '通用 Markdown 文本，便于快速预览',
  },
  {
    key: 'ctex',
    label: 'CTeX 中文学位论文',
    ext: '.tex',
    description: '中文学位论文 LaTeX 模板，可直接用 CTeX 编译',
  },
  {
    key: 'ieee',
    label: 'IEEE 英文会议',
    ext: '.tex',
    description: 'IEEE 英文会议论文 LaTeX 模板',
  },
  {
    key: 'journal',
    label: '中文学术期刊',
    ext: '.tex',
    description: '中文学术期刊 LaTeX 模板',
  },
]

// 学科适配器列表
export const DISCIPLINES: { key: string; label: string; desc: string }[] = [
  { key: 'NLP', label: '自然语言处理', desc: '文本分类、生成、抽取等任务' },
  { key: 'CV', label: '计算机视觉', desc: '图像识别、检测、分割等任务' },
  { key: 'Bio', label: '生物信息', desc: '序列分析、结构预测等' },
  { key: 'Material', label: '材料科学', desc: '材料发现、性质预测等' },
  { key: 'Chem', label: '化学', desc: '分子设计、反应预测等' },
  { key: 'Physics', label: '物理', desc: '仿真、建模与数据分析' },
  { key: 'ML', label: '机器学习', desc: '通用机器学习方法研究' },
  { key: 'IR', label: '信息检索', desc: '检索、排序、推荐相关研究' },
]

// 项目状态映射（兼容后端 draft/completed/archived）
export const PROJECT_STATUS_MAP: Record<
  string,
  { label: string; color: string }
> = {
  running: { label: '运行中', color: '#16a34a' },
  paused: { label: '已暂停', color: '#ca8a04' },
  idle: { label: '空闲', color: '#64748b' },
  error: { label: '异常', color: '#dc2626' },
  done: { label: '已完成', color: '#2563eb' },
  draft: { label: '草稿', color: '#64748b' },
  completed: { label: '已完成', color: '#2563eb' },
  archived: { label: '已归档', color: '#94a3b8' },
}

// 实验状态映射
export const EXPERIMENT_STATUS_MAP: Record<
  string,
  { label: string; color: string }
> = {
  running: { label: '运行中', color: '#16a34a' },
  queued: { label: '排队中', color: '#ca8a04' },
  completed: { label: '已完成', color: '#2563eb' },
  failed: { label: '失败', color: '#dc2626' },
  killed: { label: '已终止', color: '#64748b' },
}

// HIL 状态映射
export const HIL_STATUS_MAP: Record<
  string,
  { label: string; color: string }
> = {
  pending: { label: '待审阅', color: '#ca8a04' },
  approved: { label: '已通过', color: '#16a34a' },
  edited: { label: '已编辑', color: '#2563eb' },
  rolled_back: { label: '已回滚', color: '#d97706' },
  aborted: { label: '已中止', color: '#dc2626' },
}
