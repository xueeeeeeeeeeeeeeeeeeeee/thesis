import { describe, it, expect } from 'vitest';
import {
  renderDraft,
  listTemplates,
  templateExtension,
  templateMime,
} from './draftRenderer';
import type { ProjectArtifacts } from '../types';

// 初稿渲染服务测试
describe('services/draftRenderer', () => {
  describe('listTemplates', () => {
    it('返回全部支持的模板列表', () => {
      // 验证白名单完整且顺序正确
      expect(listTemplates()).toEqual(['ctex', 'ieee', 'journal', 'markdown']);
    });

    it('返回数组副本（修改不影响内部白名单）', () => {
      // 防御性测试：返回值不应是内部引用
      const list = listTemplates();
      list.push('markdown' as never);
      expect(listTemplates()).toEqual(['ctex', 'ieee', 'journal', 'markdown']);
    });
  });

  describe('templateExtension', () => {
    it('ctex/ieee/journal 返回 tex', () => {
      // LaTeX 类模板下载扩展名为 .tex
      expect(templateExtension('ctex')).toBe('tex');
      expect(templateExtension('ieee')).toBe('tex');
      expect(templateExtension('journal')).toBe('tex');
    });

    it('markdown 返回 md', () => {
      // Markdown 模板下载扩展名为 .md
      expect(templateExtension('markdown')).toBe('md');
    });

    it('未知模板返回 txt', () => {
      // 兜底扩展名为 .txt
      expect(templateExtension('unknown' as never)).toBe('txt');
    });
  });

  describe('templateMime', () => {
    it('ctex/ieee/journal 返回 application/x-tex', () => {
      // LaTeX 类 MIME
      expect(templateMime('ctex')).toBe('application/x-tex');
      expect(templateMime('ieee')).toBe('application/x-tex');
      expect(templateMime('journal')).toBe('application/x-tex');
    });

    it('markdown 返回 text/markdown', () => {
      // Markdown MIME
      expect(templateMime('markdown')).toBe('text/markdown');
    });

    it('未知模板返回 text/plain', () => {
      // 兜底 MIME
      expect(templateMime('unknown' as never)).toBe('text/plain');
    });
  });

  describe('renderDraft', () => {
    // 完整 artifacts：含 paper_sections / figures / literature
    const fullArtifacts: ProjectArtifacts = {
      paperSections: {
        abstract: '这是一段摘要',
        introduction: '引言内容',
        method: '方法描述',
        results: '实验结果',
        discussion: '讨论内容',
        conclusion: '结论',
        customSection: '自定义章节',
      },
      figures: [
        { title: '图一', caption: '示意图说明' },
        { title: '图二', caption: '数据可视化' },
      ],
      literature: {
        references: ['Author, Title, 2023', 'Another, Paper, 2024'],
      },
      draftText: '已有初稿',
    };

    const meta = {
      projectName: '新型实验研究',
      discipline: '计算机科学',
      question: '如何提升模型表现？',
    };

    it('返回 { text, template } 结构', () => {
      // 验证返回值结构
      const result = renderDraft(fullArtifacts, 'markdown', meta);
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('template');
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    });

    it.each(['ctex', 'ieee', 'journal', 'markdown'] as const)(
      '模板 %s 渲染不抛错',
      (template) => {
        // 4 种模板各自渲染
        expect(() => renderDraft(fullArtifacts, template, meta)).not.toThrow();
        const result = renderDraft(fullArtifacts, template, meta);
        expect(result.template).toBe(template);
      },
    );

    it('未知模板降级为 markdown', () => {
      // 非白名单模板应降级
      const result = renderDraft(fullArtifacts, 'unknown' as never, meta);
      expect(result.template).toBe('markdown');
    });

    it('markdown 模板应包含标题/学科/章节/图/参考文献', () => {
      // 验证 Markdown 模板渲染的关键内容
      const result = renderDraft(fullArtifacts, 'markdown', meta);
      expect(result.text).toContain('# 新型实验研究');
      expect(result.text).toContain('> 学科: 计算机科学');
      expect(result.text).toContain('## 摘要');
      expect(result.text).toContain('这是一段摘要');
      expect(result.text).toContain('## 引言');
      expect(result.text).toContain('引言内容');
      expect(result.text).toContain('### 图 1');
      expect(result.text).toContain('图一');
      expect(result.text).toContain('## 参考文献');
      expect(result.text).toContain('Author, Title, 2023');
    });

    it('LaTeX 模板应包含 documentclass 与 bibitem', () => {
      // 验证 ctex 模板的 LaTeX 关键字
      const result = renderDraft(fullArtifacts, 'ctex', meta);
      expect(result.text).toContain('\\documentclass');
      expect(result.text).toContain('\\begin{document}');
      expect(result.text).toContain('\\end{document}');
      expect(result.text).toContain('\\bibitem');
    });

    it('空 artifacts 不抛错', () => {
      // 完全空的产物
      const result = renderDraft({}, 'markdown', meta);
      expect(result.template).toBe('markdown');
      expect(result.text.length).toBeGreaterThan(0);
      // 空章节应有占位符
      expect(result.text).toContain('（待生成）');
    });

    it('部分字段缺失不抛错', () => {
      // 仅 paperSections，无 figures / literature
      const artifacts: ProjectArtifacts = {
        paperSections: { abstract: '仅有摘要' },
      };
      const result = renderDraft(artifacts, 'ctex', meta);
      expect(result.template).toBe('ctex');
      expect(result.text).toContain('仅有摘要');
    });

    it('自定义章节 key 不在模板占位符中时不被渲染（实现：仅替换预定义占位符）', () => {
      // pickSections 会收集自定义 key，但模板只有 <ABSTRACT>/<INTRODUCTION> 等预定义占位符
      // 因此 'appendix' 内容不会出现在输出中
      const artifacts: ProjectArtifacts = {
        paperSections: {
          appendix: '附录内容',
          abstract: '摘要',
        },
      };
      const result = renderDraft(artifacts, 'markdown', meta);
      expect(result.text).toContain('摘要'); // 预定义 abstract 被渲染
      expect(result.text).not.toContain('附录内容'); // 自定义 appendix 无占位符，不渲染
    });

    it('figures 元素非对象时使用默认标题', () => {
      // 验证 pickFigures 对非对象元素的兜底
      const artifacts: ProjectArtifacts = {
        figures: [null as never, { title: '图二' }],
      };
      const result = renderDraft(artifacts, 'markdown', meta);
      expect(result.text).toContain('### 图 1');
      expect(result.text).toContain('### 图 2');
    });

    it('literature.refs 也被识别为参考文献', () => {
      // 验证 pickReferences 兼容 refs 字段
      const artifacts: ProjectArtifacts = {
        literature: { refs: ['ref1', 'ref2'] },
      };
      const result = renderDraft(artifacts, 'markdown', meta);
      expect(result.text).toContain('ref1');
      expect(result.text).toContain('ref2');
    });

    it('meta.projectName 缺失时退回 question，再退回"未命名研究"', () => {
      // 验证标题兜底逻辑
      const r1 = renderDraft({}, 'markdown', {
        projectName: '',
        discipline: '',
        question: '问题内容',
      });
      expect(r1.text).toContain('# 问题内容');
      const r2 = renderDraft({}, 'markdown', {
        projectName: '',
        discipline: '',
        question: '',
      });
      expect(r2.text).toContain('# 未命名研究');
    });

    it('特殊字符在 LaTeX 模板中被转义', () => {
      // 验证 escapeTemplate 的转义逻辑（间接测试）
      const result = renderDraft(
        {},
        'ctex',
        { projectName: 'a&b%c$d#e_f{g}h', discipline: 'x', question: '' },
      );
      // 转义后 & 变成 \&
      expect(result.text).toContain('\\&');
      expect(result.text).toContain('\\%');
      expect(result.text).toContain('\\$');
      expect(result.text).toContain('\\#');
      expect(result.text).toContain('\\_');
      expect(result.text).toContain('\\{');
      expect(result.text).toContain('\\}');
    });

    it('异常情况降级为 markdown（escapeTemplate 抛错触发 catch）', () => {
      // 构造一个 replace 方法抛错的对象作为 projectName
      // escapeTemplate 调用 input.replace(...) 时抛错 → 进入 catch
      // renderMarkdownFallback 不调用 escapeTemplate，用 toString 拼接，能正常完成
      const poisonTitle = {
        replace: () => {
          throw new Error('poison replace');
        },
        toString: () => '降级标题',
      };
      const result = renderDraft(
        {} as ProjectArtifacts,
        'ctex',
        { projectName: poisonTitle as never, discipline: 'x', question: '' },
      );
      expect(result.template).toBe('markdown');
      expect(result.text).toContain('降级标题');
    });
  });
});
