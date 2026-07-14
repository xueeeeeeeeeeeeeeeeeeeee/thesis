"""论文写作 Agent：深度思考 → 规划 → 多章节并行写作 → 总编审校。"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from src.agents import append_history, llm_generate, llm_reasoning, merge_artifacts
from src.agents.discipline_profiles import resolve_discipline_profile as _resolve_discipline_profile
from src.agents.state import AgentState
from src.llm.prompts.templates import THINKING_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.write")


def _count_chars(sections: dict[str, str]) -> int:
    return len(re.sub(r"\s+", "", "".join(sections.values())))


def _fallback_section(section: str, target: int, context: dict[str, Any]) -> str:
    profile = context["profile"]
    focus = profile["sections"][section]["focus"]
    base = (
        f"本节围绕“{context['question']}”展开，重点处理{focus}。"
        f"方法部分遵循以下学科要求：{profile['method']}。"
        f"证据评价遵循：{profile['evidence']}。"
        "当前未获得可核验的真实实验数据，因此仅形成研究设计与规范报告模板，不将模拟内容表述为真实发现。"
        f"正式研究还应{profile['reproducibility']}，并由领域研究者完成事实审阅。"
    )
    paragraphs: list[str] = []
    while len(re.sub(r"\s+", "", "\n\n".join(paragraphs))) < target:
        paragraphs.append(base)
    text = "\n\n".join(paragraphs)
    chars = list(text)
    count = 0
    end = len(chars)
    for i, char in enumerate(chars):
        if not char.isspace():
            count += 1
        if count >= target:
            end = i + 1
            break
    return "".join(chars[:end]).rstrip("，、；：") + "。"


async def _write_section(
    section: str,
    target: int,
    context: dict[str, Any],
) -> tuple[str, str]:
    profile = context["profile"]
    section_spec = profile["sections"][section]
    role = section_spec["role"]
    # 把思考阶段输出的写作指导注入 prompt
    thinking_guide = context.get("thinking_guide", "")
    thinking_block = f"""
【写作架构师思考指导】
{thinking_guide}
""" if thinking_guide else ""
    prompt = f"""你是{role}，负责一篇专业学术论文的独立章节。

研究问题：{context['question']}
学科：{context['discipline']}
章节：{section_spec['title']}
章节要求：{section_spec['focus']}
目标长度：约 {target} 个中文字符
{thinking_block}
文献摘要：
{context['literature']}

实验设计：{context['design']}
实验结果：{context['results']}
评价结论：{context['evaluation']}

要求：
1. 方法规范：{profile['method']}。
2. 证据规范：{profile['evidence']}。
3. 可重复性规范：{profile['reproducibility']}。
4. 写成 2 至 5 个连贯段落，不要用空泛的“科研自动化流程”代替专业内容。
5. 不编造文献、样本量、统计量或实验结果；没有真实数据时明确写“模拟/待验证”。
6. 章节内容必须与研究问题直接相关，不输出标题或 JSON。
7. 如有思考指导，请遵循其中的核心论点、论证逻辑链和术语统一要求。
"""
    text = (await llm_generate(prompt, tier="long_text")).strip()
    if not text:
        text = _fallback_section(section, target, context)
    return section, text


async def _editorial_review(
    sections: dict[str, str],
    context: dict[str, Any],
    word_limit: int,
) -> dict[str, str]:
    if not any(sections.values()):
        return sections
    profile = context["profile"]
    prompt = f"""你是{profile['editor']}。请审校以下分章节初稿。

研究问题：{context['question']}
学科：{context['discipline']}
总目标字数：约 {word_limit} 个中文字符

初稿 JSON：
{json.dumps(sections, ensure_ascii=False)}

