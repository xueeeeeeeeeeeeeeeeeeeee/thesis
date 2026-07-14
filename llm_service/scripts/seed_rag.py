"""批量灌入 RAG 库演示文献。

从 arXiv 拉取材料科学（钙钛矿太阳能电池 / 锂电 / 热电 / 合金 / 二维材料 等）
方向的论文标题与摘要，写入本地文献库 JSON 文件（供 literature_agent 兜底加载），
并尝试 ingest 到 BM25 索引（向量库需要 bge-m3 模型，离线时跳过）。

用法：
    cd llm_service
    python -m scripts.seed_rag            # 默认每主题 5 篇，约 60 篇
    python -m scripts.seed_rag --limit 8  # 自定义数量

演示前运行一次即可。文献写入 data/seed_literature.json，
literature_agent 在 RAG 检索为空时会自动加载该文件作为本地文献库。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from typing import Any

import httpx

from src.models.schemas import Document
from src.utils.logger import get_logger

logger = get_logger("scripts.seed_rag")

# 本地文献库 JSON 路径（literature_agent 兜底加载）
SEED_JSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "seed_literature.json",
)

# 演示主题（围绕推荐演示项目"钙钛矿太阳能电池" + 材料科学常见方向）
QUERIES = [
    "perovskite solar cell efficiency",
    "perovskite interface engineering",
    "perovskite stability degradation",
    "organic photovoltaic materials",
    "lithium ion battery cathode material",
    "solid state electrolyte battery",
    "thermoelectric material performance",
    "two dimensional material transistor",
    "metal organic framework gas storage",
    "high entropy alloy mechanical property",
    "XRD SEM characterization material",
    "heat treatment alloy microstructure",
]

_ATOM_NS = "{http://www.w3.org/2005/Atom}"
_ARXIV_NS = "{http://arxiv.org/schemas/atom}"


async def fetch_arxiv(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """从 arXiv 拉取文献，返回统一字典列表。"""
    url = "https://export.arxiv.org/api/query"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                params={
                    "search_query": f"all:{query}",
                    "start": 0,
                    "max_results": limit,
                    "sortBy": "relevance",
                },
            )
            resp.raise_for_status()
    except Exception as e:  # noqa: BLE001
        logger.warning("arXiv 检索失败（query=%s）：%s", query, e)
        return []
    return _parse_arxiv(resp.text)


def _parse_arxiv(xml_text: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning("arXiv XML 解析失败：%s", e)
        return results
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
            ys = published_el.text[:4]
            if ys.isdigit():
                year = int(ys)
        doi = None
        doi_el = entry.find(f"{_ARXIV_NS}doi")
        if doi_el is not None and doi_el.text:
            doi = doi_el.text.strip()
        arxiv_url = (id_el.text or "").strip() if id_el is not None else ""
        arxiv_id = ""
        m = re.search(r"arxiv\.org/abs/([\d.]+)", arxiv_url)
        if m:
            arxiv_id = m.group(1)
        title = (title_el.text or "").strip().replace("\n", " ") if title_el is not None else ""
        abstract = (summary_el.text or "").strip() if summary_el is not None else ""
        # 模拟章节结构，便于 ingest 按 section 分段
        content = (
            f"Title: {title}\n\n"
            f"Abstract\n{abstract}\n\n"
            f"Introduction\nThis work addresses {title.lower()}.\n\n"
            f"Method\n{abstract[:300]}\n\n"
            f"Results\n{abstract[300:600]}\n\n"
            f"Discussion\n{abstract[600:]}\n"
        )
        results.append(
            {
                "title": title,
                "abstract": abstract,
                "authors": authors,
                "year": year,
                "doi": doi,
                "url": arxiv_url,
                "arxiv_id": arxiv_id,
                "source": "arxiv",
                "content": content,
            }
        )
    return results


def to_document(item: dict[str, Any]) -> Document:
    """把 arXiv 条目转成 Document（供 RAG ingest）。"""
    arxiv_id = item.get("arxiv_id") or item.get("title", "")[:20]
    paper_id = f"arxiv_{arxiv_id}".replace(" ", "_")
    return Document(
        title=item.get("title", ""),
        content=item.get("content", ""),
        metadata={
            "paper_id": paper_id,
            "title": item.get("title", ""),
            "authors": item.get("authors", []),
            "year": item.get("year"),
            "doi": item.get("doi"),
            "url": item.get("url"),
            "source": "arxiv",
        },
    )


async def main() -> int:
    parser = argparse.ArgumentParser(description="批量灌入 RAG 演示文献")
    parser.add_argument(
        "--limit", type=int, default=5,
        help="每个主题拉取的文献数（默认 5，共 12 个主题约 60 篇）",
    )
    args = parser.parse_args()

    print(f"[seed_rag] 开始从 arXiv 拉取文献（{len(QUERIES)} 个主题 × {args.limit} 篇）...")
    all_items: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for q in QUERIES:
        items = await fetch_arxiv(q, limit=args.limit)
        for it in items:
            t = (it.get("title") or "").strip().lower()
            if t and t not in seen_titles:
                seen_titles.add(t)
                all_items.append(it)
        print(f"  [{q}] +{len(items)} -> 累计 {len(all_items)} 篇")
        await asyncio.sleep(1.0)  # 避免 arXiv 限流

    if not all_items:
        print("[seed_rag] 未拉取到任何文献，退出。")
        return 1

    # 写入本地文献库 JSON（literature_agent 兜底加载）
    os.makedirs(os.path.dirname(SEED_JSON_PATH), exist_ok=True)
    seed_entries = []
    for it in all_items:
        seed_entries.append(
            {
                "title": it.get("title", ""),
                "abstract": it.get("abstract", ""),
                "authors": it.get("authors", []),
                "year": it.get("year"),
                "doi": it.get("doi"),
                "url": it.get("url"),
                "source": "rag",
            }
        )
    with open(SEED_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(seed_entries, f, ensure_ascii=False, indent=2)
    print(f"[seed_rag] ✓ 已写入 {len(seed_entries)} 篇文献到 {SEED_JSON_PATH}（JSON 备份）")

    # 灌入 ChromaDB 向量库 + BM25 索引
    print(f"[seed_rag] 开始灌入 ChromaDB + BM25（bge-m3 embedding）...")
    from src.rag.service import get_rag_service

    docs = [to_document(it) for it in all_items]
    rag = get_rag_service()
    ids = await rag.ingest(docs)
    print(f"[seed_rag] ✓ ChromaDB 导入完成：{len(docs)} 篇文档 -> {len(ids)} 个 chunk")
    # 验证向量库文档数
    try:
        count = rag.vectorstore.count()
        print(f"[seed_rag] ChromaDB 当前文档总数：{count}")
    except Exception as e:  # noqa: BLE001
        print(f"[seed_rag] 查询 ChromaDB 文档数失败：{e}")

    # 打印前 5 条样本
    for i, e in enumerate(seed_entries[:5], 1):
        print(f"  [{i}] {e['title'][:70]}  ({e.get('year', '?')})")
    if len(seed_entries) > 5:
        print(f"  ... 共 {len(seed_entries)} 篇")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
