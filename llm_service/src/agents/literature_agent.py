"""文献调研 Agent（literature）。

流程：
1. 本地 RAG 检索（bge-m3 + BM25 + reranker）
   - RAG 库为空时降级加载 data/seed_literature.json 作为本地文献库
2. 外部学术 API 检索（arXiv / Semantic Scholar）
3. 合并去重，归一化为统一文献字典
4. 调用 LLM（economical / V4 Flash）生成研究现状总结
5. 至少保留 1 条占位文献（LLM 失败时不 raise）
6. 写入 state["literature"] + state["artifacts"]["literature"]
"""

from __future__ import annotations

import json
import os
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_literature,
    safe_json_loads,
)
from src.agents.state import AgentState
from src.llm.prompts.templates import LITERATURE_PROMPT
from src.models.schemas import Stage
from src.rag.service import get_rag_service
from src.tools import search_arxiv, search_s2
from src.utils.logger import get_logger

logger = get_logger("src.agents.literature")

# 预置文献库 JSON 路径（由 scripts/seed_rag.py 生成）
_SEED_JSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "seed_literature.json",
)


def _load_seed_literature() -> list[dict[str, Any]]:
    """加载预置文献库 JSON（RAG 库为空时的兜底来源）。"""
    if not os.path.exists(_SEED_JSON_PATH):
        return []
    try:
        with open(_SEED_JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            logger.info("加载预置文献库：%d 篇（%s）", len(data), _SEED_JSON_PATH)
            return data
    except Exception as e:  # noqa: BLE001
        logger.warning("加载预置文献库失败：%s", e)
    return []


async def node(state: AgentState) -> dict[str, Any]:
    """文献调研节点：检索 + LLM 总结。

    检索顺序：先在本地 RAG 库中按"主题 + 学科方向"检索约 8 篇文献（首要来源），
    再用外部学术 API（arXiv / Semantic Scholar）作为补充。
    """
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")

    # 把"主题 + 方向"组合成 RAG 查询，提高相关性
    rag_query = f"{question} {discipline}".strip() if discipline and discipline != "general" else question

    # 1. 本地 RAG 检索：首要来源，目标约 8 篇
    rag_docs: list[dict[str, Any]] = []
    try:
        rag_docs = await get_rag_service().query(rag_query, top_k=8, final_k=8)
    except Exception as e:  # noqa: BLE001
        logger.warning("RAG 检索失败：%s", e)

    # RAG 库为空时降级加载预置文献库（按查询词关键词匹配取 top 8）
    seed_docs: list[dict[str, Any]] = []
    if not rag_docs:
        seed_all = _load_seed_literature()
        if seed_all:
            seed_docs = _rank_seed_by_query(seed_all, rag_query, top_n=8)
            logger.info("RAG 库为空，使用预置文献库匹配 %d 篇", len(seed_docs))

    # 2. 外部学术 API 检索（best-effort，作为补充）
    arxiv_docs: list[dict[str, Any]] = []
    s2_docs: list[dict[str, Any]] = []
    try:
        arxiv_docs = await search_arxiv(question, limit=5)
    except Exception as e:  # noqa: BLE001
        logger.warning("arXiv 检索失败：%s", e)
    try:
        s2_docs = await search_s2(question, limit=5)
    except Exception as e:  # noqa: BLE001
        logger.warning("S2 检索失败：%s", e)

    # 3. 合并为统一文献列表（RAG/seed 优先，再补 arXiv / S2）
    literature: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    # RAG 结果优先加入
    for d in rag_docs:
        meta = d.get("metadata", {}) or {}
        item = {
            "title": meta.get("title", ""),
            "abstract": d.get("content", ""),
            "authors": meta.get("authors", []) or [],
            "year": meta.get("year"),
            "doi": meta.get("doi"),
            "url": meta.get("url"),
            "source": "rag",
        }
        key = (item.get("title") or "").strip().lower()
        if key and key in seen_titles:
            continue
        if key:
            seen_titles.add(key)
        literature.append(item)
    # 预置文献库结果加入（RAG 为空时）
    for d in seed_docs:
        item = {
            "title": d.get("title", ""),
            "abstract": d.get("abstract", ""),
            "authors": d.get("authors", []) or [],
            "year": d.get("year"),
            "doi": d.get("doi"),
            "url": d.get("url"),
            "source": "rag",
        }
        key = (item.get("title") or "").strip().lower()
        if key and key in seen_titles:
            continue
        if key:
            seen_titles.add(key)
        literature.append(item)
    # 再补充外部 API 结果
    for d in arxiv_docs + s2_docs:
        item = _normalize(d)
        key = (item.get("title") or "").strip().lower()
        if key and key in seen_titles:
            continue
        if key:
            seen_titles.add(key)
        literature.append(item)

    # 4. 构造上下文 + LLM 总结
    context = _format_context(literature)
    prompt = LITERATURE_PROMPT.format(
        question=question, discipline=discipline, context=context
    )
    summary = await llm_generate(prompt, tier="economical")

    # 尝试从 LLM 输出中再提取一些文献线索
    extra_lit: list[dict] = []
    parsed = safe_json_loads(summary, default=None)
    if isinstance(parsed, list):
        for item in parsed:
            if isinstance(item, dict) and item.get("title"):
                extra_lit.append(
                    {
                        "title": item.get("title", ""),
                        "abstract": item.get("abstract", ""),
                        "authors": item.get("authors", []) or [],
                        "year": item.get("year"),
                        "doi": None,
                        "url": None,
                        "source": "llm",
                    }
                )
    literature.extend(extra_lit)

    # 5. 至少保留 3 条占位文献
    if not literature:
        literature = placeholder_literature(question, n=3)
    if len(literature) < 3:
        literature.extend(placeholder_literature(question, n=3 - len(literature)))

    if not summary:
        summary = (
            f"[占位文献调研] 基于问题「{question}」的简化结论。"
            "（未配置 LLM 或调用失败，已返回占位结果。）"
        )

    # 6. 写入 artifacts
    artifacts_payload = {
        "literature": literature,
        "summary": summary,
    }

    return {
        "stage": Stage.LITERATURE,
        "literature": literature,
        "artifacts": merge_artifacts(state, "literature", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.LITERATURE.value,
                "action": "literature_search",
                "detail": f"检索到 {len(literature)} 条文献",
                "summary": summary,
            },
        ),
        "errors": state.get("errors", []),
    }


