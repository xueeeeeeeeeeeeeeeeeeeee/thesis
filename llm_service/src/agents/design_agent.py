"""实验设计 Agent（design）。

基于文献生成实验方案：构造 DESIGN_PROMPT → 调 LLM (economical / V4 Flash) →
解析 JSON 拿到 hypothesis / variables / metrics / dataset / method_steps。
LLM 失败时降级为占位方案。
"""

from __future__ import annotations

import json
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_design,
    safe_json_loads,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import DESIGN_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.design")


async def node(state: AgentState) -> dict[str, Any]:
    """实验设计节点。"""
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")
    literature_summary = _summarize_literature(state.get("literature", []) or [])

    # 1. 调 LLM 生成方案
    prompt = DESIGN_PROMPT.format(
        question=question,
        discipline=discipline,
        literature_summary=literature_summary,
    )
    raw = await llm_generate(prompt, tier="economical")

    # 2. 解析 LLM JSON，失败回退到占位
    parsed = safe_json_loads(raw, default=None)
    if isinstance(parsed, dict) and parsed.get("hypothesis"):
        experiment_design: dict[str, Any] = {
            "hypothesis": parsed.get("hypothesis", ""),
            "variables": parsed.get("variables", {}) or {},
            "metrics": parsed.get("metrics", []) or [],
            "dataset": parsed.get("dataset", ""),
            "method_steps": parsed.get("method_steps", []) or [],
            "plan": raw,  # 保留原始文本，便于后续 review
        }
    else:
        experiment_design = placeholder_design(question)
        experiment_design["plan"] = (
            raw
            if raw
            else f"[占位实验方案] 针对问题「{question}」的简化实验设计。"
            "（未配置 LLM 或调用失败，已返回占位结果。）"
        )

    # 3. 写 artifacts
    artifacts_payload = {
        "design": experiment_design,
        "summary": experiment_design.get("plan", ""),
    }

    return {
        "stage": Stage.DESIGN,
        "experiment_design": experiment_design,
        "artifacts": merge_artifacts(state, "design", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.DESIGN.value,
                "action": "experiment_design",
                "detail": "生成实验方案",
                "summary": json.dumps(experiment_design, ensure_ascii=False)[:500],
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
