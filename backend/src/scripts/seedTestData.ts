/**
 * 测试数据生成脚本
 *
 * 用途：往数据库插入一批覆盖各学科 / 各模板 / 各阶段 / 各模式的项目，
 *       方便前端 Demo 与联调测试使用。
 *
 * 用法：
 *   cd backend
 *   npx ts-node-dev --transpile-only scripts/seedTestData.ts
 *
 *   或者：先 npm run dev 启动后端，然后：
 *   npx ts-node --transpile-only scripts/seedTestData.ts
 */
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { llmService } from '../services/llmService';
import type { ProjectArtifacts, DraftTemplate, PipelineMode } from '../types';

interface SeedProject {
  name: string;
  discipline: string;
  question: string;
  description: string;
  mode: PipelineMode;
  template: DraftTemplate;
  /**
   * 直接注入 artifacts（跳过 LLM 调用），用于快速填满 figure / paperSections / literature
   * null 表示新项目（仅基本字段）
   */
  artifacts?: ProjectArtifacts;
  /**
   * 给 manual 模式直接塞一个 HIL 队列，方便在 HIL 队列页面看到内容
   */
  hilQueue?: Array<{ stage: string; title: string; message: string; agentProposal: string }>;
  /**
   * 预置 pipelineStatus（默认 'idle'）
   */
  pipelineStatus?: 'idle' | 'running' | 'paused' | 'interrupted' | 'aborted' | 'completed' | 'error';
}

const SAMPLE_FIGURES = [
  {
    id: 'fig1',
    type: 'line',
    title: '训练损失曲线',
    caption: '模型在训练集与验证集上的损失随 epoch 的变化',
    code: `fig, ax = plt.subplots()
ax.plot([1,2,3,4,5,6,7,8],[0.92,0.61,0.40,0.28,0.21,0.16,0.13,0.11], 'o-', label='train')
ax.plot([1,2,3,4,5,6,7,8],[0.93,0.68,0.51,0.43,0.39,0.36,0.34,0.33], 's--', label='val')
ax.set_xlabel('epoch'); ax.set_ylabel('loss'); ax.legend(); ax.set_title('Loss Curve')`,
  },
  {
    id: 'fig2',
    type: 'bar',
    title: '模型对比柱状图',
    caption: '本研究方法与 3 个基线在主指标上的得分对比',
    code: `fig, ax = plt.subplots()
methods = ['Baseline-A','Baseline-B','Baseline-C','Ours']
scores = [0.612, 0.683, 0.745, 0.852]
bars = ax.bar(methods, scores, color=['#94a3b8','#94a3b8','#94a3b8','#2563eb'])
ax.set_ylabel('F1 score'); ax.set_ylim(0, 1)
for b, s in zip(bars, scores):
    ax.text(b.get_x()+b.get_width()/2, s+0.01, f'{s:.3f}', ha='center')
ax.set_title('Performance Comparison')`,
  },
  {
    id: 'fig3',
    type: 'scatter',
    title: '特征空间散点图',
    caption: '隐层特征 t-SNE 降维后的聚类分布',
    code: `import numpy as np
np.random.seed(0)
fig, ax = plt.subplots()
for i, (cx, cy, col) in enumerate([(0,0,'#ef4444'),(3,1,'#10b981'),(-2,2,'#3b82f6')]):
    x = np.random.randn(40) * 0.6 + cx
    y = np.random.randn(40) * 0.6 + cy
    ax.scatter(x, y, c=col, label=f'class {i}', alpha=0.7, edgecolors='white')
ax.legend(); ax.set_title('t-SNE Visualization')`,
  },
  {
    id: 'fig4',
    type: 'heatmap',
    title: '混淆矩阵热力图',
    caption: '10 分类任务上的归一化混淆矩阵',
    code: `import numpy as np
np.random.seed(1)
fig, ax = plt.subplots()
m = np.random.rand(10,10)
m = m / m.sum(axis=1, keepdims=True)
im = ax.imshow(m, cmap='Blues', vmin=0, vmax=0.5)
ax.set_xticks(range(10)); ax.set_yticks(range(10))
ax.set_xlabel('Predicted'); ax.set_ylabel('True')
fig.colorbar(im, ax=ax, shrink=0.8)
ax.set_title('Confusion Matrix')`,
  },
];

const SAMPLE_LITERATURE = [
  { title: 'Attention Is All You Need', authors: ['Vaswani A', 'Shazeer N', 'Parmar N'], year: 2017, venue: 'NeurIPS' },
  { title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['Devlin J', 'Chang MW', 'Lee K'], year: 2019, venue: 'NAACL' },
  { title: 'A Survey on Knowledge Graphs', authors: ['Ji S', 'Pan S', 'Cambria E'], year: 2022, venue: 'TNNLS' },
  { title: 'Graph Neural Networks: A Review of Methods and Applications', authors: ['Wu Z', 'Pan S', 'Chen F'], year: 2021, venue: 'AI Open' },
  { title: 'Deep Residual Learning for Image Recognition', authors: ['He K', 'Zhang X', 'Ren S'], year: 2016, venue: 'CVPR' },
];

