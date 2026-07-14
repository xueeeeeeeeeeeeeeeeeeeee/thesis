import type { ProjectArtifacts } from '../types';
import {
  resolveWritingProfile,
  type DisciplineProfile,
  type DisciplineProfileKey,
} from './disciplineProfiles';

export interface WritingAgentAssignment {
  section: string;
  role: string;
  targetCharacters: number;
  focus: string;
}

export interface ProfessionalWritingPlan {
  targetCharacters: number;
  actualCharacters: number;
  disciplineProfile: DisciplineProfileKey;
  researchApproach: 'disciplinary' | 'societal_impact';
  agents: WritingAgentAssignment[];
  editorialChecks: string[];
}

interface BuildInput {
  projectName: string;
  discipline: string;
  question: string;
  wordLimit?: number;
  artifacts?: ProjectArtifacts;
}

interface BuildResult {
  paperSections: Record<string, string>;
  writingPlan: ProfessionalWritingPlan;
}

const SECTION_WEIGHTS = {
  abstract: 0.09,
  keywords: 0.025,
  introduction: 0.19,
  method: 0.27,
  results: 0.18,
  discussion: 0.195,
  conclusion: 0.04,
} as const;

export function countPaperCharacters(sections: Record<string, string>): number {
  return Object.values(sections)
    .join('')
    .replace(/\s/g, '').length;
}

function takeCharacters(text: string, limit: number): string {
  if (limit <= 0) return '';
  const compactLength = text.replace(/\s/g, '').length;
  if (compactLength <= limit) return text.trim();
  let count = 0;
  let output = '';
  for (const char of text) {
    if (!/\s/.test(char)) count += 1;
    if (count > limit) break;
    output += char;
  }
  const trimmed = output.trim();
  const sentenceEnd = Math.max(
    trimmed.lastIndexOf('。'),
    trimmed.lastIndexOf('！'),
    trimmed.lastIndexOf('？'),
    trimmed.lastIndexOf('；'),
  );
  if (sentenceEnd >= Math.floor(trimmed.length * 0.72)) {
    return trimmed.slice(0, sentenceEnd + 1);
  }
  return text.trim();
}

function fitParagraphs(paragraphs: string[], target: number): string {
  if (paragraphs.length === 1) return paragraphs[0];
  const selected: string[] = [];
  for (const paragraph of paragraphs) {
    if (countPaperCharacters({ value: selected.join('\n\n') }) >= target * 0.9) break;
    selected.push(paragraph);
  }
  return takeCharacters(selected.join('\n\n'), target);
}

function sectionTarget(total: number, key: keyof typeof SECTION_WEIGHTS): number {
  return Math.max(key === 'keywords' ? 30 : 80, Math.round(total * SECTION_WEIGHTS[key]));
}

