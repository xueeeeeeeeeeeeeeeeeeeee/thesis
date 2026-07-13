"""实验执行 Agent（experiment）。

支持两种数据来源：
1. **用户输入**（推荐）：用户通过 HIL edit 注入 `experiment_results`（含
   `source="user"` 标记），节点直接采用，跳过 LLM 调用。
2. **LLM 模拟**（回退）：auto 模式或用户未填时，调 LLM 生成伪代码 + 日志
   + 指标。LLM 失败则用占位结果。

用户输入 schema 见后端 `ExperimentInput`：
    {source, methodology, materials, procedure, metrics[], resultsDescription,
     rawLogs?, notes?}
"""

from __future__ import annotations

import json
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_experiment,
    safe_json_loads,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import EXPERIMENT_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.experiment")


def _is_user_inputed(results: Any) -> bool:
    """判断 experiment_results 是否由用户通过 HIL 注入。"""
    if not isinstance(results, dict):
        return False
    if results.get("source") == "user":
        return True
    # 兼容：无 source 但有 methodology 字段也视为用户输入
    methodology = results.get("methodology")
    if isinstance(methodology, str) and methodology.strip():
        return True
    return False


async def node(state: AgentState) -> dict[str, Any]:
    """实验执行节点。

    优先采用用户通过 HIL 注入的 experiment_results；
    否则回退到 LLM 模拟（auto 模式或用户未填）。
    """
    question = state.get("question", "") or ""
    experiment_design = state.get("experiment_design", {}) or {}
    existing_results = state.get("experiment_results", {}) or {}

    # 1. 用户输入优先：HIL edit 已把 experiment_results 写入 state
    if _is_user_inputed(existing_results):
        logger.info("采用用户输入的实验结果，跳过 LLM 调用")
        experiment_results: dict[str, Any] = dict(existing_results)
        experiment_results["status"] = "completed"
        experiment_results["source"] = "user"
        experiment_results.setdefault("question", question)

        artifacts_payload = {
            "experiment": experiment_results,
            "metrics": experiment_results.get("metrics", []) or [],
        }
        return {
            "stage": Stage.EXPERIMENT,
            "experiment_results": experiment_results,
            "artifacts": merge_artifacts(state, "experiment", artifacts_payload),
            "history": append_history(
                state,
                {
                    "stage": Stage.EXPERIMENT.value,
                    "action": "experiment_user_input",
                    "detail": "用户输入实验结果",
                    "summary": _summarize_user_metrics(experiment_results),
                },
            ),
            "errors": state.get("errors", []),
        }

    # 2. 回退：LLM 模拟（auto 模式或用户未填）
    dataset_hint = experiment_design.get("dataset", "（无）") or "（无）"
    prompt = EXPERIMENT_PROMPT.format(
        question=question,
        experiment_design=json.dumps(experiment_design, ensure_ascii=False),
        dataset_hint=dataset_hint,
    )
    raw = await llm_generate(prompt, tier="economical")

    parsed = safe_json_loads(raw, default=None)
    if isinstance(parsed, dict) and parsed.get("code"):
        experiment_results = {
            "code": parsed.get("code", ""),
            "logs": parsed.get("logs", []) or [],
            "metrics": parsed.get("metrics", {}) or {},
            "status": "completed",
            "source": "agent",
            "raw": raw,
            "question": question,
        }
    else:
        experiment_results = placeholder_experiment()
        experiment_results["status"] = "placeholder"
        experiment_results["source"] = "agent"
        experiment_results["raw"] = raw
        experiment_results["question"] = question

    artifacts_payload = {
        "experiment": experiment_results,
        "metrics": experiment_results.get("metrics", {}) or {},
    }

    return {
        "stage": Stage.EXPERIMENT,
        "experiment_results": experiment_results,
        "artifacts": merge_artifacts(state, "experiment", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.EXPERIMENT.value,
                "action": "experiment_run",
                "detail": "实验执行（LLM 模拟）",
                "summary": json.dumps(experiment_results.get("metrics", {}), ensure_ascii=False),
            },
        ),
        "errors": state.get("errors", []),
    }


def _summarize_user_metrics(results: dict[str, Any]) -> str:
    """把用户输入的 metrics 列表摘要成可读字符串，供 history 记录。"""
    metrics = results.get("metrics") or []
    if not isinstance(metrics, list) or not metrics:
        return "用户输入实验结果（无结构化指标）"
    parts: list[str] = []
    for m in metrics:
        if not isinstance(m, dict):
            continue
        name = m.get("name", "?")
        value = m.get("value", "?")
        unit = m.get("unit", "")
        parts.append(f"{name}={value}{unit}" if unit else f"{name}={value}")
    return "用户输入指标：" + ", ".join(parts) if parts else "用户输入实验结果"