function buildFullArtifacts(sections: Record<string, string>, figs = SAMPLE_FIGURES.slice(0, 3)): ProjectArtifacts {
  return {
    paperSections: sections,
    literature: SAMPLE_LITERATURE,
    figures: figs,
  };
}

const SEED_PROJECTS: SeedProject[] = [
  // 1. NLP 完整项目（已完成流水线，可下载 docx 验证图片）
  {
    name: '基于预训练语言模型的中文长文本摘要研究',
    discipline: 'NLP',
    question: '如何让预训练语言模型在中文长文本摘要任务上同时兼顾事实性与可读性？',
    description: '探索 PEGASUS/BART 在中文长文档上的微调与解码约束',
    mode: 'auto',
    template: 'docx',
    pipelineStatus: 'completed',
    artifacts: buildFullArtifacts({
      abstract: '本文面向中文长文档摘要任务，研究基于预训练语言模型的微调方法与解码阶段的约束策略，提出事实感知的解码算法。',
      introduction: '中文长文本摘要面临事实漂移与指代缺失两大挑战。',
      method: '采用 BART-base 作为基座，引入事实性奖励信号做 RLHF 微调。',
      results: '在 LCSTS 与 CSL 数据集上 ROUGE-L 提升 4.7%，事实一致性提升 8.3%。',
      discussion: '模型在小样本场景下仍存在幻觉，未来可结合 RAG 引入外部知识。',
      conclusion: '事实感知解码能显著提升中文长文本摘要的可信度。',
    }),
  },
  // 2. CV 中等阶段（中断，可走 HIL 弹窗）
  {
    name: '面向低算力场景的轻量级图像分类算法',
    discipline: 'CV',
    question: '如何在 50M FLOPs 以下保持 ImageNet top-1 准确率不低于 75%？',
    description: '基于 MobileNetV4 与结构化剪枝的轻量化设计',
    mode: 'manual',
    template: 'markdown',
    pipelineStatus: 'interrupted',
    artifacts: buildFullArtifacts({
      abstract: '面向移动端部署，研究高效 CNN 结构与剪枝策略。',
      introduction: '边缘算力受限，传统 ResNet 难以满足实时需求。',
      method: '采用 MobileNetV4 骨架 + L1 剪枝 + 知识蒸馏三阶段训练。',
    }, SAMPLE_FIGURES.slice(1, 3)),
    hilQueue: [
      {
        stage: 'experiment',
        title: '实验设计需您审阅',
        message: '实验方案已生成，请确认是否进入训练与评估。',
        agentProposal: '【实验设计】\n1. 数据集：ImageNet-1K 子集（100 类）\n2. 基线：MobileNetV3-Large\n3. 训练：90 epoch, AdamW, cosine LR\n4. 评估：top-1 / top-5 / FLOPs / 参数量',
      },
    ],
  },
  // 3. Bio 已中止
  {
    name: '面向低算力医疗资源的研究',
    discipline: 'Bio',
    question: '在仅有 4GB 显存的设备上能否运行蛋白质结构预测？',
    description: '探索 ESMFold 量化与分段推理',
    mode: 'auto',
    template: 'ctex',
    pipelineStatus: 'aborted',
    artifacts: buildFullArtifacts({
      abstract: '本项目评估 ESMFold 在消费级 GPU 上的可行性。',
      introduction: '蛋白质结构预测模型通常需要 A100 级别显存。',
    }, [SAMPLE_FIGURES[2]]),
  },
  // 4. CV 进行中
  {
    name: '面向自动驾驶的小目标检测算法',
    discipline: 'CV',
    question: '在雨雾天气下如何提升 50 米外小目标的召回率？',
    description: '基于多尺度特征融合 + 自适应去雾预处理',
    mode: 'auto',
    template: 'ieee',
    pipelineStatus: 'running',
  },
  // 5. NLP 草稿态
  {
    name: '基于知识图谱的金融问答系统',
    discipline: 'NLP',
    question: '如何结合 KG 提升金融领域多跳问答的推理准确率？',
    description: 'RAG + KG reasoning pipeline',
    mode: 'auto',
    template: 'journal',
    pipelineStatus: 'paused',
  },
  // 6. NLP 错误态
  {
    name: '基于对比学习的文本聚类',
    discipline: 'NLP',
    question: 'SimCSE 在短文本聚类上是否优于传统主题模型？',
    description: '对比 SimCSE / LDA / K-means',
    mode: 'auto',
    template: 'docx',
    pipelineStatus: 'error',
  },
  // 7. 演示用 manual + HIL 队列多条
  {
    name: 'manual-hil-demo 多阶段演示',
    discipline: 'NLP',
    question: '人工审阅模式下流水线是否能按 HIL 阶段逐步推进？',
    description: '演示用，触发多个 HIL 中断点',
    mode: 'manual',
    template: 'markdown',
    pipelineStatus: 'interrupted',
    artifacts: buildFullArtifacts({
      abstract: '本文演示 RAP 系统在 manual 模式下的 8 阶段流水线。',
      introduction: 'manual 模式允许研究者在关键阶段决策。',
    }, [SAMPLE_FIGURES[0]]),
    hilQueue: [
      {
        stage: 'literature',
        title: '文献调研完成，请审阅',
        message: '已完成 5 篇核心文献的调研与摘要。',
        agentProposal: '【文献综述】检索 arXiv + OpenAlex 得到 5 篇与查询强相关文献。',
      },
      {
        stage: 'design',
        title: '研究方案生成，请审阅',
        message: '已生成包含研究假设、变量与实验步骤的方案。',
        agentProposal: '【研究方案】\n1. 假设 H1：...；H2：...\n2. 变量：自变量 X、因变量 Y\n3. 实验步骤：...',
      },
      {
        stage: 'experiment',
        title: '实验设计就绪，请审阅',
        message: '实验代码已生成，可下载到沙箱执行。',
        agentProposal: '【实验设计】\n1. 数据集：...\n2. 基线：...\n3. 评估指标：...',
      },
    ],
  },
  // 8. 全新项目（artifacts 空）
  {
    name: '空白项目-准备开始',
    discipline: 'NLP',
    question: '（待用户填写研究问题）',
    description: '新建空白项目',
    mode: 'auto',
    template: 'markdown',
    pipelineStatus: 'idle',
  },
];

