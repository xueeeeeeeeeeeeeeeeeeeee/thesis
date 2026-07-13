"""投稿 Agent（submit）。

调用 LLM（economical / V4 Flash）生成投稿包：
- 目标期刊/会议（target_venue）
- 投稿材料清单（checklist）
- Cover Letter 要点（cover_letter）
LLM 失败时降级为占位投稿包。
"""

from __future__ import annotations

from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_submission,
    safe_json_loads,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import SUBMIT_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.submit")


async def node(state: AgentState) -> dict[str, Any]:
    """投稿节点。"""
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")
    paper_sections = state.get("paper_sections", {}) or {}
    abstract = paper_sections.get("abstract", "") or ""

    prompt = SUBMIT_PROMPT.format(
        question=question,
        abstract=abstract,
        discipline=discipline,
    )
    raw = await llm_generate(prompt, tier="economical")

    # 解析 LLM JSON，失败回退到占位
    parsed = safe_json_loads(raw, default=None)
    if isinstance(parsed, dict) and (parsed.get("target_venue") or parsed.get("checklist")):
        submission: dict[str, Any] = {
            "target_venue": parsed.get("target_venue", []) or [],
            "checklist": parsed.get("checklist", []) or [],
            "cover_letter": parsed.get("cover_letter", "") or "",
            "targets": parsed.get("target_venue", []) or [],
            "materials": parsed.get("checklist", []) or [],
            "cover_letter_points": parsed.get("cover_letter", "") or "",
            "suggestion": raw,
        }
    else:
        submission = placeholder_submission(question)
        submission["suggestion"] = (
            raw
            if raw
            else "[占位投稿建议] 推荐 1-3 个目标期刊/会议；准备投稿材料清单；"
            "Cover Letter 要点。（未配置 LLM 或调用失败。）"
        )

    # 写 artifacts
    artifacts_payload = {
        "submission": submission,
        "target_count": len(submission.get("target_venue", []) or []),
    }

    return {
        "stage": Stage.SUBMIT,
        "submission": submission,
        "artifacts": merge_artifacts(state, "submission", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.SUBMIT.value,
                "action": "submit",
                "detail": "生成投稿包",
            },
        ),
        "errors": state.get("errors", []),
    }
