"""路由聚合。

将 /llm、/agents、/rag 子路由聚合到统一的 api_router。
"""

from __future__ import annotations

from fastapi import APIRouter

from src.api.agents import router as agents_router
from src.api.llm import router as llm_router
from src.api.rag import router as rag_router

api_router = APIRouter()
api_router.include_router(llm_router)
api_router.include_router(agents_router)
api_router.include_router(rag_router)
