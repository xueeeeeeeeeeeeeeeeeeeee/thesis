"""论文草稿渲染器。

将流水线产生的 artifacts 渲染为不同格式的论文草稿文本：
- ctex      中文双栏论文（ctexart 风格）
- ieee      英文双栏会议（IEEE conference 风格）
- journal   中文期刊
- markdown  通用 Markdown

不依赖任何外部库，纯字符串模板，方便在任何环境运行。
LLM 失败时也能正常渲染（只是内容是占位文字）。
"""

from __future__ import annotations

from typing import Any


# ============================================================================
# 工具函数
# ============================================================================


def _safe(value: Any, default: str = "（未生成）") -> str:
    """安全获取文本字段，None / 空 字符串 / 空 dict 都降级为占位。"""
    if value is None:
        return default
    if isinstance(value, str):
        return value if value.strip() else default
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)


def _section(sections: dict[str, Any], key: str, default: str = "（未生成）") -> str:
    """从 paper_sections 中取某章节文本。"""
    if not sections:
        return default
    return _safe(sections.get(key), default)


def _format_refs(literature: list[dict]) -> str:
    """把文献列表格式化为学术参考文献条目（GB/T 7714 风格简化版）。"""
    if not literature:
        return "（暂无参考文献）"
    lines: list[str] = []
    for i, lit in enumerate(literature, 1):
        title = _safe(lit.get("title"), "[无题名]")
        authors = lit.get("authors") or []
        # 作者格式：最多 3 名，超过用"等"
        if authors:
            if len(authors) <= 3:
                author_str = ", ".join(authors)
            else:
                author_str = ", ".join(authors[:3]) + ", 等"
        else:
            author_str = "佚名"
        year = lit.get("year") or "n.d."
        doi = lit.get("doi")
        url = lit.get("url")
        source = lit.get("source") or ""
        # 构建引用尾部
        tail_parts: list[str] = []
        if doi:
            tail_parts.append(f"DOI: {doi}")
        elif url:
            tail_parts.append(f"URL: {url}")
        # 标注来源类型（非用户上传的才标注检索来源）
        source_tag = ""
        if source and source not in ("unknown", "placeholder", "user_upload", "llm"):
            source_tag = f" [{source}]"
        elif source == "user_upload":
            source_tag = " [用户上传]"
        tail = ", ".join(tail_parts)
        tail_str = f". {tail}" if tail else ""
        lines.append(f"[{i}] {author_str}. {title}[{year}]{source_tag}{tail_str}")
    return "\n".join(lines)


def _format_figure(fig: dict[str, Any], idx: int) -> str:
    """把单个图表规格格式化为可读段落。"""
    fid = _safe(fig.get("id"), f"fig_{idx}")
    ftype = _safe(fig.get("type"), "未指定")
    caption = _safe(fig.get("caption"), "（无说明）")
    data = fig.get("data")
    data_str = "" if data is None else f"  - 数据：{data}"
    code = fig.get("code")
    code_str = "" if not code else f"\n  - 示例代码：\n```python\n{code}\n```"
    return (
        f"图 {idx}（{fid}）\n"
        f"  - 类型：{ftype}\n"
        f"  - 说明：{caption}{data_str}{code_str}"
    )


def _format_figures(figures: list[dict]) -> str:
    if not figures:
        return "（暂无图表）"
    return "\n\n".join(_format_figure(f, i) for i, f in enumerate(figures, 1))


# ============================================================================
# 模板渲染器
# ============================================================================


def render_markdown(artifacts: dict[str, Any]) -> str:
    """通用 Markdown 模板。"""
    title = _safe(artifacts.get("title") or artifacts.get("question"), "未命名论文")
    sections = artifacts.get("paper_sections") or {}
    literature = artifacts.get("literature") or []
    return (
        f"# {title}\n\n"
        f"## 摘要\n{_section(sections, 'abstract')}\n\n"
        f"## 1 引言\n{_section(sections, 'intro', '（未生成）')}\n\n"
        f"## 2 方法\n{_section(sections, 'method')}\n\n"
        f"## 3 结果\n{_section(sections, 'results')}\n\n"
        f"## 4 讨论\n{_section(sections, 'discussion')}\n\n"
        f"## 5 结论\n{_section(sections, 'conclusion')}\n\n"
        f"## 参考文献\n{_format_refs(literature)}\n"
    )


def render_ctex(artifacts: dict[str, Any]) -> str:
    """中文双栏论文（ctexart 风格）。"""
    title = _safe(artifacts.get("title") or artifacts.get("question"), "未命名论文")
    sections = artifacts.get("paper_sections") or {}
    literature = artifacts.get("literature") or []
    figures = artifacts.get("figures") or []
    return (
        r"\documentclass[twocolumn]{ctexart}" + "\n"
        r"\usepackage{graphicx}" + "\n"
        r"\usepackage{amsmath}" + "\n"
        r"\usepackage{cite}" + "\n"
        r"\title{" + _latex_escape(title) + r"}" + "\n"
        r"\author{RAP Agent}" + "\n"
        r"\date{\today}" + "\n"
        r"\begin{document}" + "\n"
        r"\twocolumn[" + "\n"
        r"  \begin{@twocolumnfalse}" + "\n"
        r"    \maketitle" + "\n"
        r"    \begin{abstract}" + "\n"
        f"    {_latex_escape(_section(sections, 'abstract'))}\n"
        r"    \end{abstract}" + "\n"
        r"  \end{@twocolumnfalse}" + "\n"
        r"]" + "\n"
        r"\section{引言}" + f"\n{_latex_escape(_section(sections, 'intro'))}\n\n"
        r"\section{方法}" + f"\n{_latex_escape(_section(sections, 'method'))}\n\n"
        r"\section{结果}" + f"\n{_latex_escape(_section(sections, 'results'))}\n\n"
        r"\section{讨论}" + f"\n{_latex_escape(_section(sections, 'discussion'))}\n\n"
        r"\section{结论}" + f"\n{_latex_escape(_section(sections, 'conclusion'))}\n\n"
        r"\section{图表清单}" + f"\n{_latex_escape(_format_figures(figures))}\n\n"
        r"\section{参考文献}" + f"\n{_latex_escape(_format_refs(literature))}\n\n"
        r"\end{document}" + "\n"
    )


