"""画图 Agent（figure）。

调用 LLM（economical / V4 Flash）生成图表清单（规格 + 数据 + 示例代码）。
LLM 失败时使用占位图表。
"""

from __future__ import annotations

import json
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_figures,
    safe_json_loads,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import FIGURE_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.figure")


async def node(state: AgentState) -> dict[str, Any]:
    """图表生成节点。"""
    question = state.get("question", "") or ""
    experiment_results = state.get("experiment_results", {}) or {}

    figure_request = "根据实验结果生成 3-5 张关键图表（折线 / 柱状 / 散点 / 表格）"
    prompt = FIGURE_PROMPT.format(
        question=question,
        experiment_results=json.dumps(experiment_results, ensure_ascii=False),
        figure_request=figure_request,
    )
    raw = await llm_generate(prompt, tier="economical")

    # 解析 LLM JSON，失败回退到占位
    parsed = safe_json_loads(raw, default=None)
    if isinstance(parsed, list) and parsed:
        figures: list[dict[str, Any]] = []
        for i, item in enumerate(parsed, 1):
            if not isinstance(item, dict):
                continue
            figures.append(
                {
                    "id": item.get("id", f"fig_{i}"),
                    "type": item.get("type", "line"),
                    "caption": item.get("caption", ""),
                    "data": item.get("data", {}) or {},
                    "code": item.get("code", ""),
                    "spec": raw,
                }
            )
        if not figures:
            figures = placeholder_figures()
    else:
        figures = placeholder_figures()
        # 保留原始 spec 字段
        if raw:
            for f in figures:
                f["spec"] = raw
        else:
            for f in figures:
                f["spec"] = "[占位图表规格] 实际绘图由外部代码执行。"

    # 写 artifacts
    artifacts_payload = {
        "figures": figures,
        "count": len(figures),
    }

    return {
        "stage": Stage.FIGURE,
        "figures": figures,
        "artifacts": merge_artifacts(state, "figures", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.FIGURE.value,
                "action": "figure",
                "detail": f"生成 {len(figures)} 张图表规格",
            },
        ),
        "errors": state.get("errors", []),
    }