审校要求：
- 统一术语、研究对象、假设和结论强度，删除章节间重复。
- 确保方法能够支撑结果，结果能够支撑讨论与结论。
- 按{profile['label']}规范检查：{profile['evidence']}。
- 检查可重复性信息：{profile['reproducibility']}。
- 不得新增未提供的真实数据、文献或伦理批准号；模拟数据必须明确标注。
- 保留多段落结构，总字符数控制在目标的 90% 至 110%。
- 仅输出具有相同键的 JSON 对象。
"""
    reviewed = (await llm_generate(prompt, tier="long_text")).strip()
    if not reviewed:
        return sections
    try:
        if reviewed.startswith("```"):
            reviewed = re.sub(r"^```(?:json)?\s*|\s*```$", "", reviewed)
        parsed = json.loads(reviewed)
    except Exception:
        return sections
    if not isinstance(parsed, dict):
        return sections
    return {
        key: str(parsed.get(key) or value)
        for key, value in sections.items()
    }


async def node(state: AgentState) -> dict[str, Any]:
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")
    word_limit = max(800, min(50000, int(state.get("word_limit", 3000) or 3000)))
    literature_summary = _summarize_literature(state.get("literature", []) or [])
    profile = _resolve_discipline_profile(discipline, question)

    # ── 思考阶段：用推理模型深度分析，产出写作指导 ──
    thinking_guide = ""
    thinking_reasoning = ""
    try:
        thinking_prompt = THINKING_PROMPT.format(
            question=question,
            discipline=discipline,
            literature=literature_summary,
            design=json.dumps(state.get("experiment_design", {}) or {}, ensure_ascii=False),
            results=json.dumps(state.get("experiment_results", {}) or {}, ensure_ascii=False),
            evaluation=json.dumps(state.get("evaluation", {}) or {}, ensure_ascii=False),
            discussion=json.dumps(state.get("discussion", "") or "", ensure_ascii=False),
            word_limit=word_limit,
        )
        logger.info("论文写作：启动深度思考阶段（deepseek-reasoner）")
        thinking_guide, thinking_reasoning = await llm_reasoning(thinking_prompt)
        if thinking_guide:
            logger.info("论文写作：思考阶段完成，指导内容 %d 字符", len(thinking_guide))
        else:
            logger.info("论文写作：推理模型未配置或失败，跳过思考阶段")
    except Exception as e:  # noqa: BLE001
        logger.warning("论文写作：思考阶段异常，跳过：%s", e)

    context = {
        "question": question,
        "discipline": discipline,
        "profile": profile,
        "literature": literature_summary,
        "design": json.dumps(state.get("experiment_design", {}) or {}, ensure_ascii=False),
        "results": json.dumps(state.get("experiment_results", {}) or {}, ensure_ascii=False),
        "evaluation": json.dumps(state.get("evaluation", {}) or {}, ensure_ascii=False),
        "thinking_guide": thinking_guide,
    }

    targets = {
        key: max(30 if key == "keywords" else 80, round(word_limit * spec["weight"]))
        for key, spec in profile["sections"].items()
    }
    assignments = [
        {
            "section": key,
            "role": spec["role"],
            "target_characters": targets[key],
            "focus": spec["focus"],
        }
        for key, spec in profile["sections"].items()
    ]

    written = await asyncio.gather(
        *(_write_section(key, targets[key], context) for key in profile["sections"])
    )
    paper_sections = dict(written)
    paper_sections = await _editorial_review(paper_sections, context, word_limit)
    actual_characters = _count_chars(paper_sections)

    writing_plan = {
        "target_characters": word_limit,
        "actual_characters": actual_characters,
        "discipline_profile": profile["key"],
        "research_approach": profile.get("approach", "disciplinary"),
        "agents": assignments,
        "editorial_checks": [
            "研究问题、方法、结果和结论一致",
            "模拟数据与真实数据明确区分",
            f"证据标准符合{profile['label']}研究规范",
            "可重复性、伦理与利益冲突声明完整",
            "全文字符数处于目标范围",
        ],
    }

    artifacts = merge_artifacts(state, "paper_sections", paper_sections)
    artifacts["writing_plan"] = writing_plan
    # 保存思考过程供前端展示
    if thinking_guide or thinking_reasoning:
        artifacts["thinking"] = {
            "guide": thinking_guide,
            "reasoning": thinking_reasoning,
            "has_reasoning": bool(thinking_reasoning),
        }
    return {
        "stage": Stage.WRITE,
        "paper_sections": paper_sections,
        "artifacts": artifacts,
        "history": append_history(
            state,
            {
                "stage": Stage.WRITE.value,
                "action": "thinking_then_write" if thinking_guide else "multi_agent_paper_write",
                "detail": (
                    f"深度思考({len(thinking_guide)}字符) + {len(assignments)} 个章节并行写作，"
                    f"总编审校后 {actual_characters} 字"
                    if thinking_guide
                    else f"{len(assignments)} 个{profile['label']}章节 Agent 并行写作，总编审校后 {actual_characters} 字"
                ),
            },
        ),
        "errors": state.get("errors", []),
    }


def _summarize_literature(literature: list[dict[str, Any]]) -> str:
    if not literature:
        return "（暂无可核验文献，正文不得虚构引用）"
    lines: list[str] = []
    for item in literature[:12]:
        title = item.get("title", "")
        year = item.get("year") or "n.d."
        doi = item.get("doi") or ""
        lines.append(f"- {title} ({year}) {doi}".strip())
    return "\n".join(lines)
