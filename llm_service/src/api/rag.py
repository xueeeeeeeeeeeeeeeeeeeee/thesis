"""RAG 检索接口。

- POST   /rag/query            混合检索
- POST   /rag/ingest           文档导入
- GET    /rag/sources          数据源列表
- DELETE /rag/documents/{id}   删除文档
"""

from __future__ import annotations

from fastapi import APIRouter

from src.models.schemas import (
    IngestRequest,
    IngestResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    RAGResult,
)
from src.rag.service import get_rag_service
from src.utils.logger import get_logger

logger = get_logger("src.api.rag")

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/query", response_model=RAGQueryResponse)
async def query(req: RAGQueryRequest) -> RAGQueryResponse:
    """混合检索。无数据时返回空列表，不报错。"""
    svc = get_rag_service()
    try:
        results = await svc.query(
            query=req.query, top_k=req.top_k, filters=req.filters
        )
    except Exception as e:  # noqa: BLE001 - 检索失败时降级返回空列表
        logger.exception("RAG 查询异常：%s", e)
        results = []
    rag_results = [
        RAGResult(
            doc_id=r.get("doc_id", ""),
            content=r.get("content", ""),
            score=float(r.get("score", 0.0)),
            metadata=r.get("metadata", {}) or {},
        )
        for r in results
    ]
    return RAGQueryResponse(query=req.query, results=rag_results)


@router.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest) -> IngestResponse:
    """文档导入。"""
    svc = get_rag_service()
    ids = await svc.ingest(req.documents)
    return IngestResponse(ingested_ids=ids, count=len(ids))


@router.get("/sources")
async def sources() -> dict:
    """数据源列表。"""
    svc = get_rag_service()
    return {"sources": svc.list_sources()}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str) -> dict:
    """按 id 删除文档。"""
    svc = get_rag_service()
    await svc.delete(doc_id)
    return {"deleted": doc_id}
