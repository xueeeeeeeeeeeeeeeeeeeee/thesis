"""OpenAlex API 工具。

端点：https://api.openalex.org/works
返回 JSON。
"""

from __future__ import annotations

from typing import Any

import httpx

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.tools.openalex")


async def search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """检索 OpenAlex，返回文献列表。"""
    if not query:
        return []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{settings.openalex_base_url}/works",
                params={
                    "search": query,
                    "per-page": limit,
                    "select": "id,doi,title,abstract_inverted_index,publication_year,authorships",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("OpenAlex 检索失败：%s", e)
        return []

    results: list[dict[str, Any]] = []
    for work in data.get("results", []) or []:
        authors = [
            (a.get("author") or {}).get("display_name", "")
            for a in work.get("authorships", []) or []
        ]
        authors = [a for a in authors if a]
        abstract = _invert_abstract(work.get("abstract_inverted_index"))
        results.append(
            {
                "title": work.get("title", "") or "",
                "abstract": abstract,
                "authors": authors,
                "year": work.get("publication_year"),
                "doi": work.get("doi"),
                "url": work.get("id", "") or "",
                "source": "openalex",
                "metadata": {"source": "openalex", "openalex_id": work.get("id")},
            }
        )
    return results


def _invert_abstract(index: dict[str, list[int]] | None) -> str:
    """OpenAlex 的 abstract 是倒排索引，还原为文本。"""
    if not index:
        return ""
    positions: list[tuple[int, str]] = []
    for word, idxs in index.items():
        for i in idxs:
            positions.append((i, word))
    positions.sort()
    return " ".join(w for _, w in positions)