def _normalize(d: dict[str, Any]) -> dict[str, Any]:
    """把外部工具返回的文献字段归一化。"""
    return {
        "title": d.get("title", "") or "",
        "abstract": d.get("abstract", "") or "",
        "authors": d.get("authors", []) or [],
        "year": d.get("year"),
        "doi": d.get("doi"),
        "url": d.get("url"),
        "source": d.get("source", "unknown"),
    }


def _format_context(literature: list[dict[str, Any]]) -> str:
    """把文献列表格式化为 LLM 上下文。"""
    if not literature:
        return "（暂无可用文献线索）"
    lines: list[str] = []
    for i, item in enumerate(literature[:10], 1):
        lines.append(
            f"{i}. [{item.get('source')}] {item.get('title','')}"
            f" ({item.get('year') or 'n.d.'})\n   {item.get('abstract','')[:200]}"
        )
    return "\n".join(lines)


def _rank_seed_by_query(
    seed_all: list[dict[str, Any]], query: str, top_n: int = 8
) -> list[dict[str, Any]]:
    """按查询词关键词对预置文献做简单打分排序（标题/摘要命中数）。"""
    if not seed_all or not query:
        return seed_all[:top_n]
    # 提取查询词关键词（英文按词，过滤停用词和短词）
    stop = {
        "the", "a", "an", "of", "and", "or", "for", "in", "on", "to", "with",
        "is", "are", "how", "what", "why", "by", "from", "at", "as",
    }
    keywords = [
        w.lower()
        for w in query.replace(",", " ").replace("?", " ").split()
        if len(w) >= 2 and w.lower() not in stop
    ]
    if not keywords:
        return seed_all[:top_n]

    def _score(item: dict[str, Any]) -> int:
        text = (
            (item.get("title") or "") + " " + (item.get("abstract") or "")
        ).lower()
        return sum(1 for kw in keywords if kw in text)

    ranked = sorted(seed_all, key=_score, reverse=True)
    # 只返回有命中的，不足 top_n 时用未命中的补齐
    hit = [r for r in ranked if _score(r) > 0]
    miss = [r for r in ranked if _score(r) == 0]
    return (hit + miss)[:top_n]
