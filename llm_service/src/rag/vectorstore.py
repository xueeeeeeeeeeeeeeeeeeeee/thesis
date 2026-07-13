"""ChromaDB 向量库封装。

使用 PersistentClient 本地嵌入存储，集合名 `papers`。
chromadb 在首次使用时才导入，embedding 函数复用 llm.router.embed_sync
（懒加载 bge-m3），不在启动时下载任何权重。
"""

from __future__ import annotations

import os
from typing import Any, Optional

from src.config import settings
from src.llm.router import embed_sync
from src.utils.logger import get_logger

logger = get_logger("src.rag.vectorstore")

COLLECTION_NAME = "papers"


class _ChromaEmbeddingFunction:
    """适配 ChromaDB 的 embedding_function 接口，内部走 bge-m3 懒加载。"""

    def __call__(self, input: list[str]) -> list[list[float]]:  # noqa: A002 - ChromaDB 约定参数名
        return embed_sync(input)

    # ChromaDB 0.5 也可能调用 name / default_space 等属性，提供最小兼容
    name = "bge-m3"


class VectorStore:
    """ChromaDB 持久化向量库封装。"""

    def __init__(self, persist_dir: Optional[str] = None) -> None:
        self.persist_dir = persist_dir or settings.chroma_persist_dir
        self._client: Any = None
        self._collection: Any = None
        self._embedding_fn = _ChromaEmbeddingFunction()

    # ------------------------------------------------------------------
    def _ensure(self) -> None:
        """懒加载 chromadb 客户端与集合。"""
        if self._collection is not None:
            return
        os.makedirs(self.persist_dir, exist_ok=True)
        # 重型依赖在此处导入
        import chromadb

        logger.info("初始化 ChromaDB（persist_dir=%s）", self.persist_dir)
        self._client = chromadb.PersistentClient(path=self.persist_dir)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self._embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    def add(
        self,
        ids: list[str],
        documents: list[str],
        metadatas: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        """批量插入文档。"""
        if not ids:
            return
        self._ensure()
        # 避免重复 id 导致报错，使用 upsert
        self._collection.upsert(
            ids=ids, documents=documents, metadatas=metadatas or [{}] * len(ids)
        )

    def query(
        self,
        query_texts: list[str],
        n_results: int = 10,
        where: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """向量检索，返回 [{doc_id, content, score, metadata}]。"""
        self._ensure()
        if self._collection.count() == 0:
            return []
        params: dict[str, Any] = {
            "query_texts": query_texts,
            "n_results": n_results,
        }
        if where:
            params["where"] = where
        res = self._collection.query(**params)

        results: list[dict[str, Any]] = []
        # res 是按 query 分组的列表，这里取第一个 query
        ids_batch = (res.get("ids") or [[]])[0]
        docs_batch = (res.get("documents") or [[]])[0]
        metas_batch = (res.get("metadatas") or [[]])[0]
        dists_batch = (res.get("distances") or [[]])[0]
        for doc_id, content, meta, dist in zip(
            ids_batch, docs_batch, metas_batch, dists_batch
        ):
            # ChromaDB 返回的是距离（cosine 距离），转换为相似度分数
            score = 1.0 - float(dist) if dist is not None else 0.0
            results.append(
                {
                    "doc_id": doc_id,
                    "content": content,
                    "score": score,
                    "metadata": meta or {},
                }
            )
        return results

    def delete(self, ids: list[str]) -> None:
        """按 id 删除文档。"""
        if not ids:
            return
        self._ensure()
        self._collection.delete(ids=ids)

    def count(self) -> int:
        """返回集合中文档数量。"""
        self._ensure()
        return self._collection.count()

    def list_sources(self) -> list[str]:
        """返回集合中出现的所有 source（去重）。"""
        self._ensure()
        if self._collection.count() == 0:
            return []
        try:
            res = self._collection.get(include=["metadatas"])
            sources: set[str] = set()
            for meta in res.get("metadatas", []) or []:
                if meta and meta.get("source"):
                    sources.add(str(meta["source"]))
            return sorted(sources)
        except Exception as e:  # pragma: no cover - 防御性
            logger.warning("列出 sources 失败：%s", e)
            return []
