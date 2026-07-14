import { describe, expect, it } from 'vitest';
import { buildProfessionalPaper, countPaperCharacters } from './professionalPaper';

describe('professionalPaper', () => {
  it('为生物学项目生成接近目标字数的专业 IMRaD 论文', () => {
    const result = buildProfessionalPaper({
      projectName: '肿瘤微环境中巨噬细胞极化研究',
      discipline: 'Bio',
      question: '肿瘤相关巨噬细胞极化如何影响肿瘤细胞迁移？',
      wordLimit: 3000,
    });

    expect(result.paperSections.abstract).toContain('目的');
    expect(result.paperSections.keywords).toContain('关键词');
    expect(result.paperSections.method).toContain('材料与方法');
    expect(result.paperSections.method).toContain('统计学分析');
    expect(result.paperSections.method).toContain('伦理');
    expect(result.paperSections.results).toContain('模拟');
    expect(result.paperSections.discussion.split('\n\n').length).toBeGreaterThanOrEqual(3);
    expect(result.writingPlan.agents).toHaveLength(7);
    expect(result.writingPlan.agents.some((agent) => agent.role === '生物统计学审稿人')).toBe(true);

    const actual = countPaperCharacters(result.paperSections);
    expect(actual).toBeGreaterThanOrEqual(2850);
    expect(actual).toBeLessThanOrEqual(3300);
    expect(result.writingPlan.actualCharacters).toBe(actual);
  });

  it('最小字数要求也不会退化为科研流水线说明文', () => {
    const result = buildProfessionalPaper({
      projectName: '细胞应激响应研究',
      discipline: '生物学',
      question: '氧化应激如何改变细胞凋亡水平？',
      wordLimit: 800,
    });

    const text = Object.values(result.paperSections).join('\n');
    expect(text).toContain('细胞');
    expect(text).not.toContain('literature、design、experiment');
    expect(countPaperCharacters(result.paperSections)).toBeGreaterThanOrEqual(720);
  });

  it.each([
    ['NLP', 'nlp', ['relatedWork', 'experimentSetup', 'errorAnalysis'], 'F1/BLEU/ROUGE'],
    ['CV', 'cv', ['relatedWork', 'experimentSetup', 'errorAnalysis'], 'mAP/IoU'],
    ['Bio', 'biology', ['method', 'results', 'discussion'], '95%置信区间'],
    ['Material', 'material', ['method', 'characterization', 'limitations'], '力学/电学/热学性能'],
    ['Chem', 'chemistry', ['method', 'characterization', 'safety'], '分离产率与选择性'],
    ['Physics', 'physics', ['theory', 'method', 'discussion'], '拟合优度与不确定度'],
    ['ML', 'ml', ['relatedWork', 'experimentSetup', 'errorAnalysis'], '任务性能与方差'],
    ['IR', 'ir', ['relatedWork', 'experimentSetup', 'errorAnalysis'], 'nDCG/MRR/Recall'],
  ] as const)(
    '%s 使用独立学科配置、章节和评价语言',
    (discipline, expectedProfile, expectedSections, metricLanguage) => {
      const result = buildProfessionalPaper({
        projectName: `${discipline} 专业论文`,
        discipline,
        question: `${discipline} 研究问题`,
        wordLimit: 2000,
      });

      expect(result.writingPlan.disciplineProfile).toBe(expectedProfile);
      expect(Object.keys(result.paperSections)).toEqual(expect.arrayContaining([...expectedSections]));
      expect(Object.values(result.paperSections).join('\n')).toContain(metricLanguage);
      expect(result.writingPlan.agents.map((agent) => agent.section)).toEqual(
        Object.keys(result.paperSections),
      );
      expect(countPaperCharacters(result.paperSections)).toBeGreaterThanOrEqual(1800);
      expect(countPaperCharacters(result.paperSections)).toBeLessThanOrEqual(2300);
    },
  );

  it('材料学社会影响题目使用综述评价路径而不是实验制备路径', () => {
    const result = buildProfessionalPaper({
      projectName: '新材料与社会发展研究',
      discipline: 'Material',
      question: '新材料对人类社会的影响',
      wordLimit: 3000,
    });

    expect(result.writingPlan.disciplineProfile).toBe('material');
    expect(result.paperSections).toHaveProperty('conceptualFramework');
    expect(result.paperSections).toHaveProperty('socialImpact');
    expect(result.paperSections).toHaveProperty('governance');
    const text = Object.values(result.paperSections).join('\n');
    expect(text).toContain('利益相关方');
    expect(text).toContain('案例比较');
    expect(text).not.toMatch(/XRD|SEM\/TEM|炉温程序|热处理制度/);
    expect(result.writingPlan.agents.some((agent) => agent.role.includes('科技与社会'))).toBe(true);
  });
});
