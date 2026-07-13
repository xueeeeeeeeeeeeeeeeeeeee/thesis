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
  if (!lit || typeof lit !== 'object') return [];
  const obj = lit as Record<string, unknown>;
  const refs = obj.references ?? obj.refs;
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => (typeof r === 'string' ? r : JSON.stringify(r)));
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
    const sectionMap = new Map(sections.map((s) => [s.key, s.value]));
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
      ['<REFERENCES>', renderReferences(refs)],
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

  const sectionLines = sections
    .map((s) => `## ${s.key}\n\n${sectionToText(s.key, s.value)}`)
    .join('\n\n');
  const figureLines =
    figures.length > 0
      ? figures.map((c, i) => `### 图 ${i + 1}\n\n${c}`).join('\n\n')
      : '';
  const refLines = refs.length > 0 ? refs.map((r, i) => `${i + 1}. ${r}`).join('\n') : '_（暂无）_';

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
