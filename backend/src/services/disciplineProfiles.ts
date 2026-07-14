export type DisciplineProfileKey =
  | 'nlp'
  | 'cv'
  | 'biology'
  | 'material'
  | 'chemistry'
  | 'physics'
  | 'ml'
  | 'ir'
  | 'general';

export type ResearchApproach = 'disciplinary' | 'societal_impact';

export interface DisciplineSectionSpec {
  key: string;
  title: string;
  weight: number;
  role: string;
  focus: string;
}

export interface DisciplineProfile {
  key: DisciplineProfileKey;
  label: string;
  approach?: ResearchApproach;
  sections: DisciplineSectionSpec[];
  keywords: string[];
  methodLanguage: string;
  evidenceLanguage: string;
  reproducibilityLanguage: string;
  metrics: string[];
  literatureTopics: string[];
}

const common = {
  abstract: { key: 'abstract', title: '摘要', weight: 0.08 },
  keywords: { key: 'keywords', title: '关键词', weight: 0.025 },
  introduction: { key: 'introduction', title: '引言', weight: 0.17 },
  conclusion: { key: 'conclusion', title: '结论', weight: 0.045 },
};

const computingSections = (roles: {
  literature: string;
  method: string;
  experiment: string;
  analysis: string;
}): DisciplineSectionSpec[] => [
  { ...common.abstract, role: '技术摘要作者', focus: '问题、方法、核心实验结果与贡献闭环' },
  { ...common.keywords, role: '主题词标引 Agent', focus: '任务、方法、数据集与评价指标关键词' },
  { ...common.introduction, role: roles.literature, focus: '研究背景、任务定义、知识缺口与贡献点' },
  { key: 'relatedWork', title: '相关工作', weight: 0.13, role: roles.literature, focus: '按方法谱系组织文献并明确与本文差异' },
  { key: 'method', title: '方法', weight: 0.22, role: roles.method, focus: '问题形式化、模型结构、目标函数、算法与复杂度' },
  { key: 'experimentSetup', title: '实验设置', weight: 0.13, role: roles.experiment, focus: '数据集、划分、基线、超参数、算力和评价协议' },
  { key: 'results', title: '结果与分析', weight: 0.14, role: roles.analysis, focus: '主结果、显著性、效率与公平比较' },
  { key: 'errorAnalysis', title: '消融与误差分析', weight: 0.06, role: roles.analysis, focus: '组件贡献、失败案例、鲁棒性和局限性' },
  { ...common.conclusion, role: '计算机学科学术总编', focus: '贡献、适用边界与后续工作' },
];

