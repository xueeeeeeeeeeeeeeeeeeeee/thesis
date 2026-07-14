"""arXiv API 工具。

端点：http://export.arxiv.org/api/query
返回 Atom XML，解析为统一文献字典。
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

import httpx

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.tools.arxiv")

_ATOM_NS = "{http://www.w3.org/2005/Atom}"


async def search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """检索 arXiv，返回文献列表。"""
    if not query:
        return []
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(
                settings.arxiv_base_url,
                params={
                    "search_query": f"all:{query}",
                    "start": 0,
                    "max_results": limit,
                    "sortBy": "relevance",
                },
            )
            resp.raise_for_status()
    except Exception as e:
        logger.warning("arXiv 检索失败：%s", e)
        return []

    return _parse(resp.text)


def _parse(xml_text: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning("arXiv XML 解析失败：%s", e)
        return []

    for entry in root.findall(f"{_ATOM_NS}entry"):
        title_el = entry.find(f"{_ATOM_NS}title")
        summary_el = entry.find(f"{_ATOM_NS}summary")
        published_el = entry.find(f"{_ATOM_NS}published")
        id_el = entry.find(f"{_ATOM_NS}id")

        authors: list[str] = []
        for author in entry.findall(f"{_ATOM_NS}author"):
            name = author.find(f"{_ATOM_NS}name")
            if name is not None and name.text:
                authors.append(name.text.strip())

        year = None
        if published_el is not None and published_el.text:
            year = int(published_el.text[:4]) if published_el.text[:4].isdigit() else None

        doi = None
        doi_el = entry.find("{http://arxiv.org/schemas/atom}doi")
        if doi_el is not None and doi_el.text:
            doi = doi_el.text.strip()

        results.append(
            {
                "title": (title_el.text or "").strip() if title_el is not None else "",
                "abstract": (summary_el.text or "").strip()
                if summary_el is not None
                else "",
                "authors": authors,
                "year": year,
                "doi": doi,
                "url": (id_el.text or "").strip() if id_el is not None else "",
                "source": "arxiv",
                "metadata": {"source": "arxiv"},
            }
        )
    return results
