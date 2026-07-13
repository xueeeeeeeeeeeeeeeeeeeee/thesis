"""PubMed E-utilities API 工具。

端点：https://eutils.ncbi.nlm.nih.gov/entrez/eutils
使用 esearch + esummary 两步检索。
"""

from __future__ import annotations

from typing import Any

import httpx

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.tools.pubmed")


async def search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """检索 PubMed，返回文献列表。"""
    if not query:
        return []
    base = settings.pubmed_base_url
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. esearch 获取 pmid 列表
            esearch = await client.get(
                f"{base}/esearch.fcgi",
                params={
                    "db": "pubmed",
                    "term": query,
                    "retmax": limit,
                    "retmode": "json",
                },
            )
            esearch.raise_for_status()
            es_data = esearch.json()
            ids = (es_data.get("esearchresult") or {}).get("idlist", []) or []
            if not ids:
                return []

            # 2. esummary 获取文献详情
            esummary = await client.get(
                f"{base}/esummary.fcgi",
                params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"},
            )
            esummary.raise_for_status()
            su_data = esummary.json()
    except Exception as e:
        logger.warning("PubMed 检索失败：%s", e)
        return []

    results: list[dict[str, Any]] = []
    result_map = (su_data.get("result") or {})
    for pmid in ids:
        item = result_map.get(pmid)
        if not item:
            continue
        authors = [
            a.get("name", "") for a in item.get("authors", []) or [] if a.get("name")
        ]
        year = None
        pubdate = item.get("pubdate", "") or ""
        if pubdate[:4].isdigit():
            year = int(pubdate[:4])
        doi = None
        for aid in item.get("articleids", []) or []:
            if aid.get("idtype") == "doi":
                doi = aid.get("value")
                break
        results.append(
            {
                "title": item.get("title", "") or "",
                "abstract": "",  # esummary 不含摘要，需 efetch；此处留空避免额外请求
                "authors": authors,
                "year": year,
                "doi": doi,
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "source": "pubmed",
                "metadata": {"source": "pubmed", "pmid": pmid},
            }
        )
    return results
