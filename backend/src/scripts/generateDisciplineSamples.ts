import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExperimentInput, ProjectArtifacts } from '../types';
import { renderDocx } from '../services/docxRenderer';
import { buildProfessionalPaper } from '../services/professionalPaper';

interface SampleSpec {
  filename: string;
  projectName: string;
  discipline: string;
  question: string;
  metrics: ExperimentInput['metrics'];
  literature: Array<Record<string, unknown>>;
}

const samples: SampleSpec[] = [
  {
    filename: '新材料对人类社会影响-3000字-验收版.docx',
    projectName: '新材料对人类社会的影响研究',
    discipline: 'Material',
    question: '新材料对人类社会的影响',
    metrics: [
      { name: '证据覆盖度', value: '待系统检索', note: '按数据库、年份和研究类型统计' },
      { name: '利益相关方覆盖', value: '待案例编码', note: '企业、劳动者、消费者、社区与监管者' },
      { name: '治理成熟度', value: '待评价', note: '标准、追踪、回收和公众参与' },
    ],
    literature: [
      { title: 'The Social Construction of Technological Systems', authors: ['Bijker WE', 'Hughes TP', 'Pinch TJ'], year: 1987, venue: 'MIT Press' },
      { title: 'States of Knowledge: The Co-production of Science and Social Order', authors: ['Jasanoff S'], year: 2004, venue: 'Routledge' },
      { title: 'Environmental management - Life cycle assessment - Principles and framework', authors: ['ISO'], year: 2006, venue: 'ISO 14040:2006' },
    ],
  },
  {
    filename: 'NLP专业论文-3000字-验收版.docx',
    projectName: '检索增强生成对中文长文本问答幻觉的影响研究',
    discipline: 'NLP',
    question: '检索增强生成能否在保持回答相关性的同时降低中文长文本问答中的事实性幻觉？',
    metrics: [
      { name: 'F1（模拟）', value: '0.78', note: '待真实测试集核验' },
      { name: 'ROUGE-L（模拟）', value: '0.41', note: '待真实测试集核验' },
      { name: '人工事实一致性（模拟）', value: '3.8', unit: '/5' },
    ],
    literature: [
      { title: 'Attention Is All You Need', authors: ['Vaswani A', 'Shazeer N', 'Parmar N'], year: 2017, venue: 'NeurIPS' },
      { title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', authors: ['Devlin J', 'Chang MW', 'Lee K', 'Toutanova K'], year: 2019, venue: 'NAACL-HLT', doi: '10.18653/v1/N19-1423' },
      { title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', authors: ['Lewis P', 'Perez E', 'Piktus A'], year: 2020, venue: 'NeurIPS' },
    ],
  },
  {
    filename: '材料科学专业论文-3000字-验收版.docx',
    projectName: '热处理制度对合金微观结构与力学性能的影响研究',
    discipline: 'Material',
    question: '不同热处理温度与保温时间如何改变合金物相、晶粒尺寸和力学性能？',
    metrics: [
      { name: '目标物相比例（模拟）', value: '82', unit: '%' },
      { name: '平均晶粒尺寸（模拟）', value: '46', unit: 'nm' },
      { name: '相对强度（模拟）', value: '1.18', note: '相对未处理基线' },
    ],
    literature: [
      { title: 'Materials Science and Engineering: An Introduction', authors: ['Callister WD', 'Rethwisch DG'], year: 2018, venue: 'Wiley' },
      { title: 'Elements of X-Ray Diffraction', authors: ['Cullity BD', 'Stock SR'], year: 2001, venue: 'Prentice Hall' },
      { title: 'Transmission Electron Microscopy: A Textbook for Materials Science', authors: ['Williams DB', 'Carter CB'], year: 2009, venue: 'Springer', doi: '10.1007/978-0-387-76501-3' },
    ],
  },
  {
    filename: '物理学专业论文-3000字-验收版.docx',
    projectName: '数值离散尺度对扩散方程求解精度与收敛性的影响',
    discipline: 'Physics',
    question: '空间网格与时间步长如何影响扩散方程数值解的稳定性、误差和收敛阶？',
    metrics: [
      { name: '相对不确定度（模拟）', value: '3.2', unit: '%' },
      { name: '拟合优度 R2（模拟）', value: '0.96' },
      { name: '网格收敛误差（模拟）', value: '1.4', unit: '%' },
    ],
    literature: [
      { title: 'An Introduction to Error Analysis', authors: ['Taylor JR'], year: 1997, venue: 'University Science Books' },
      { title: 'Numerical Recipes: The Art of Scientific Computing', authors: ['Press WH', 'Teukolsky SA', 'Vetterling WT', 'Flannery BP'], year: 2007, venue: 'Cambridge University Press' },
      { title: 'Finite Difference Methods for Ordinary and Partial Differential Equations', authors: ['LeVeque RJ'], year: 2007, venue: 'SIAM', doi: '10.1137/1.9780898717839' },
    ],
  },
];

async function main(): Promise<void> {
  const outputDir = join(process.cwd(), '..', 'output');
  await mkdir(outputDir, { recursive: true });

  for (const sample of samples) {
    const paper = buildProfessionalPaper({
      projectName: sample.projectName,
      discipline: sample.discipline,
      question: sample.question,
      wordLimit: 3000,
    });
    const artifacts: ProjectArtifacts = {
      paperSections: paper.paperSections,
      writingPlan: paper.writingPlan,
      experiment: {
        source: 'agent',
        methodology: '本表仅用于展示该学科的规范报告字段，所有数值均为模拟并等待真实研究核验。',
        materials: '待补充真实数据、样品或实验记录。',
        procedure: '按论文方法章节执行并保留质量控制记录。',
        metrics: sample.metrics,
        resultsDescription: '模拟结果，不代表真实发现。',
      },
      literature: sample.literature,
    };
    const buffer = await renderDocx(artifacts, {
      projectName: sample.projectName,
      discipline: sample.discipline,
      question: sample.question,
    });
    await writeFile(join(outputDir, sample.filename), buffer);
  }
}

void main();
