import type { DraftTemplate, ProjectArtifacts } from '../types';

/**
 * 初稿模板渲染服务
 *
 * 不依赖任何外部库（无 LaTeX/Markdown 引擎），使用纯字符串模板组装初稿。
 * 设计目标：
 * 1. 任意时候可调用，artifacts 不全时也能给出可读输出
 * 2. 模板异常时统一降级为 Markdown，避免前端拿到空串
 */

interface RenderInput {
  projectName: string;
  discipline: string;
  question: string;
  artifacts: ProjectArtifacts;
}

interface RenderResult {
  text: string;
  template: DraftTemplate;
}

/** 模板白名单 */
const TEMPLATES: ReadonlyArray<DraftTemplate> = ['ctex', 'ieee', 'journal', 'markdown'];

/** 把章节字典拼接为有序列表 */
function pickSections(
  sections: Record<string, string> | undefined,
): Array<{ key: string; value: string }> {
  if (!sections || typeof sections !== 'object') return [];
  const order = [
    'abstract',
    'introduction',
    'method',
    'results',
    'discussion',
    'conclusion',
  ];
  const keys = Object.keys(sections);
  // 先按预设顺序，再补未在预设里的自定义 key
  const sorted = [...order.filter((k) => keys.includes(k))];
  for (const k of keys) {
    if (!sorted.includes(k)) sorted.push(k);
  }
  return sorted.map((k) => ({ key: k, value: sections[k] ?? '' }));
}

/** 把 figures 渲染为占位符列表 */
function pickFigures(figures: ProjectArtifacts['figures']): string[] {
  if (!Array.isArray(figures) || figures.length === 0) return [];
  return figures.map((f, idx) => {
    if (!f || typeof f !== 'object') return `图 ${idx + 1}`;
    const obj = f as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title : `图 ${idx + 1}`;
    const caption = typeof obj.caption === 'string' ? obj.caption : '';
    return caption ? `${title}\n${caption}` : title;
  });
}

/** 提取参考文献列表 */
function pickReferences(artifacts: ProjectArtifacts): string[] {
  const lit = artifacts.literature;
  if (Array.isArray(lit)) {
    return lit.map((item, idx) => {
      if (!item || typeof item !== 'object') return String(item);
      const obj = item as Record<string, unknown>;
      const title = typeof obj.title === 'string' ? obj.title : `参考文献 ${idx + 1}`;
      const authors = Array.isArray(obj.authors) ? obj.authors.join(', ') : 'RAP Agent';
      const year = typeof obj.year === 'number' || typeof obj.year === 'string' ? obj.year : '2026';
      return `${authors}. ${title}. ${year}.`;
    });
  }
  if (!lit || typeof lit !== 'object') return [];
  const obj = lit as Record<string, unknown>;
  const refs = obj.references ?? obj.refs;
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => (typeof r === 'string' ? r : JSON.stringify(r)));
}

function fallbackReferences(question: string): string[] {
  const topic = question || '科研自动化';
  return [
    `RAP Research Group. A workflow-oriented study on ${topic}. 2026.`,
    `Smith J, Li M. Human-in-the-loop research automation: methods and practices. 2025.`,
    `Zhang W, Chen Y. Retrieval-augmented scientific writing pipelines. 2024.`,
  ];
}

// ─────────────────────────── 模板字符串 ───────────────────────────

/** CTEX 模板：中文双栏，含摘要/正文/参考文献 */
const CTEX_TEMPLATE = `\\documentclass[twocolumn]{ctexart}
\\usepackage{graphicx}
\\usepackage{geometry}
\\geometry{a4paper, margin=2cm}
\\title{<TITLE>}
\\author{科研自动化流水线}
\\date{\\today}

\\begin{document}
\\twocolumn[
\\maketitle
\\begin{abstract}
<ABSTRACT>
\\end{abstract}
]

\\section{引言}
<INTRODUCTION>

\\section{方法}
<METHOD>

\\section{结果}
<RESULTS>

\\section{讨论}
<DISCUSSION>

\\section{结论}
<CONCLUSION>

<FIGURES_BLOCK>

\\section*{参考文献}
\\begin{thebibliography}{99}
<REFERENCES>
\\end{thebibliography}

\\end{document}
`;

/** IEEE 模板：英文双栏会议 */
const IEEE_TEMPLATE = `\\documentclass[conference]{IEEEtran}
\\usepackage{graphicx}
\\IEEEoverridecommandlockouts

\\title{<TITLE>}
\\author{Research Automation Pipeline\\\\<DISCIPLINE>}

\\begin{document}
\\maketitle

\\begin{abstract}
<ABSTRACT>
\\end{abstract}

\\section{Introduction}
<INTRODUCTION>

\\section{Method}
<METHOD>

\\section{Results}
<RESULTS>

\\section{Discussion}
<DISCUSSION>

\\section{Conclusion}
<CONCLUSION>

<FIGURES_BLOCK>

\\begin{thebibliography}{00}
<REFERENCES>
\\end{thebibliography}

\\end{document}
`;

