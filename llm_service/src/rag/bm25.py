"""BM25 检索封装。

基于 rank_bm25.BM25Okapi，内存存储文档库，支持 fit / query。
后续可替换为 Elasticsearch 等外部索引。
"""

from __future__ import annotations

import re
from typing import Any

from src.utils.logger import get_logger

logger = get_logger("src.rag.bm25")

# 简易分词器：中文字符按单字切分，英文按单词切分，统一小写
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_WORD_RE = re.compile(r"[A-Za-z0-9]+")


def tokenize(text: str) -> list[str]:
    """简易中英文分词。

    - 中文：按单字切分
    - 英文/数字：按词切分并小写
    """
    if not text:
        return []
    tokens: list[str] = []
    # 提取英文/数字词
    for m in _WORD_RE.findall(text):
        tokens.append(m.lower())
    # 提取中文字符（逐字）
    for ch in text:
        if _CJK_RE.match(ch):
            tokens.append(ch)
    return tokens


class BM25Store:
    """内存 BM25 文档索引。"""

    def __init__(self) -> None:
        self._docs: list[dict[str, Any]] = []     # 原始文档 {doc_id, content, metadata}
        self._tokenized: list[list[str]] = []     # 与 docs 对齐的分词结果
        self._bm25: Any = None

    # ------------------------------------------------------------------
    @property
    def size(self) -> int:
        return len(self._docs)

    def fit(self, documents: list[dict[str, Any]]) -> None:
        """重建索引（替换已有文档）。"""
        self._docs = list(documents)
        self._tokenized = [tokenize(d.get("content", "")) for d in self._docs]
        self._build()
        logger.info("BM25 索引重建完成，文档数：%d", len(self._docs))

    def add(self, documents: list[dict[str, Any]]) -> None:
        """增量追加文档并重建索引。"""
        for d in documents:
            self._docs.append(d)
            self._tokenized.append(tokenize(d.get("content", "")))
        self._build()
        logger.info("BM25 增量添加 %d 篇，总计 %d 篇", len(documents), len(self._docs))

    def _build(self) -> None:
        if not self._tokenized:
            self._bm25 = None
            return
        from rank_bm25 import BM25Okapi

        self._bm25 = BM25Okapi(self._tokenized)

    def query(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        """检索 top_k 文档，返回 [{doc_id, content, score, metadata}]。"""
        if not self._bm25 or not self._docs:
            return []
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        scores = self._bm25.get_scores(q_tokens)
        # 按分数降序取 top_k
        ranked = sorted(
            zip(self._docs, scores), key=lambda x: x[1], reverse=True
        )[:top_k]
        results: list[dict[str, Any]] = []
        for doc, score in ranked:
            results.append(
                {
                    "doc_id": doc.get("doc_id", ""),
                    "content": doc.get("content", ""),
                    "score": float(score),
                    "metadata": doc.get("metadata", {}),
                }
            )
        return results

    def all_docs(self) -> list[dict[str, Any]]:
        """返回当前所有文档（用于与其他检索器对齐）。"""
        return list(self._docs)

    def clear(self) -> None:
        self._docs = []
        self._tokenized = []
        self._bm25 = None
