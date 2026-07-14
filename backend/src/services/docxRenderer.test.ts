import { describe, expect, it } from 'vitest';
import { renderDocx } from './docxRenderer';

describe('docxRenderer discipline sections', () => {
  it('NLP Word 使用相关工作、实验设置和误差分析，不出现生物学方法标题', async () => {
    const buffer = await renderDocx(
      {
        paperSections: {
          abstract: '摘要',
          introduction: '引言',
          relatedWork: '相关工作正文',
          method: '模型方法正文',
          experimentSetup: '实验设置正文',
          results: '结果正文',
          errorAnalysis: '误差分析正文',
          conclusion: '结论',
        },
      },
      { projectName: 'NLP 论文', discipline: 'NLP', question: '如何改进文本分类？' },
    );
    const packageText = buffer.toString('utf8');

    expect(packageText).toContain('相关工作');
    expect(packageText).toContain('实验设置');
    expect(packageText).toContain('消融与误差分析');
    expect(packageText).not.toContain('材料与方法');
  });

  it('材料学 Word 使用制备、表征和工程局限章节', async () => {
    const buffer = await renderDocx(
      { paperSections: { method: '制备', characterization: '表征', limitations: '局限' } },
      { projectName: '材料论文', discipline: 'Material', question: '结构如何影响性能？' },
    );
    const packageText = buffer.toString('utf8');

    expect(packageText).toContain('实验材料与制备方法');
    expect(packageText).toContain('结构表征与性能测试');
    expect(packageText).toContain('工程可行性与局限');
  });

  it('材料社会影响题目 Word 使用社会影响评价结构', async () => {
    const buffer = await renderDocx(
      { paperSections: { conceptualFramework: '框架', socialImpact: '影响', governance: '治理' } },
      { projectName: '新材料与社会', discipline: 'Material', question: '新材料对人类社会的影响' },
    );
    const packageText = buffer.toString('utf8');

    expect(packageText).toContain('概念框架与研究范围');
    expect(packageText).toContain('社会影响分析');
    expect(packageText).toContain('风险、伦理与治理');
    expect(packageText).not.toContain('实验材料与制备方法');
  });
});