def render_ieee(artifacts: dict[str, Any]) -> str:
    """英文双栏会议（IEEE conference 风格）。"""
    title = _safe(artifacts.get("title") or artifacts.get("question"), "Untitled Paper")
    sections = artifacts.get("paper_sections") or {}
    literature = artifacts.get("literature") or []
    return (
        r"\documentclass[conference]{IEEEtran}" + "\n"
        r"\usepackage{cite}" + "\n"
        r"\usepackage{amsmath,amssymb,amsfonts}" + "\n"
        r"\usepackage{graphicx}" + "\n"
        r"\title{" + _latex_escape(title) + r"}" + "\n"
        r"\author{\IEEEauthorblockN{RAP Agent}" + "\n"
        r"\IEEEauthorblockA{Research Automation Pipeline}}" + "\n"
        r"\begin{document}" + "\n"
        r"\maketitle" + "\n"
        r"\begin{abstract}" + f"\n{_latex_escape(_section(sections, 'abstract'))}\n"
        r"\end{abstract}" + "\n\n"
        r"\section{Introduction}" + f"\n{_latex_escape(_section(sections, 'intro'))}\n\n"
        r"\section{Methodology}" + f"\n{_latex_escape(_section(sections, 'method'))}\n\n"
        r"\section{Results}" + f"\n{_latex_escape(_section(sections, 'results'))}\n\n"
        r"\section{Discussion}" + f"\n{_latex_escape(_section(sections, 'discussion'))}\n\n"
        r"\section{Conclusion}" + f"\n{_latex_escape(_section(sections, 'conclusion'))}\n\n"
        r"\section*{References}" + f"\n{_latex_escape(_format_refs(literature))}\n\n"
        r"\end{document}" + "\n"
    )


def render_journal(artifacts: dict[str, Any]) -> str:
    """中文期刊模板。"""
    title = _safe(artifacts.get("title") or artifacts.get("question"), "未命名论文")
    sections = artifacts.get("paper_sections") or {}
    literature = artifacts.get("literature") or []
    figures = artifacts.get("figures") or []
    return (
        f"# {title}\n\n"
        f"**摘要**：{_section(sections, 'abstract')}\n\n"
        f"**关键词**：{_safe(artifacts.get('keywords'), '科研自动化；论文生成；LLM')}\n\n"
        f"---\n\n"
        f"## 1 引言\n\n{_section(sections, 'intro')}\n\n"
        f"## 2 研究方法\n\n{_section(sections, 'method')}\n\n"
        f"## 3 研究结果\n\n{_section(sections, 'results')}\n\n"
        f"## 4 讨论\n\n{_section(sections, 'discussion')}\n\n"
        f"## 5 结论\n\n{_section(sections, 'conclusion')}\n\n"
        f"## 图表\n\n{_format_figures(figures)}\n\n"
        f"## 参考文献\n\n{_format_refs(literature)}\n"
    )


# ============================================================================
# 主入口
# ============================================================================


_RENDERERS = {
    "ctex": render_ctex,
    "ieee": render_ieee,
    "journal": render_journal,
    "markdown": render_markdown,
}


def render(artifacts: dict[str, Any], template: str = "markdown") -> str:
    """根据 template 渲染 artifacts 为对应格式的论文草稿。

    未知 template 自动降级为 markdown。LLM 未配置或 artifacts 字段缺失时，
    仍会返回包含占位文字的完整草稿，不会抛错。
    """
    template = (template or "markdown").lower()
    renderer = _RENDERERS.get(template, render_markdown)
    try:
        return renderer(artifacts or {})
    except Exception:  # noqa: BLE001 - 渲染层兜底，避免任何异常打断流水线
        # 极端情况下（如 artifacts 数据类型严重异常），降级为 markdown
        return render_markdown(_coerce_safe(artifacts or {}))


def _coerce_safe(artifacts: dict[str, Any]) -> dict[str, Any]:
    """把 artifacts 中的所有关键字段强制转为安全类型，避免渲染时异常。"""
    safe: dict[str, Any] = {}
    for k, v in artifacts.items():
        if isinstance(v, (str, int, float, bool)):
            safe[k] = v
        elif isinstance(v, list):
            safe[k] = v  # 列表内部由 _format_* 自行处理
        elif isinstance(v, dict):
            safe[k] = v
        else:
            safe[k] = str(v) if v is not None else ""
    return safe


def _latex_escape(text: str) -> str:
    """简单 LaTeX 字符转义，避免特殊字符破坏编译。"""
    if not text:
        return ""
    # 只做最常见且安全的转义；不去除中文
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    out = []
    for ch in text:
        out.append(replacements.get(ch, ch))
    return "".join(out)
