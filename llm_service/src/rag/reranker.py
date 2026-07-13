"""bge-reranker 二次排序。

懒加载 sentence-transformers CrossEncoder (bge-reranker-v2-m3)，
首次调用 rerank 时才加载权重。
"""

from __future__ import annotations

from typing import Any

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.rag.reranker")

# 懒加载单例
_reranker_instance: Any = None


def _get_reranker() -> Any:
    """懒加载 CrossEncoder 重排序模型。"""
    global _reranker_instance
    if _reranker_instance is None:
        logger.info("首次加载重排序模型：%s（懒加载）", settings.reranker_model)
        from sentence_transformers import CrossEncoder

        _reranker_instance = CrossEncoder(settings.reranker_model)
    return _reranker_instance


def rerank(
    query: str,
    docs: list[dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """对候选文档用 bge-reranker 二次排序，返回 top_k。

    docs: [{doc_id, content, score, metadata, ...}]
    返回同结构列表，score 字段更新为 reranker 分数。
    """
    if not docs:
        return []
    if not query:
        # 无 query 时直接按原分数截断
        return docs[:top_k]

    model = _get_reranker()
    pairs = [[query, d.get("content", "")] for d in docs]
    scores = model.predict(pairs)

    ranked = sorted(zip(docs, scores), key=lambda x: float(x[1]), reverse=True)
    results: list[dict[str, Any]] = []
    for doc, score in ranked[:top_k]:
        out = dict(doc)
        out["score"] = float(score)
        results.append(out)
    return results
