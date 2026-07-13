"""Semantic Scholar (S2) API 工具。

端点：https://api.semanticscholar.org/graph/v1/paper/search
返回 JSON。
"""

from __future__ import annotations

from typing import Any

import httpx

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.tools.semantic_scholar")


async def search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """检索 Semantic Scholar，返回文献列表。"""
    if not query:
        return []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{settings.s2_base_url}/paper/search",
                params={
                    "query": query,
                    "limit": limit,
                    "fields": "title,abstract,authors,year,externalIds,url",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("Semantic Scholar 检索失败：%s", e)
        return []

    results: list[dict[str, Any]] = []
    for paper in data.get("data", []) or []:
        authors = [a.get("name", "") for a in paper.get("authors", []) or [] if a.get("name")]
        ext_ids = paper.get("externalIds") or {}
        doi = ext_ids.get("DOI")
        results.append(
            {
                "title": paper.get("title", "") or "",
                "abstract": paper.get("abstract", "") or "",
                "authors": authors,
                "year": paper.get("year"),
                "doi": doi,
                "url": paper.get("url", "") or "",
                "source": "s2",
                "metadata": {"source": "s2", "paperId": paper.get("paperId")},
            }
        )
    return results