const profiles: Record<DisciplineProfileKey, DisciplineProfile> = {
  nlp: {
    key: 'nlp', label: '自然语言处理',
    sections: computingSections({ literature: 'NLP 文献综述作者', method: '语言模型与算法作者', experiment: 'NLP 实验工程师', analysis: 'NLP 误差分析审稿人' }),
    keywords: ['自然语言处理', '语料库', '语言模型', '基线系统', '消融实验', '误差分析'],
    methodLanguage: '明确任务定义、输入输出、分词或提示策略、模型架构、训练目标与解码方法',
    evidenceLanguage: '报告数据集、训练/验证/测试划分、强基线、自动指标与人工评价，并分析幻觉、偏见和领域迁移',
    reproducibilityLanguage: '固定随机种子，报告模型版本、提示模板、超参数、算力预算与推理配置',
    metrics: ['F1/BLEU/ROUGE 等任务指标', '人工评价一致性', '推理成本与时延'],
    literatureTopics: ['预训练语言模型', '检索增强生成', '任务评价与误差分析'],
  },
  cv: {
    key: 'cv', label: '计算机视觉',
    sections: computingSections({ literature: '计算机视觉综述作者', method: '视觉模型架构作者', experiment: '视觉实验工程师', analysis: '视觉鲁棒性审稿人' }),
    keywords: ['计算机视觉', '图像表征', '数据增强', '基线模型', '消融实验', '鲁棒性'],
    methodLanguage: '说明输入分辨率、预处理与增强、骨干网络、检测或分割头、损失函数和推理流程',
    evidenceLanguage: '报告公开数据集划分、mAP/IoU/准确率、参数量与吞吐量，并展示定性样例和失败案例',
    reproducibilityLanguage: '记录图像尺寸、增强概率、预训练权重、训练轮次、硬件和随机种子',
    metrics: ['mAP/IoU/准确率', '参数量与 FLOPs', '吞吐量与鲁棒性'],
    literatureTopics: ['视觉 Transformer', '目标检测与分割', '域泛化与鲁棒性'],
  },
  biology: {
    key: 'biology', label: '生物信息与生命科学',
    sections: [
      { ...common.abstract, role: '生物医学摘要作者', focus: '目的、方法、结果与结论的结构式摘要' },
      { ...common.keywords, role: '生物医学主题词标引 Agent', focus: '机制、模型、检测方法和统计学主题词' },
      { ...common.introduction, weight: 0.19, role: '生物学文献综述作者', focus: '机制背景、证据缺口、可证伪假设与研究目标' },
      { key: 'method', title: '材料与方法', weight: 0.27, role: '实验方法学专家', focus: '材料来源、对照、重复、检测、统计、伦理与可重复性' },
      { key: 'results', title: '结果', weight: 0.18, role: '生物统计学审稿人', focus: '表型、分子证据、效应量、置信区间及模拟边界' },
      { key: 'discussion', title: '讨论', weight: 0.205, role: '机制讨论作者', focus: '机制解释、文献对比、替代解释、局限与转化价值' },
      { ...common.conclusion, role: '生命科学学术总编', focus: '证据强度、结论边界和后续验证' },
    ],
    keywords: ['生物学机制', '细胞表型', '分子通路', '对照实验', '统计学分析', '可重复性'],
    methodLanguage: '规定材料来源、实验组与对照组、独立生物学重复、分子与表型检测、功能救援及伦理要求',
    evidenceLanguage: '区分相关与因果，报告效应量、95%置信区间和精确 P 值，不把模拟结果写成真实发现',
    reproducibilityLanguage: '保留试剂货号、仪器参数、原始图像、排除记录、分析脚本和伦理审批信息',
    metrics: ['独立生物学重复', '效应量与置信区间', '分子和表型证据一致性'],
    literatureTopics: ['分子机制', '实验模型与检测方法', '统计学与报告规范'],
  },
  material: {
    key: 'material', label: '材料科学',
    sections: [
      { ...common.abstract, role: '材料学摘要作者', focus: '材料体系、制备、结构、性能与结论' },
      { ...common.keywords, role: '材料主题词标引 Agent', focus: '材料体系、工艺、表征和性能关键词' },
      { ...common.introduction, weight: 0.18, role: '材料科学综述作者', focus: '应用背景、结构性能关系和研究缺口' },
      { key: 'method', title: '实验材料与制备方法', weight: 0.25, role: '材料制备工艺专家', focus: '原料纯度、配比、制备路径、热处理和工艺窗口' },
      { key: 'characterization', title: '结构表征与性能测试', weight: 0.14, role: '材料表征专家', focus: 'XRD、SEM/TEM、光谱、力学/电化学测试及校准' },
      { key: 'results', title: '结果与讨论', weight: 0.23, role: '结构—性能关系审稿人', focus: '相组成、微观结构、性能、机理和不确定度' },
      { key: 'limitations', title: '工程可行性与局限', weight: 0.065, role: '材料工程评估 Agent', focus: '规模化、稳定性、成本、环境影响与失效模式' },
      { ...common.conclusion, role: '材料学学术总编', focus: '结构性能结论和工程边界' },
    ],
    keywords: ['材料制备', '微观结构', '物相表征', '结构性能关系', '稳定性', '工程化'],
    methodLanguage: '报告原料来源与纯度、配比、制备工艺、热处理制度、样品尺寸和表征参数',
    evidenceLanguage: '用物相、形貌、组成和性能的多尺度证据建立结构—性能关系，并报告测试离散性',
    reproducibilityLanguage: '记录批次、设备型号、校准方式、环境条件、重复样品和原始谱图',
    metrics: ['物相与晶粒尺寸', '力学/电学/热学性能', '稳定性与循环寿命'],
    literatureTopics: ['材料制备工艺', '多尺度结构表征', '结构—性能关系'],
  },
  chemistry: {
    key: 'chemistry', label: '化学',
    sections: [
      { ...common.abstract, role: '化学摘要作者', focus: '反应目标、策略、产率/选择性和意义' },
      { ...common.keywords, role: '化学主题词标引 Agent', focus: '反应类型、催化体系、分析方法与产物关键词' },
      { ...common.introduction, weight: 0.18, role: '化学文献综述作者', focus: '合成挑战、已有路线、机理缺口和研究目标' },
      { key: 'method', title: '试剂、仪器与实验方法', weight: 0.24, role: '合成与分析方法专家', focus: '试剂纯度、当量、气氛、温度、时间、后处理与安全' },
      { key: 'characterization', title: '产物表征', weight: 0.12, role: '谱学表征专家', focus: 'NMR、MS、IR、色谱、元素分析和纯度判定' },
      { key: 'results', title: '结果与讨论', weight: 0.24, role: '反应机理与优化审稿人', focus: '条件筛选、产率、选择性、底物范围、对照和机理' },
      { key: 'safety', title: '安全与绿色化学评价', weight: 0.075, role: '化学安全审查 Agent', focus: '危害、废物、原子经济性、能耗和放大风险' },
      { ...common.conclusion, role: '化学学术总编', focus: '方法贡献、适用范围和安全边界' },
    ],
    keywords: ['合成化学', '反应优化', '催化', '选择性', '谱学表征', '绿色化学'],
    methodLanguage: '报告试剂纯度与当量、溶剂、气氛、温度、时间、后处理、纯化、仪器参数和安全措施',
    evidenceLanguage: '以分离产率、选择性和完整谱学表征支持产物结构，并通过对照实验讨论机理',
    reproducibilityLanguage: '保留原始谱图、色谱、称量记录、批次、反应装置和重复实验',
    metrics: ['分离产率与选择性', '纯度与谱学一致性', '原子经济性与 E-factor'],
    literatureTopics: ['合成路线与催化体系', '反应机理', '谱学表征与绿色化学'],
  },
  physics: {
    key: 'physics', label: '物理',
    sections: [
      { ...common.abstract, role: '物理学摘要作者', focus: '物理问题、模型、方法、定量结果与意义' },
      { ...common.keywords, role: '物理主题词标引 Agent', focus: '物理体系、理论框架、数值方法和观测量' },
      { ...common.introduction, weight: 0.17, role: '物理学综述作者', focus: '物理背景、尺度、已有理论和未解问题' },
      { key: 'theory', title: '理论模型', weight: 0.19, role: '理论建模专家', focus: '基本假设、方程、边界条件、量纲和适用范围' },
      { key: 'method', title: '实验或数值方法', weight: 0.19, role: '实验与数值方法专家', focus: '装置/算法、参数、离散化、收敛性和校准' },
      { key: 'results', title: '结果', weight: 0.18, role: '物理数据分析审稿人', focus: '主要观测量、标度关系、误差和模型比较' },
      { key: 'discussion', title: '讨论', weight: 0.125, role: '物理机制讨论作者', focus: '物理解释、极限情况、敏感性、不确定度和局限' },
      { ...common.conclusion, role: '物理学学术总编', focus: '定量结论、适用尺度与未来检验' },
    ],
    keywords: ['理论模型', '边界条件', '数值模拟', '实验测量', '不确定度', '标度关系'],
    methodLanguage: '给出控制方程、基本假设、初始与边界条件、量纲分析、实验装置或数值离散方案',
    evidenceLanguage: '报告定量观测量、误差传播、收敛性、灵敏度和理论/实验一致性',
    reproducibilityLanguage: '记录参数、单位、仪器校准、数值网格、时间步长、代码版本和随机过程设置',
    metrics: ['主要物理量及单位', '拟合优度与不确定度', '数值收敛性或实验重复性'],
    literatureTopics: ['理论模型与标度', '实验测量技术', '数值模拟与不确定度'],
  },
  ml: {
    key: 'ml', label: '机器学习',
    sections: computingSections({ literature: '机器学习综述作者', method: '学习算法与理论作者', experiment: '机器学习实验工程师', analysis: '统计学习审稿人' }),
    keywords: ['机器学习', '学习算法', '泛化', '基线模型', '消融实验', '可重复性'],
    methodLanguage: '定义学习问题、假设空间、模型结构、目标函数、优化算法和计算复杂度',
    evidenceLanguage: '在多个数据集上与强基线公平比较，报告均值方差、显著性、消融、鲁棒性和效率',
    reproducibilityLanguage: '报告数据预处理、超参数搜索空间、随机种子、硬件、训练预算和代码版本',
    metrics: ['任务性能与方差', '泛化和鲁棒性', '训练/推理成本'],
    literatureTopics: ['学习理论与优化', '模型架构', '泛化、鲁棒性与公平评价'],
  },
  ir: {
    key: 'ir', label: '信息检索',
    sections: computingSections({ literature: '信息检索综述作者', method: '检索与排序算法作者', experiment: '检索评测工程师', analysis: '检索评价审稿人' }),
    keywords: ['信息检索', '排序学习', '召回', '重排序', '离线评测', '用户行为'],
    methodLanguage: '描述索引、召回、特征、排序/重排序模型、负采样和在线服务链路',
    evidenceLanguage: '报告查询集、相关性标注、BM25/学习排序基线、nDCG/MRR/Recall、时延和显著性',
    reproducibilityLanguage: '固定语料版本、索引参数、候选规模、随机种子、评测脚本和硬件配置',
    metrics: ['nDCG/MRR/Recall', '查询时延和吞吐量', '显著性与分查询分析'],
    literatureTopics: ['稀疏与稠密检索', '学习排序与重排序', '检索评测和用户行为'],
  },
  general: {
    key: 'general', label: '综合学科',
    sections: [
      { ...common.abstract, role: '摘要作者', focus: '背景、问题、方法、结果和结论' },
      { ...common.keywords, role: '主题词标引 Agent', focus: '研究对象、方法和评价关键词' },
      { ...common.introduction, weight: 0.2, role: '文献综述作者', focus: '背景、缺口和研究目标' },
      { key: 'method', title: '研究方法', weight: 0.27, role: '方法学专家', focus: '材料、变量、流程、质量控制和分析方法' },
      { key: 'results', title: '研究结果', weight: 0.2, role: '结果审稿人', focus: '主要发现、证据和不确定性' },
      { key: 'discussion', title: '讨论', weight: 0.21, role: '讨论作者', focus: '解释、对比、局限和未来研究' },
      { ...common.conclusion, role: '学术总编', focus: '结论边界和贡献' },
    ],
    keywords: ['研究设计', '证据评价', '可重复性', '学术写作'],
    methodLanguage: '明确材料、变量、研究流程、质量控制和分析方法',
    evidenceLanguage: '区分已有证据、合理推断与待验证假设，并报告限制与不确定性',
    reproducibilityLanguage: '记录数据来源、处理步骤、评价标准、分析脚本和版本信息',
    metrics: ['主要研究指标', '不确定性与稳健性', '可重复性'],
    literatureTopics: ['研究背景', '方法学', '证据评价'],
  },
};

