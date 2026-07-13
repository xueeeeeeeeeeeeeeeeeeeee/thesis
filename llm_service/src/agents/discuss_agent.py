"""讨论 Agent（discuss）。

调用 LLM（strong / V4 Pro）撰写论文讨论部分。
LLM 失败时降级为占位讨论。
"""

from __future__ import annotations

import json
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_discussion,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import DISCUSS_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.discuss")


async def node(state: AgentState) -> dict[str, Any]:
    """讨论生成节点。"""
    question = state.get("question", "") or ""
    experiment_results = state.get("experiment_results", {}) or {}
    evaluation = state.get("evaluation", {}) or {}
    evaluation_summary = evaluation.get("summary", "") or evaluation.get("report", "") or ""

    # 1. 调 LLM 生成讨论
    prompt = DISCUSS_PROMPT.format(
        question=question,
        experiment_results=json.dumps(experiment_results, ensure_ascii=False),
        evaluation_summary=evaluation_summary,
    )
    discussion = await llm_generate(prompt, tier="strong")

    # 2. 失败时回退到占位
    if not discussion:
        discussion = placeholder_discussion(question)

    # 3. 写 artifacts
    artifacts_payload = {
        "discussion": discussion,
        "summary": discussion[:300],
    }

    return {
        "stage": Stage.DISCUSS,
        "discussion": discussion,
        "artifacts": merge_artifacts(state, "discussion", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.DISCUSS.value,
                "action": "discuss",
                "detail": "生成讨论",
                "summary": discussion[:500],
            },
        ),
        "errors": state.get("errors", []),
    }