function buildBiologySections(input: BuildInput, total: number): Record<string, string> {
  const topic = input.question || input.projectName || '生物学研究问题';
  const abstract = [
    `目的：围绕“${topic}”建立可检验的生物学研究框架，明确研究对象、关键变量及其潜在作用关系。方法：采用对照实验思路，结合细胞表型观察、分子指标检测和统计学分析评价目标因素的生物学效应。结果：本初稿依据项目设定与模拟演示数据组织结果，不将模拟值表述为真实实验发现；结果章节重点展示效应方向、重复性和证据边界。结论：该研究框架能够为后续真实样本验证提供规范的实验与写作基础。`,
  ];
  const introduction = [
    `${topic}涉及细胞状态、分子调控与微环境信号之间的复杂联系，是当前生命科学研究中具有机制意义和应用价值的问题。相关生物过程通常并非由单一分子决定，而是受到转录调控、蛋白活性、细胞间通讯以及时空异质性的共同影响。因此，仅描述相关性不足以支持机制结论，需要将明确假设、适当模型和多层次证据纳入同一研究设计。`,
    `既往研究为该问题提供了重要线索，但不同研究在样本来源、处理剂量、观察时间和终点指标方面往往存在差异。部分结论来自单一细胞系或有限样本，外推到复杂生物系统时仍需谨慎。特别是在缺少阴性对照、独立重复或功能性救援实验时，表达变化并不能直接等同于因果作用，这也是本研究需要重点控制的方法学风险。`,
    `基于上述背景，本研究提出可证伪的工作假设：目标因素的变化将通过可检测的细胞与分子表型影响研究终点。研究目标包括三个层次：首先确认基础表型是否稳定改变；其次判断候选通路是否与表型方向一致；最后通过干预或救援实验评价该通路是否具有因果贡献。该递进式设计有助于避免仅凭单项指标作出过度解释。`,
    `本研究的预期贡献在于形成一套符合生物学证据链要求的实验方案，并把材料来源、重复层级、统计策略、伦理边界和数据可重复性写入论文主体。与单纯生成文本相比，这种结构更强调研究问题与实验读出之间的对应关系，使后续获得真实数据后可以直接替换模拟结果并完成规范报告。`,
  ];
  const method = [
    `材料与方法：根据“${topic}”选择与研究问题匹配的细胞、组织或公开生物数据作为研究对象。实验组接受目标因素干预，对照组采用载体、溶剂或未处理条件；如条件允许，设置阳性对照与功能救援组。所有关键实验至少进行三次独立生物学重复，技术重复只用于评估检测误差，不替代独立样本。材料批次、培养条件、处理时间和样本纳入排除标准应在实验开始前固定。`,
    `样本处理与指标检测遵循预先定义的标准操作流程。细胞表型可通过活力、增殖、迁移、凋亡或分化指标评价；分子层面可采用实时定量 PCR、免疫印迹、酶联免疫检测、流式细胞术或显微成像验证候选通路。各方法均需记录试剂来源、抗体货号、仪器型号、关键参数及归一化方式，并设置空白、阴性和阳性质量控制。`,
    `为建立机制证据链，研究设计不仅比较组间差异，还应评价干预强度与表型变化的剂量或时间关系。若观察到候选分子与表型同步改变，可进一步使用抑制剂、激动剂、基因敲低或过表达进行方向相反的验证。只有当救援实验能够部分或完全逆转表型时，才谨慎支持该分子在研究过程中的功能作用。`,
    `统计学分析：连续变量先检查分布特征与方差齐性，满足参数检验条件时采用独立样本 t 检验或方差分析，不满足时使用相应非参数方法；分类资料采用卡方检验或 Fisher 精确检验。多组比较进行事后校正，多指标探索控制假发现率。报告效应量、95%置信区间和精确 P 值，不仅依据 P<0.05 判断生物学意义。`,
    `偏倚控制与可重复性：样本分组尽可能随机化，图像定量与主要终点评价采用盲法；异常值处理规则在查看组别结果前确定。原始数据、分析脚本和排除记录应保留可追溯版本。涉及人源样本、临床资料或动物实验时，必须取得伦理审批和知情同意，并遵循相应报告规范；当前 demo 不包含真实人源或动物实验数据。`,
  ];
  const results = [
    `结果：以下内容用于展示论文结构和统计报告方式，属于模拟数据叙述，不代表已经完成真实生物实验。质量控制首先应说明各组样本量、独立重复次数、缺失数据和排除原因，并确认主要检测指标处于方法学有效范围。只有在质控合格后，组间差异才进入正式解释。`,
    `在基础表型层面，演示性分析显示实验组与对照组可能呈现方向一致的变化趋势。专业报告应同时给出各组均值或中位数、离散程度、效应量、95%置信区间及精确 P 值，并配合散点图展示独立样本，而不只报告柱状图和显著性星号。若置信区间跨越无效值，应将结论表述为证据不足。`,
    `在分子指标层面，应比较候选通路标志物与基础表型是否具有一致的时间顺序和剂量响应。单个转录本变化需要蛋白水平或功能读出支持；相关分析还需展示数据分布和潜在离群点。模拟结果仅用于说明应如何组织证据，不应替代实际检测、原始图像和独立重复。`,
    `若开展机制验证，结果章节需分别呈现直接干预、反向干预和救援实验。理想证据表现为目标因素改变后表型出现，阻断候选通路后效应减弱，恢复通路后表型部分回归。若不同读出不一致，应如实报告并在讨论中解释，而不能选择性保留支持假设的结果。`,
  ];
  const discussion = [
    `本研究围绕“${topic}”建立了从表型观察到机制验证的生物学证据框架。该框架的核心不是预设结论，而是要求每一项推断都有对应的实验读出、对照条件和不确定性描述。模拟结果提示可能存在值得验证的效应方向，但在获得真实独立重复之前，只能视为研究假设和分析模板。`,
    `从生物学机制角度看，细胞或组织表型通常由多个信号通路共同塑造。即使候选分子与终点指标相关，也可能受到细胞周期、代谢状态、应激反应或样本组成变化的影响。因此，后续实验应结合时序分析、亚细胞定位和功能性救援，区分直接调控、伴随变化和代偿反应，避免把相关关系写成单一路径因果关系。`,
    `与已有研究比较时，应重点解释模型系统和实验条件的差异。细胞系结果可能不完全代表原代细胞或体内环境，单中心样本也可能受到人群结构和处理流程影响。若本研究结果与文献不一致，需要从样本异质性、剂量窗口、检测平台和统计功效等方面分析，而不是简单归因于实验误差。`,
    `本研究方案的优势是预先规定了独立生物学重复、效应量报告、质量控制与救援实验，使结论强度能够与证据层级相匹配。同时，按章节分工的写作流程可由方法学作者、结果作者和讨论作者分别聚焦专业问题，再由总编统一术语与逻辑，减少长文生成中常见的重复、前后矛盾和字数失控。`,
    `局限性主要包括当前缺少真实实验数据、样本量尚未通过先验功效分析确定、候选通路可能存在未测量混杂因素，以及模拟文本不能代替原始记录。后续应在伦理批准后开展预实验，根据效应量估算正式样本量，并在独立模型中复现关键发现。数据和代码应按 FAIR 原则管理，以提高可验证性和复用性。`,
  ];
  const conclusion = [
    `综上，本研究为“${topic}”提出了符合生物学论文规范的可检验方案，涵盖对照设计、分子与表型检测、统计分析、机制救援、伦理和可重复性要求。当前结论限于研究设计与模拟展示；获得真实数据后，应依据效应量和证据一致性更新摘要、结果与讨论。`,
  ];

  return {
    abstract: fitParagraphs(abstract, sectionTarget(total, 'abstract')),
    keywords: takeCharacters('关键词：生物学机制；细胞表型；分子通路；对照实验；统计学分析；可重复性', sectionTarget(total, 'keywords')),
    introduction: fitParagraphs(introduction, sectionTarget(total, 'introduction')),
    method: fitParagraphs(method, sectionTarget(total, 'method')),
    results: fitParagraphs(results, sectionTarget(total, 'results')),
    discussion: fitParagraphs(discussion, sectionTarget(total, 'discussion')),
    conclusion: fitParagraphs(conclusion, sectionTarget(total, 'conclusion')),
  };
}