const materialSocietalImpactProfile: DisciplineProfile = {
  key: 'material',
  label: '材料科学与社会影响研究',
  approach: 'societal_impact',
  sections: [
    { ...common.abstract, role: '跨学科摘要作者', focus: '新材料类型、研究范围、社会影响维度与主要判断' },
    { ...common.keywords, role: '跨学科主题词标引 Agent', focus: '材料技术、社会影响、可持续性、伦理与治理关键词' },
    { ...common.introduction, weight: 0.15, role: '材料技术与社会综述作者', focus: '技术背景、社会问题、研究缺口与研究问题' },
    { key: 'conceptualFramework', title: '概念框架与研究范围', weight: 0.13, role: '科技与社会研究方法专家', focus: '系统综述、案例比较、生命周期与社会影响评价、利益相关方和指标边界' },
    { key: 'technologyApplications', title: '新材料技术发展与应用场景', weight: 0.15, role: '材料技术综述专家', focus: '材料类别、关键特性、成熟度、产业链与典型应用场景' },
    { key: 'socialImpact', title: '社会影响分析', weight: 0.22, role: '科技与社会影响分析 Agent', focus: '经济产业、就业技能、公共健康、生活方式、环境、公平与可及性' },
    { key: 'governance', title: '风险、伦理与治理', weight: 0.13, role: '科技伦理与政策治理审稿人', focus: '全生命周期风险、责任分配、标准监管、公众参与和转型治理' },
    { key: 'discussion', title: '讨论', weight: 0.07, role: '跨学科讨论作者', focus: '影响机制、受益与受损群体、证据限制、替代解释和情景差异' },
    { ...common.conclusion, role: '跨学科学术总编', focus: '平衡技术收益、社会成本、治理条件与结论边界' },
  ],
  keywords: ['新材料', '社会影响', '科技与社会', '可持续发展', '科技伦理', '政策治理'],
  methodLanguage: '采用系统性文献综述、典型案例比较、生命周期与社会影响评价、利益相关方分析和情景分析，明确材料类别、时间范围、地域边界与评价指标',
  evidenceLanguage: '结合同行评议文献、官方统计、产业报告、生命周期数据和利益相关方证据，区分技术潜力、已观察影响与情景推演，避免把相关性写成确定因果',
  reproducibilityLanguage: '公开检索式、数据库、纳入排除标准、案例选择依据、编码框架、指标定义、证据等级和利益冲突声明',
  metrics: ['产业与就业影响', '公共健康和生活质量', '全生命周期环境负荷', '公平性与技术可及性', '风险与治理成熟度'],
  literatureTopics: ['新材料技术与应用场景', '科技社会影响与公正转型', '生命周期评价、伦理与治理'],
};