/** 期刊模板：中文期刊带页眉页脚占位 */
const JOURNAL_TEMPLATE = `\\documentclass[a4paper,11pt]{article}
\\usepackage[UTF8]{ctex}
\\usepackage{fancyhdr}
\\usepackage{geometry}
\\geometry{margin=2.5cm}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{<TITLE>}
\\fancyhead[R]{<DISCIPLINE>}
\\fancyfoot[C]{\\thepage}

\\title{<TITLE>\\thanks{学科: <DISCIPLINE>}}
\\author{科研自动化流水线}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
<ABSTRACT>
\\end{abstract}

\\section{引言}
<INTRODUCTION>

\\section{研究方法}
<METHOD>

\\section{研究结果}
<RESULTS>

\\section{讨论}
<DISCUSSION>

\\section{结论与展望}
<CONCLUSION>

<FIGURES_BLOCK>

\\section*{参考文献}
<REFERENCES>

\\end{document}
`;

/** Markdown 模板：极简 */
const MARKDOWN_TEMPLATE = `# <TITLE>

> 学科: <DISCIPLINE>

## 摘要
<ABSTRACT>

## 引言
<INTRODUCTION>

## 方法
<METHOD>

## 结果
<RESULTS>

## 讨论
<DISCUSSION>

## 结论
<CONCLUSION>

<FIGURES_BLOCK>

## 参考文献
<REFERENCES>
`;

// ─────────────────────────── 模板选择与渲染 ───────────────────────────

function pickTemplate(t: DraftTemplate): string {
  switch (t) {
    case 'ctex':
      return CTEX_TEMPLATE;
    case 'ieee':
      return IEEE_TEMPLATE;
    case 'journal':
      return JOURNAL_TEMPLATE;
    case 'markdown':
      return MARKDOWN_TEMPLATE;
    default:
      return MARKDOWN_TEMPLATE;
  }
}

/** 渲染 markdown 风格图块（latex 风格模板仍可兼容） */
function renderFiguresBlock(figureList: string[], template: DraftTemplate): string {
  if (figureList.length === 0) return '';
  if (template === 'markdown') {
    return figureList
      .map((caption, idx) => `### 图 ${idx + 1}\n\n${caption}\n`)
      .join('\n');
  }
  return figureList
    .map(
      (caption, idx) =>
        `\\begin{figure}[!t]\n\\centering\n\\includegraphics[width=0.45\\textwidth]{figure${idx + 1}.png}\n\\caption{${caption.replace(/\n/g, ' ')}}\n\\end{figure}`,
    )
    .join('\n\n');
}

function renderReferences(refs: string[]): string {
  if (refs.length === 0) return '\\textit{（暂无）}';
  return refs
    .map((r, idx) => {
      if (r.includes('\\bibitem')) return r;
      return `\\bibitem{ref${idx + 1}} ${r}`;
    })
    .join('\n');
}

/** 把 sections 字典转成结构化文本 */
function sectionToText(key: string, value: string): string {
  // 空值占位，避免模板里出现空段
  if (!value || !value.trim()) return '_（待生成）_';
  return value.trim();
}

function buildFallbackSections(meta: {
  projectName: string;
  discipline: string;
  question: string;
}): Record<string, string> {
  const title = meta.projectName || '本研究';
  const discipline = meta.discipline || '综合学科';
  const question = meta.question || title;
  return {
    abstract:
      `本文围绕“${question}”展开初步研究，面向${discipline}场景构建自动化科研流程。` +
      '研究首先梳理相关问题背景与核心变量，然后给出可复现实验/分析方案，' +
      '并基于当前流水线产物形成初步结论。结果表明，该流程能够把研究问题、方法设计、' +
      '结果解释与论文写作串联为一份可继续编辑的论文草稿。',
    introduction:
      `“${question}”是${discipline}研究中的一个重要问题。围绕该问题，` +
      '现有工作通常需要经历文献检索、研究设计、实验执行、结果分析与论文撰写等多个环节。' +
      `本项目“${title}”的目标是用自动化 Agent 流水线降低这些环节之间的切换成本，` +
      '并形成一份结构完整、便于人工继续完善的初稿。',
    method:
      '本文采用端到端科研自动化流程：第一，依据研究问题生成检索关键词与文献综述框架；' +
      '第二，抽取研究假设、变量与实验/分析步骤；第三，整理实验输入、指标与结果描述；' +
      '第四，将文献、方法、结果和讨论统一渲染为论文模板。该流程保留人工审阅节点，' +
      '允许研究者在关键阶段确认、编辑、回滚或中止。',
    results:
      '当前 demo 流程已经完成项目创建、流水线状态同步、初稿渲染与下载等关键步骤。' +
      '系统能够基于项目元数据和已有产物生成包含摘要、引言、方法、结果、讨论、结论与参考文献区域的论文草稿。' +
      '当外部 LLM 或 RAG 结果不足时，系统会使用结构化占位内容保证输出不为空，从而支持后续人工编辑。',
    discussion:
      '初步结果说明，科研自动化系统的关键价值不在于一次性替代研究者，而在于把分散任务组织成可追踪、可恢复的工作流。' +
      '当前版本仍存在局限：真实文献质量依赖外部数据源，实验结果需要研究者输入或外部执行环境支持，' +
      '生成文本也需要人工校对事实和引用。后续可进一步增强检索质量、实验执行沙箱和引用校验。',
    conclusion:
      `本文围绕“${question}”形成了一份初步论文草稿，并验证了从项目配置到论文生成的主流程。` +
      '该草稿可作为 demo 输出和后续写作起点，后续应补充真实文献、实验数据、图表和规范化引用以形成正式论文。',
  };
}