function buildProfileSections(
  input: BuildInput,
  total: number,
  profile: DisciplineProfile,
): Record<string, string> {
  const topic = input.question || input.projectName || '研究问题';
  const paragraphsFor = (key: string, title: string, focus: string): string[] => {
    if (key === 'abstract') {
      return [`目的：围绕“${topic}”解决${profile.label}中的明确问题。方法：${profile.methodLanguage}。结果：当前初稿按${profile.metrics.join('、')}组织模拟报告结构，不把演示值表述为真实结论。结论：该方案为后续真实数据验证、可重复实验和规范论文撰写提供基础。`];
    }
    if (key === 'introduction') {
      return [
        `“${topic}”是${profile.label}领域中具有理论意义和应用价值的问题。相关研究通常涉及${profile.literatureTopics.join('、')}，不同技术路线在假设、数据条件和评价协议上存在明显差异，因此需要先界定任务边界再比较方法。`,
        `现有工作虽然提供了可借鉴的模型与实验范式，但常见不足包括数据划分不一致、基线选择偏弱、评价指标单一或复现信息不足。若忽略这些差异，性能提升可能来自额外数据、参数规模或调参预算，而不是方法本身。`,
        `本研究据此提出可检验的问题定义和公平比较原则，研究目标包括建立可靠基线、验证核心方法、分析关键组件贡献，并识别方法在不同数据条件下的失败模式。所有结论均限定在已报告的数据与实验设置范围内。`,
        `本文贡献在于把${profile.methodLanguage}与${profile.evidenceLanguage}结合起来，并通过${profile.reproducibilityLanguage}提高研究的可核验性。`,
      ];
    }
    if (key === 'relatedWork') {
      return [
        `相关工作可按${profile.literatureTopics.join('、')}三个方向组织。第一类方法建立基础任务范式，第二类方法提升表示或推理能力，第三类工作关注评价、效率与真实场景中的稳健性。`,
        `文献比较不能只罗列模型名称，应统一说明其训练数据、参数规模、监督信号和评价协议。对无法在相同设置下直接比较的结果，应明确标注差异，避免把跨数据集数字当作同一排行榜。`,
        `与既有方法相比，本文方案的定位是围绕“${topic}”验证具体假设，并通过强基线、消融和误差分析说明改进来自何处，而不是只报告一个更高的最终分数。`,
      ];
    }
    if (key === 'conceptualFramework') {
      return [
        `本文将“新材料”限定为在成分、结构、功能或制造方式上形成显著技术变化，并可能改变生产、消费或公共服务的新型材料体系。研究不预设技术进步必然带来社会福利，而是同时考察收益、成本、风险及其在人群之间的分配。`,
        `研究采用系统性文献综述与典型案例比较。检索范围覆盖${profile.literatureTopics.join('、')}，并记录数据库、检索式、时间范围、纳入排除标准和质量评价结果，避免只选择支持预设观点的材料。`,
        `案例按技术成熟度、应用领域、地域和影响对象进行目的性分层，比较新材料在能源、交通、医疗、信息基础设施或日常消费中的扩散路径。案例结论用于解释影响机制，不直接代表全部新材料。`,
        `分析框架结合生命周期与社会影响评价、利益相关方分析和情景分析。利益相关方包括研发机构、制造企业、劳动者、消费者、社区、监管者以及承担环境与健康外部成本的群体。`,
      ];
    }
    if (key === 'technologyApplications') {
      return [
        `新材料的社会作用首先取决于其技术特性与应用场景。本文按功能材料、结构材料、生物医用材料和低碳材料等类别梳理代表性进展，并区分实验室性能、工程验证、规模化生产和市场扩散四个成熟阶段。`,
        `在能源与交通领域，轻量化、储能和耐极端环境材料可能改变能源效率、基础设施寿命与供应链结构；在医疗领域，生物相容和智能响应材料可能改善诊疗方式，同时引入长期安全性、价格与可及性问题。`,
        `在信息与制造领域，新型半导体、传感和增材制造材料可能提高自动化水平并重塑技能需求。技术应用不能只按性能提升评价，还需考察关键矿产依赖、生产能耗、维修回收体系和区域产业承载能力。`,
        `因此，应用场景分析把材料性能视为社会影响的起点，而非结论。只有将技术成熟度、基础设施、制度规则、商业模式与用户实践共同纳入，才能解释同一种材料为何在不同地区产生不同结果。`,
      ];
    }
    if (key === 'socialImpact') {
      return [
        `经济与产业层面，新材料可能创造新产品、新供应链和高技能岗位，也可能造成传统工艺淘汰、设备沉没成本和区域发展失衡。评价时应同时报告新增价值、转型成本、中小企业进入壁垒和关键原料的供应风险。`,
        `公共健康与生活质量层面，材料创新可能提升医疗可及性、建筑安全、清洁能源利用和消费品耐久性，但纳米尺度暴露、降解产物、职业接触和长期累积效应仍需要持续监测。技术便利不应掩盖风险在劳动者和弱势社区中的不均等分布。`,
        `环境层面需要采用全生命周期视角，比较原料开采、制造、运输、使用、维修、回收和最终处置，而不能只依据使用阶段的节能效果判断“绿色”。材料替代可能减少一种环境负荷，同时增加水耗、毒性或电子废弃物。`,
        `公平与可及性层面，应分析价格、基础设施、知识门槛和区域供给如何影响不同群体获得技术收益的机会。利益相关方访谈、公开统计和案例比较可用于识别谁受益、谁承担成本，以及影响是否能够通过政策调整。`,
        `当前 demo 不提供真实调查或统计结果，以上内容是证据组织框架。正式论文需要用可核验数据分别支持已观察影响、合理推断和未来情景，并为不确定结论标注证据等级。`,
      ];
    }
    if (key === 'governance') {
      return [
        `风险治理应覆盖材料全生命周期，包括原料来源、生产暴露、产品安全、数据与知识产权、回收处置和跨境供应链。监管不能只在损害发生后响应，还应在技术放大前设置测试、追踪和信息披露要求。`,
        `伦理分析重点考察知情权、风险同意、代际公平、环境正义和责任分配。当企业、研究机构、消费者与政府共同参与技术扩散时，需要明确谁负责长期监测、缺陷召回、污染修复和转型补偿。`,
        `治理工具可包括材料安全与性能标准、生命周期信息标签、生产者延伸责任、绿色采购、关键原料尽职调查和公众参与机制。不同工具应按技术成熟度和风险等级组合，而不是用单一准入规则覆盖所有材料。`,
        `面向不确定性，建议采用适应性治理：持续更新证据、设置阶段性准入、保留审计轨迹，并让受影响社区、劳动者和消费者进入决策过程。政策目标是在促进创新的同时，把不可逆风险和不公平成本控制在可接受范围内。`,
      ];
    }
    if (key === 'method' || key === 'theory') {
      return [
        `${title}：${profile.methodLanguage}。所有符号、变量、单位和输入输出在首次出现时定义，核心假设必须能够通过后续实验或数据分析被证伪。`,
        `研究流程从数据或样品准备开始，经过质量控制、核心方法执行和结果汇总。关键步骤设置对照或基线，非关键实现细节与核心创新分开描述，使读者能够判断性能变化来源。`,
        `参数选择应基于预先定义的规则或验证集，不使用测试结果反向调参。对于模型或算法，说明目标函数、优化过程与复杂度；对于实验系统，说明边界条件、设备或工艺参数及校准方法。`,
        `${profile.reproducibilityLanguage}。若使用模拟数据，必须在方法和结果中重复声明，且不得赋予其真实世界解释。`,
      ];
    }
    if (key === 'experimentSetup' || key === 'characterization') {
      return [
        `${title}用于确保不同方法在同一证据条件下比较。评价维度包括${profile.metrics.join('、')}，并同时报告主要指标、辅助指标和资源开销。`,
        `数据集、样品或实验条件按照固定规则划分，基线覆盖经典方法与当前强方法。超参数或工艺窗口在验证阶段确定，最终测试只执行一次，避免重复试验带来的选择偏差。`,
        `质量控制包括输入完整性检查、设备或程序校准、异常记录和独立重复。所有图表均应保留原始数据点或误差范围，不以平滑曲线或均值掩盖离散性。`,
      ];
    }
    if (key === 'results') {
      return [
        `结果章节围绕${profile.metrics.join('、')}依次报告。当前 demo 仅展示应如何组织结果，所有数值与趋势必须标注为模拟或待验证，不能替代真实实验输出。`,
        `${profile.evidenceLanguage}。主结果表需要列出对照或基线、本文方法、重复次数和不确定性，只有在评价协议一致时才进行直接比较。`,
        `除总体平均值外，还应按数据子集、条件区间或任务难度进行分层分析，以识别方法在哪些情形下有效、退化或失效。对于不支持假设的结果应完整保留。`,
        `效率与可部署性也是结果的一部分。应根据${profile.label}的研究目标报告计算、时间、能耗、材料或实验成本，避免以不可复现的资源投入换取表面性能提升。`,
      ];
    }
    if (key === 'errorAnalysis' || key === 'limitations' || key === 'safety') {
      return [
        `${title}聚焦主结果之外的证据。通过移除关键组件、改变数据条件或调整参数范围，判断性能来源和敏感因素，并展示具有代表性的失败案例。`,
        `局限性包括数据或样品覆盖不足、评价协议的外部效度、资源约束以及未测量混杂因素。${profile.evidenceLanguage}，并避免把局部结果外推到未测试场景。`,
        `${profile.reproducibilityLanguage}。后续工作应优先补齐最可能改变结论的验证，而不是继续增加无法解释的复杂模块。`,
      ];
    }
    if (key === 'discussion') {
      return [
        `讨论应回到“${topic}”的研究假设，解释主要结果是否支持该假设以及可能的替代解释。${profile.evidenceLanguage}。`,
        `与既有工作的差异需要结合${profile.literatureTopics.join('、')}分析。结果不一致时，应检查数据、样品、参数、基线和评价协议，而不能简单归因于随机误差。`,
        `本研究的价值在于${profile.methodLanguage}，并以${profile.metrics.join('、')}建立透明证据链。其适用范围受当前实验条件限制，外部推广需要独立数据或重复实验。`,
        `${profile.reproducibilityLanguage}。未来研究应围绕最关键的不确定性开展验证，并公开足够材料供同行复核。`,
      ];
    }
    return [
      `综上，本研究围绕“${topic}”形成了符合${profile.label}论文规范的研究方案。当前初稿明确区分模拟展示与真实证据，并以${profile.metrics.join('、')}约束结论强度。获得真实数据后，应重新审校摘要、结果和结论。`,
    ];
  };

  const sections: Record<string, string> = {};
  for (const spec of profile.sections) {
    const target = Math.max(spec.key === 'keywords' ? 30 : 80, Math.round(total * spec.weight));
    const sectionExpansions = [
      `质量控制方面，本节以“${spec.focus}”为审查重点，预先固定纳入规则、对照或基线、异常处理和停止标准，避免在观察结果后改变评价口径。`,
      `证据解释方面，${profile.evidenceLanguage}。对于阴性结果、相互矛盾的指标和不支持假设的观察，应完整报告并分析其对结论强度的影响。`,
      `可重复性方面，${profile.reproducibilityLanguage}。正文需说明原始材料、处理流程和分析输出之间的对应关系，使同行能够定位每项结论的证据来源。`,
      `评价时综合考察${profile.metrics.join('、')}，既报告总体表现，也报告离散性、资源约束和适用边界，避免用单一最优数值替代完整证据链。`,
    ];
    sections[spec.key] = spec.key === 'keywords'
      ? `关键词：${profile.keywords.join('；')}`
      : fitParagraphs([...paragraphsFor(spec.key, spec.title, spec.focus), ...sectionExpansions], target);
  }
  return sections;
}

