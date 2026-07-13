"""论文写作 Agent（write）。

按章节生成论文 6 大块（abstract / intro / method / results / discussion / conclusion）。
- 章节用 strong tier（V4 Pro）以保证质量
- 失败时回退为占位 6 章节
- 写入 state["paper_sections"] + state["artifacts"]["paper_sections"]
"""

from __future__ import annotations

import json
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_paper_sections,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import PAPER_SECTIONS, WRITE_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.write")


async def node(state: AgentState) -> dict[str, Any]:
    """论文写作节点：分章节生成。"""
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")
    literature_summary = _summarize_literature(state.get("literature", []) or [])
    experiment_design = state.get("experiment_design", {}) or {}
    experiment_results = state.get("experiment_results", {}) or {}
    evaluation_summary = (state.get("evaluation", {}) or {}).get("summary", "") or ""

    # 1. 逐章节生成
    paper_sections: dict[str, Any] = {}
    for section_key, section_desc in PAPER_SECTIONS.items():
        prompt = WRITE_PROMPT.format(
            question=question,
            discipline=discipline,
            literature_summary=literature_summary,
            experiment_design=json.dumps(experiment_design, ensure_ascii=False),
            experiment_results=json.dumps(experiment_results, ensure_ascii=False),
            evaluation_summary=evaluation_summary,
            section=section_desc,
        )
        # 摘要、引言用 strong，章节太长用 long_text 更稳；此处统一 strong
        text = await llm_generate(prompt, tier="strong")
        if not text:
            text = (
                f"[占位·{section_key}] 论文 {section_desc} 为占位内容。"
                "（未配置 LLM 或调用失败。）"
            )
        paper_sections[section_key] = text

    # 2. 至少保留 6 个占位键
    if len(paper_sections) < 6:
        placeholder = placeholder_paper_sections(question)
        for k, v in placeholder.items():
            paper_sections.setdefault(k, v)

    # 3. 写 artifacts
    artifacts_payload = {
        "paper_sections": paper_sections,
        "section_count": len(paper_sections),
    }

    return {
        "stage": Stage.WRITE,
        "paper_sections": paper_sections,
        "artifacts": merge_artifacts(state, "paper_sections", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.WRITE.value,
                "action": "paper_write",
                "detail": f"生成 {len(paper_sections)} 个章节",
            },
        ),
        "errors": state.get("errors", []),
    }


def _summarize_literature(literature: list[dict[str, Any]]) -> str:
    """把文献列表格式化为 LLM 上下文。"""
    if not literature:
        return "（暂无文献）"
    lines: list[str] = []
    for item in literature[:8]:
        title = item.get("title", "")
        year = item.get("year") or "n.d."
        lines.append(f"- [{item.get('source')}] {title} ({year})")
    return "\n".join(lines)
