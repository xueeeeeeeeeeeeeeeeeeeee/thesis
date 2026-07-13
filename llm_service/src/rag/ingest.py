"""文档导入与分段。

按 section（Abstract / Intro / Method / Results / Discussion）分段，
生成元数据 {paper_id, title, section, year, source}，
入向量库 + BM25。
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from src.models.schemas import Document
from src.utils.logger import get_logger

logger = get_logger("src.rag.ingest")

# 论文章节标题匹配（中英文）
_SECTION_PATTERNS = [
    ("abstract", re.compile(r"(?im)^\s*(abstract|摘\s*要)\s*[:：]?\s*$")),
    ("intro", re.compile(r"(?im)^\s*(introduction|引\s*言|前\s*言|1\.?\s*introduction)\s*$")),
    ("method", re.compile(r"(?im)^\s*(method(s)?|materials?\s+and\s+method(s)?|方法|实验方法|2\.?\s*method)\s*$")),
    ("results", re.compile(r"(?im)^\s*(results?|实验结果|结\s*果|3\.?\s*results?)\s*$")),
    ("discussion", re.compile(r"(?im)^\s*(discussion|讨\s*论|4\.?\s*discussion)\s*$")),
]


def _detect_section(line: str) -> str | None:
    for name, pat in _SECTION_PATTERNS:
        if pat.match(line):
            return name
    return None


def chunk_document(doc: Document) -> list[dict[str, Any]]:
    """将单个文档按章节切分为多个 chunk。

    返回 [{doc_id, content, metadata}]。
    若无法识别章节标题，则整篇作为一个 section="full" 的 chunk。
    """
    paper_id = str(doc.metadata.get("paper_id") or uuid.uuid4().hex[:12])
    title = doc.title or str(doc.metadata.get("title") or "")
    year = doc.metadata.get("year")
    source = doc.metadata.get("source", "unknown")

    base_meta = {
        "paper_id": paper_id,
        "title": title,
        "year": year,
        "source": source,
    }

    lines = doc.content.splitlines()
    chunks: list[dict[str, Any]] = []
    current_section: str | None = None
    buffer: list[str] = []

    def _flush(section: str | None) -> None:
        if buffer and section:
            text = "\n".join(buffer).strip()
            if text:
                meta = dict(base_meta)
                meta["section"] = section
                chunks.append(
                    {
                        "doc_id": f"{paper_id}_{section}_{uuid.uuid4().hex[:6]}",
                        "content": text,
                        "metadata": meta,
                    }
                )
        buffer.clear()

    has_section_header = False
    for line in lines:
        sec = _detect_section(line)
        if sec:
            has_section_header = True
            _flush(current_section)
            current_section = sec
            continue
        buffer.append(line)
    _flush(current_section)

    if not chunks:
        # 没有识别到章节标题，整篇作为一个 chunk
        meta = dict(base_meta)
        meta["section"] = "full"
        text = doc.content.strip()
        if text:
            chunks.append(
                {
                    "doc_id": f"{paper_id}_full_{uuid.uuid4().hex[:6]}",
                    "content": text,
                    "metadata": meta,
                }
            )

    if not has_section_header and len(chunks) == 1:
        logger.debug("文档未识别章节标题，按整篇导入（paper_id=%s）", paper_id)

    return chunks


def ingest_documents(
    documents: list[Document],
    vectorstore: Any,
    bm25: Any,
) -> list[str]:
    """将文档分段后写入向量库与 BM25 索引，返回所有 chunk id。"""
    all_chunks: list[dict[str, Any]] = []
    for doc in documents:
        all_chunks.extend(chunk_document(doc))

    if not all_chunks:
        return []

    ids = [c["doc_id"] for c in all_chunks]
    contents = [c["content"] for c in all_chunks]
    metadatas = [c["metadata"] for c in all_chunks]

    # 入向量库
    vectorstore.add(ids=ids, documents=contents, metadatas=metadatas)
    # 入 BM25
    bm25.add(
        [
            {"doc_id": c["doc_id"], "content": c["content"], "metadata": c["metadata"]}
            for c in all_chunks
        ]
    )

    logger.info("文档导入完成：%d 篇文档 -> %d 个 chunk", len(documents), len(all_chunks))
    return ids