export function buildProfessionalPaper(input: BuildInput): BuildResult {
  const targetCharacters = Math.min(50_000, Math.max(800, Math.round(input.wordLimit ?? 3000)));
  const profile = resolveWritingProfile(input.discipline, input.question);
  const paperSections = profile.key === 'biology'
    ? buildBiologySections(input, targetCharacters)
    : buildProfileSections(input, targetCharacters, profile);
  const minimumCharacters = Math.round(targetCharacters * 0.95);
  const supplementalParagraphs = [
    `数据与研究材料管理方面，${profile.reproducibilityLanguage}。开放共享不能替代质量控制，但能够帮助同行识别分析选择、复现实验流程并评价结论稳健性。`,
    `报告规范方面，摘要、方法、结果和图表中的评价口径必须一致。${profile.evidenceLanguage}，阴性结果和不支持假设的观察同样需要保留。`,
    `外部效度方面，当前结果只适用于已经验证的数据、样品、参数和条件。推广到新场景前，应围绕${profile.metrics.join('、')}进行独立复核。`,
  ];
  const expansionKey = paperSections.discussion ? 'discussion' : paperSections.errorAnalysis ? 'errorAnalysis' : paperSections.results ? 'results' : 'conclusion';
  for (const paragraph of supplementalParagraphs) {
    if (countPaperCharacters(paperSections) >= minimumCharacters) break;
    paperSections[expansionKey] += `\n\n${paragraph}`;
  }
  const agents = profile.sections.map((spec) => ({
    section: spec.key,
    role: spec.role,
    targetCharacters: Math.max(spec.key === 'keywords' ? 30 : 80, Math.round(targetCharacters * spec.weight)),
    focus: spec.focus,
  }));

  return {
    paperSections,
    writingPlan: {
      targetCharacters,
      actualCharacters: countPaperCharacters(paperSections),
      disciplineProfile: profile.key,
      researchApproach: profile.approach ?? 'disciplinary',
      agents,
      editorialChecks: [
        '章节之间的研究问题、方法和结论一致',
        '模拟数据与真实数据明确区分',
        `证据标准符合${profile.label}研究规范`,
        '可重复性、伦理和利益冲突声明完整',
        '实际字数控制在目标字数的合理误差范围内',
      ],
    },
  };
}
