"""RAG 混合检索主服务。

流程：
1. 向量检索（ChromaDB）取 top K
2. BM25 检索取 top K
3. 合并去重（按 doc_id）
4. bge-reranker 二次排序
5. 返回 top N
"""

from __future__ import annotations

from typing import Any, Optional

from src.config import settings
from src.models.schemas import Document
from src.rag.bm25 import BM25Store
from src.rag.ingest import ingest_documents
from src.rag.reranker import rerank
from src.rag.vectorstore import VectorStore
from src.utils.logger import get_logger

logger = get_logger("src.rag.service")


class RAGService:
    """混合检索主服务。"""

    def __init__(self) -> None:
        self.vectorstore = VectorStore()
        self.bm25 = BM25Store()

    # ------------------------------------------------------------------
    async def query(
        self,
        query: str,
        top_k: Optional[int] = None,
        filters: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """混合检索。

        返回 [{doc_id, content, score, metadata}]，无数据时返回空列表。
        """
        if not query or not query.strip():
            return []

        top_k = top_k or settings.rag_top_k
        rerank_top_k = settings.rag_rerank_top_k
        final_k = min(rerank_top_k, top_k)

        # 1. 向量检索
        vec_results = self._safe_vector_query(query, n_results=top_k, where=filters)

        # 2. BM25 检索
        bm25_results = self.bm25.query(query, top_k=top_k)
        if filters:
            bm25_results = _apply_filters(bm25_results, filters)

        # 3. 合并去重（按 doc_id，保留向量结果优先）
        merged = _merge_dedupe(vec_results, bm25_results)
        if not merged:
            return []

        # 4. bge-reranker 二次排序
        try:
            reranked = rerank(query, merged, top_k=final_k)
        except Exception as e:  # 重排序失败时降级使用合并分数
            logger.warning("reranker 失败，降级使用原始分数：%s", e)
            merged.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
            reranked = merged[:final_k]

        # 5. 返回 top N
        return reranked

    def _safe_vector_query(
        self,
        query: str,
        n_results: int,
        where: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """向量检索，捕获异常避免单路失败影响整体。"""
        try:
            return self.vectorstore.query(
                query_texts=[query], n_results=n_results, where=where
            )
        except Exception as e:
            logger.warning("向量检索失败：%s", e)
            return []

    # ------------------------------------------------------------------
    async def ingest(self, documents: list[Document]) -> list[str]:
        """文档导入：分段 -> 向量库 + BM25。"""
        if not documents:
            return []
        return ingest_documents(documents, self.vectorstore, self.bm25)

    # ------------------------------------------------------------------
    async def delete(self, doc_id: str) -> None:
        """按 doc_id 删除文档（向量库 + BM25 重建）。"""
        # 向量库删除
        try:
            self.vectorstore.delete([doc_id])
        except Exception as e:
            logger.warning("向量库删除失败：%s", e)

        # BM25 内存索引重建（剔除匹配 doc_id 或同 paper_id 的文档）
        docs = [d for d in self.bm25.all_docs() if d.get("doc_id") != doc_id]
        self.bm25.fit(docs)

    # ------------------------------------------------------------------
    def list_sources(self) -> list[str]:
        """返回数据源列表（向量库 + BM25 合并去重）。"""
        sources: set[str] = set()
        try:
            sources.update(self.vectorstore.list_sources())
        except Exception as e:
            logger.warning("向量库列出 sources 失败：%s", e)
        for d in self.bm25.all_docs():
            src = d.get("metadata", {}).get("source")
            if src:
                sources.add(str(src))
        return sorted(sources)


# ----------------------------------------------------------------------------
# 辅助函数
# ----------------------------------------------------------------------------


def _apply_filters(
    docs: list[dict[str, Any]], filters: dict[str, Any]
) -> list[dict[str, Any]]:
    """对 BM25 结果按 metadata 过滤（向量库已通过 where 过滤）。"""
    result: list[dict[str, Any]] = []
    for d in docs:
        meta = d.get("metadata", {}) or {}
        if all(meta.get(k) == v for k, v in filters.items()):
            result.append(d)
    return result


def _merge_dedupe(
    vec: list[dict[str, Any]], bm: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """按 doc_id 合并去重，向量结果优先；分数取较高者。"""
    merged: dict[str, dict[str, Any]] = {}
    for d in vec + bm:
        did = d.get("doc_id")
        if not did:
            continue
        if did not in merged:
            merged[did] = dict(d)
        else:
            # 取较高分数
            prev = merged[did]
            if float(d.get("score", 0.0)) > float(prev.get("score", 0.0)):
                prev["score"] = d.get("score", 0.0)
    return list(merged.values())


# 模块级单例
rag_service = RAGService()


def get_rag_service() -> RAGService:
    """获取全局 RAGService 单例。"""
    return rag_service
