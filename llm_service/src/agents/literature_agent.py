"""文献调研 Agent（literature）。

流程：
1. 本地 RAG 检索（bge-m3 + BM25 + reranker）
2. 外部学术 API 检索（arXiv / Semantic Scholar）
3. 合并去重，归一化为统一文献字典
4. 调用 LLM（economical / V4 Flash）生成研究现状总结
5. 至少保留 1 条占位文献（LLM 失败时不 raise）
6. 写入 state["literature"] + state["artifacts"]["literature"]
"""

from __future__ import annotations

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


async def node(state: AgentState) -> dict[str, Any]:
    """文献调研节点：检索 + LLM 总结。"""
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")

    # 1. 本地 RAG 检索（无数据时返回空列表，不报错）
    rag_docs: list[dict[str, Any]] = []
    try:
        rag_docs = await get_rag_service().query(question, top_k=5)
    except Exception as e:  # noqa: BLE001
        logger.warning("RAG 检索失败：%s", e)

    # 2. 外部学术 API 检索（best-effort）
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

    # 3. 合并为统一文献列表
    literature: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for d in arxiv_docs + s2_docs:
        item = _normalize(d)
        key = (item.get("title") or "").strip().lower()
        if key and key in seen_titles:
            continue
        if key:
            seen_titles.add(key)
        literature.append(item)
    for d in rag_docs:
        meta = d.get("metadata", {}) or {}
        item = {
            "title": meta.get("title", ""),
            "abstract": d.get("content", ""),
            "authors": [],
            "year": meta.get("year"),
            "doi": None,
            "url": None,
            "source": "rag",
        }
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