async function main() {
  console.log('[seed] 启动测试数据生成...');

  // 1. 准备用户
  const adminEmail = 'admin@rap.dev';
  const adminPwd = 'admin123';
  let admin = await userService.getByEmail(adminEmail);
  if (!admin) {
    admin = await userService.register({ email: adminEmail, password: adminPwd, username: '管理员', discipline: '综合' });
    console.log(`[seed] 已创建管理员用户 ${adminEmail}`);
  } else {
    console.log(`[seed] 管理员用户已存在: ${adminEmail}`);
  }

  // 2. 准备另一个普通用户（用于演示项目隔离）
  const userEmail = 'tester@rap.dev';
  const userPwd = 'test123';
  let tester = await userService.getByEmail(userEmail);
  if (!tester) {
    tester = await userService.register({ email: userEmail, password: userPwd, username: '测试员', discipline: 'NLP' });
    console.log(`[seed] 已创建测试用户 ${userEmail}`);
  } else {
    console.log(`[seed] 测试用户已存在: ${userEmail}`);
  }

  // 3. 批量创建项目（管理员名下）
  let created = 0;
  for (const sp of SEED_PROJECTS) {
    const project = await projectService.create({
      name: sp.name,
      discipline: sp.discipline,
      question: sp.question,
      description: sp.description,
      mode: sp.mode,
      template: sp.template,
    }, admin.id);
    // 注入 artifacts（如有）
    if (sp.artifacts) {
      await projectService.setArtifacts(project.id, sp.artifacts);
    }
    // 注入 HIL 队列（如有）
    if (sp.hilQueue && sp.hilQueue.length > 0) {
      // HIL 队列由真实 manual 流程生成，seed 仅保留项目和阶段产物。
    }
    // 注入 pipelineStatus（如有且非 idle）
    if (sp.pipelineStatus && sp.pipelineStatus !== 'idle') {
      await projectService.setPipelineStatus(project.id, sp.pipelineStatus as never, sp.pipelineStatus);
    }
    created++;
    console.log(`[seed] ✓ 项目 ${created}/${SEED_PROJECTS.length}  「${sp.name}」 [${sp.discipline}] [${sp.template}] [${sp.pipelineStatus}]`);
  }

  // 4. 单独建一个属于测试员的项目（演示用户隔离）
  await projectService.create({
    name: '测试员的个人项目',
    discipline: 'NLP',
    question: '测试员的项目不会出现在管理员账号下',
    description: '演示多用户项目隔离',
    mode: 'auto',
    template: 'markdown',
  }, tester.id);
  console.log('[seed] ✓ 已创建测试员的私有项目');

  console.log('\n[seed] ============================================');
  console.log('[seed]  测试数据生成完成');
  console.log('[seed] ============================================');
  console.log(`[seed]  管理员账号: ${adminEmail} / ${adminPwd}`);
  console.log(`[seed]  普通用户:  ${userEmail} / ${userPwd}`);
  console.log(`[seed]  共创建项目: ${SEED_PROJECTS.length + 1} 个`);
  console.log('[seed]  现在可以打开 http://localhost:5173 用 admin/admin123 登录查看');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
