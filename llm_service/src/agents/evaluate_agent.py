"""结果评价 Agent（evaluate）。

调用 LLM（strong / V4 Pro）分析实验结果并输出结构化评价。
LLM 失败时降级为占位评价。
"""

from __future__ import annotations

import json
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_evaluation,
    safe_json_loads,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import EVALUATE_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.evaluate")


async def node(state: AgentState) -> dict[str, Any]:
    """结果评价节点。"""
    question = state.get("question", "") or ""
    experiment_design = state.get("experiment_design", {}) or {}
    experiment_results = state.get("experiment_results", {}) or {}

    # 1. 调 LLM 生成评价
    prompt = EVALUATE_PROMPT.format(
        question=question,
        experiment_design=json.dumps(experiment_design, ensure_ascii=False),
        experiment_results=json.dumps(experiment_results, ensure_ascii=False),
    )
    raw = await llm_generate(prompt, tier="strong")

    # 2. 解析 LLM JSON，失败回退到占位
    parsed = safe_json_loads(raw, default=None)
    if isinstance(parsed, dict) and (parsed.get("summary") or parsed.get("table")):
        evaluation: dict[str, Any] = {
            "summary": parsed.get("summary", ""),
            "table": parsed.get("table", []) or [],
            "comparison": parsed.get("comparison", []) or [],
            "limitations": parsed.get("limitations", []) or [],
            "improvements": parsed.get("improvements", []) or [],
            "validity": parsed.get("summary", ""),
            "robustness": "",
            "report": raw,
        }
    else:
        evaluation = placeholder_evaluation()
        evaluation["report"] = (
            raw
            if raw
            else "[占位评价] 实验结果评价为占位结论。"
            "（未配置 LLM 或调用失败，已返回占位结果。）"
        )

    # 3. 写 artifacts
    artifacts_payload = {
        "evaluation": evaluation,
        "summary": evaluation.get("summary", ""),
    }

    return {
        "stage": Stage.EVALUATE,
        "evaluation": evaluation,
        "artifacts": merge_artifacts(state, "evaluation", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.EVALUATE.value,
                "action": "evaluate",
                "detail": "生成结果评价",
                "summary": evaluation.get("summary", "")[:500],
            },
        ),
        "errors": state.get("errors", []),
    }