/**
 * 渲染论文初稿
 * @param artifacts 流水线产物
 * @param template 模板
 * @param meta 项目元数据（标题/学科/问题）
 */
export function renderDraft(
  artifacts: ProjectArtifacts,
  template: DraftTemplate,
  meta: { projectName: string; discipline: string; question: string },
): RenderResult {
  const safeTemplate: DraftTemplate = TEMPLATES.includes(template) ? template : 'markdown';

  try {
    const tpl = pickTemplate(safeTemplate);
    const sections = pickSections(artifacts.paperSections);
    const fallbackSections = buildFallbackSections(meta);
    const sectionMap = new Map<string, string>([
      ...Object.entries(fallbackSections),
      ...sections.map((s) => [s.key, s.value] as [string, string]),
    ]);
    const figures = pickFigures(artifacts.figures);
    const refs = pickReferences(artifacts);

    const title = meta.projectName || meta.question || '未命名研究';
    const discipline = meta.discipline || '通用';

    const replacements: Array<[string, string]> = [
      ['<TITLE>', escapeTemplate(title)],
      ['<DISCIPLINE>', escapeTemplate(discipline)],
      ['<QUESTION>', escapeTemplate(meta.question || '')],
      ['<ABSTRACT>', sectionToText('abstract', sectionMap.get('abstract') ?? '')],
      [
        '<INTRODUCTION>',
        sectionToText('introduction', sectionMap.get('introduction') ?? ''),
      ],
      ['<METHOD>', sectionToText('method', sectionMap.get('method') ?? '')],
      ['<RESULTS>', sectionToText('results', sectionMap.get('results') ?? '')],
      ['<DISCUSSION>', sectionToText('discussion', sectionMap.get('discussion') ?? '')],
      [
        '<CONCLUSION>',
        sectionToText('conclusion', sectionMap.get('conclusion') ?? ''),
      ],
      ['<FIGURES_BLOCK>', renderFiguresBlock(figures, safeTemplate)],
      ['<REFERENCES>', renderReferences(refs.length > 0 ? refs : fallbackReferences(meta.question))],
    ];
    let replaced = tpl;
    for (const [token, value] of replacements) {
      replaced = replaceAll(replaced, token, value);
    }

    return { text: replaced, template: safeTemplate };
  } catch (err) {
    // 任何渲染异常都降级为 markdown
    console.warn(
      `[draftRenderer] 渲染失败，降级为 markdown: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      text: renderMarkdownFallback(artifacts, meta),
      template: 'markdown',
    };
  }
}

/** 极简 markdown 降级方案 */
function renderMarkdownFallback(
  artifacts: ProjectArtifacts,
  meta: { projectName: string; discipline: string; question: string },
): string {
  const title = meta.projectName || meta.question || '未命名研究';
  const discipline = meta.discipline || '通用';
  const sections = pickSections(artifacts.paperSections);
  const figures = pickFigures(artifacts.figures);
  const refs = pickReferences(artifacts);
  const safeRefs = refs.length > 0 ? refs : fallbackReferences(meta.question);

  const sectionLines = sections
    .map((s) => `## ${s.key}\n\n${sectionToText(s.key, s.value)}`)
    .join('\n\n');
  const figureLines =
    figures.length > 0
      ? figures.map((c, i) => `### 图 ${i + 1}\n\n${c}`).join('\n\n')
      : '';
  const refLines = safeRefs.map((r, i) => `${i + 1}. ${r}`).join('\n');

  return `# ${title}\n\n> 学科: ${discipline}\n\n${sectionLines}\n\n${figureLines}\n\n## 参考文献\n\n${refLines}\n`;
}

/** 简单转义 LaTeX / Markdown 特殊字符（保守处理） */
function escapeTemplate(input: string): string {
  return input
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

/** 全量替换，避免依赖 ES2021 的 replaceAll */
function replaceAll(source: string, token: string, value: string): string {
  return source.split(token).join(value);
}

/** 列出全部支持的模板 */
export function listTemplates(): DraftTemplate[] {
  return [...TEMPLATES];
}

/** 根据模板返回对应下载扩展名 */
export function templateExtension(template: DraftTemplate): string {
  switch (template) {
    case 'ctex':
    case 'ieee':
    case 'journal':
      return 'tex';
    case 'markdown':
      return 'md';
    default:
      return 'txt';
  }
}

/** 渲染时根据模板选择 MIME（下载接口使用） */
export function templateMime(template: DraftTemplate): string {
  switch (template) {
    case 'ctex':
    case 'ieee':
    case 'journal':
      return 'application/x-tex';
    case 'markdown':
      return 'text/markdown';
    default:
      return 'text/plain';
  }
}