export function resolveDisciplineProfile(discipline: string): DisciplineProfile {
  const normalized = (discipline || '').trim().toLowerCase();
  if (/^nlp$|自然语言/.test(normalized)) return profiles.nlp;
  if (/^cv$|计算机视觉|图像/.test(normalized)) return profiles.cv;
  if (/^bio$|生物|生命|医学|医药|临床/.test(normalized)) return profiles.biology;
  if (/^material$|材料/.test(normalized)) return profiles.material;
  if (/^chem$|化学/.test(normalized)) return profiles.chemistry;
  if (/^physics$|物理/.test(normalized)) return profiles.physics;
  if (/^ml$|机器学习/.test(normalized)) return profiles.ml;
  if (/^ir$|信息检索|检索/.test(normalized)) return profiles.ir;
  return profiles.general;
}

function isSocietalImpactQuestion(question: string): boolean {
  return /人类社会|社会影响|社会发展|社会生活|社会公平|公共政策|公众参与|科技伦理|伦理问题|政策治理|监管治理|产业变革|就业影响|经济社会|生活方式|公正转型/.test(
    question || '',
  );
}

export function resolveWritingProfile(discipline: string, question = ''): DisciplineProfile {
  const profile = resolveDisciplineProfile(discipline);
  if (profile.key === 'material' && isSocietalImpactQuestion(question)) {
    return materialSocietalImpactProfile;
  }
  return profile;
}

export function getDisciplineProfiles(): DisciplineProfile[] {
  return [profiles.nlp, profiles.cv, profiles.biology, profiles.material, profiles.chemistry, profiles.physics, profiles.ml, profiles.ir];
}
