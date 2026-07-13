"""论文草稿渲染器单元测试。

测试 src.agents.draft_renderer 的：
- _latex_escape：LaTeX 特殊字符转义
- render：多模板渲染（markdown/ctex/ieee/journal/unknown）
"""

from __future__ import annotations

from src.agents.draft_renderer import _latex_escape, render


# ============================================================================
# _latex_escape 测试
# ============================================================================


class TestLatexEscape:
    """_latex_escape：LaTeX 特殊字符转义。"""

    def test_backslash(self):
        assert _latex_escape("\\") == "\\textbackslash{}"

    def test_ampersand(self):
        assert _latex_escape("&") == "\\&"

    def test_percent(self):
        assert _latex_escape("%") == "\\%"

    def test_dollar(self):
        assert _latex_escape("$") == "\\$"

    def test_hash(self):
        assert _latex_escape("#") == "\\#"

    def test_underscore(self):
        assert _latex_escape("_") == "\\_"

    def test_braces(self):
        assert _latex_escape("{") == "\\{"
        assert _latex_escape("}") == "\\}"

    def test_empty_string(self):
        # 空字符串 → 空字符串
        assert _latex_escape("") == ""

    def test_none_returns_empty(self):
        # None → 空字符串（`if not text` 兜底）
        assert _latex_escape(None) == ""  # type: ignore[arg-type]

    def test_chinese_not_escaped(self):
        # 纯中文 → 不转义
        assert _latex_escape("自然语言") == "自然语言"

    def test_mixed_text(self):
        # 混合文本：中英文+特殊字符
        result = _latex_escape("a&b%c")
        assert result == "a\\&b\\%c"

    def test_tilde_and_caret(self):
        # ~ 和 ^ 也应被转义
        assert _latex_escape("~") == "\\textasciitilde{}"
        assert _latex_escape("^") == "\\textasciicircum{}"


# ============================================================================
# render 测试
# ============================================================================


def _sample_artifacts() -> dict:
    """构造含完整章节的 artifacts。"""
    return {
        "title": "Test Paper",
        "question": "How to improve accuracy?",
        "paper_sections": {
            "abstract": "Abstract content.",
            "intro": "Intro content.",
            "method": "Method content.",
            "results": "Results content.",
            "discussion": "Discussion content.",
            "conclusion": "Conclusion content.",
        },
        "literature": [
            {
                "title": "Ref Paper",
                "authors": ["Author A"],
                "year": 2024,
                "source": "arxiv",
                "doi": "10.1000/xyz",
            }
        ],
        "figures": [
            {"id": "fig_1", "type": "line", "caption": "Training curve", "data": {"x": [1, 2]}}
        ],
    }


class TestRender:
    """render：多模板渲染。"""

    def test_markdown_returns_nonempty(self):
        # markdown 模板返回非空字符串，含章节内容
        out = render(_sample_artifacts(), "markdown")
        assert isinstance(out, str)
        assert len(out) > 0
        assert "Test Paper" in out
        assert "Abstract content." in out
        assert "## 摘要" in out

    def test_ctex_returns_latex(self):
        # ctex 模板返回 LaTeX 格式（含 \documentclass）
        out = render(_sample_artifacts(), "ctex")
        assert "\\documentclass" in out
        assert "ctexart" in out
        assert "\\begin{document}" in out
        assert "Abstract content." in out

    def test_ieee_returns_latex(self):
        # ieee 模板返回 IEEE 格式
        out = render(_sample_artifacts(), "ieee")
        assert "\\documentclass" in out
        assert "IEEEtran" in out
        assert "Introduction" in out

    def test_journal_returns_markdown_like(self):
        # journal 模板返回期刊格式
        out = render(_sample_artifacts(), "journal")
        assert "Test Paper" in out
        assert "**摘要**" in out
        assert "Abstract content." in out

    def test_unknown_template_degrades_to_markdown(self):
        # 未知 template 降级为 markdown
        out = render(_sample_artifacts(), "unknown")
        assert "## 摘要" in out
        assert "Test Paper" in out

    def test_none_artifacts_does_not_raise(self):
        # render(None, "markdown") 不抛错
        out = render(None, "markdown")  # type: ignore[arg-type]
        assert isinstance(out, str)
        assert len(out) > 0

    def test_empty_artifacts_returns_placeholder(self):
        # render({}, "markdown") 返回占位文本
        out = render({}, "markdown")
        assert isinstance(out, str)
        # 应含"未命名"或"未生成"等占位文字
        assert "未命名" in out or "未生成" in out

    def test_artifacts_with_figures(self):
        # 含图表的 artifacts → 渲染含图表信息
        out = render(_sample_artifacts(), "markdown")
        # markdown 模板不直接渲染 figures，但 ctex/journal 会
        out_journal = render(_sample_artifacts(), "journal")
        assert "Training curve" in out_journal

    def test_artifacts_with_references(self):
        # 含参考文献 → 渲染含参考文献条目
        out = render(_sample_artifacts(), "markdown")
        assert "Ref Paper" in out
        assert "Author A" in out
        assert "10.1000/xyz" in out

    def test_template_case_insensitive(self):
        # template 大小写不敏感
        out_lower = render(_sample_artifacts(), "markdown")
        out_upper = render(_sample_artifacts(), "MARKDOWN")
        assert out_lower == out_upper

    def test_none_template_uses_markdown(self):
        # template=None → 用 markdown
        out = render(_sample_artifacts(), None)  # type: ignore[arg-type]
        assert "## 摘要" in out
