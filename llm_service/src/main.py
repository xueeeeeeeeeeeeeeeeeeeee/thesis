"""FastAPI 应用入口。

创建 RAP LLM Service 的 FastAPI app，挂载 /llm /agents /rag 路由，
提供 /health 健康检查与 /info 配置信息接口。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.utils.logger import configure_logging, get_logger

# 路由模块（内部均为轻量导入，不触发重型依赖）
from src.api.routes import api_router

# 初始化日志
configure_logging(settings.log_level)
logger = get_logger("src.main")


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用实例。"""
    app = FastAPI(
        title="RAP LLM Service",
        description="科研自动化 Agent 系统（RAP）的 Agent 编排 + RAG + LLM 路由层",
        version="0.1.0",
    )

    # CORS：开发态允许所有来源
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 挂载聚合路由
    app.include_router(api_router)

    # ---------- 基础接口 ----------
    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        """健康检查。"""
        return {"status": "ok"}

    @app.get("/info", tags=["meta"])
    async def info() -> dict[str, Any]:
        """显示配置信息（API Key 脱敏）。"""
        return _build_info()

    @app.on_event("startup")
    async def _on_startup() -> None:
        """启动时打印注册的路由。"""
        _print_routes(app)
        logger.info(
            "RAP LLM Service 已启动 | LLM 就绪: %s | Deep=%s Fast=%s Long=%s | 监听 %s:%s",
            settings.has_any_llm,
            settings.deepseek_deep_model,
            settings.deepseek_fast_model,
            settings.deepseek_long_model,
            settings.host,
            settings.port,
        )

    return app


def _build_info() -> dict[str, Any]:
    """构造脱敏后的配置信息。"""
    def _mask(key: str | None) -> str:
        if not key:
            return ""
        if len(key) <= 6:
            return "***"
        return f"{key[:3]}***{key[-3:]}"

    return {
        "service": "RAP LLM Service",
        "version": "0.1.0",
        "models": {
            "deep": settings.deepseek_deep_model,
            "fast": settings.deepseek_fast_model,
            "long": settings.deepseek_long_model,
            "embedding": settings.embedding_model,
        },
        "llm_providers": {
            "deepseek": {
                "configured": settings.has_deepseek,
                "api_key": _mask(settings.deepseek_api_key),
                "base_url": settings.deepseek_base_url,
            },
            "kimi": {
                "configured": settings.has_kimi,
                "api_key": _mask(settings.kimi_api_key),
                "base_url": settings.kimi_base_url,
            },
            "qwen": {
                "configured": settings.has_qwen,
                "api_key": _mask(settings.qwen_api_key),
                "base_url": settings.qwen_base_url,
            },
        },
        "embedding": {
            "model": settings.embedding_model,
            "reranker_model": settings.reranker_model,
        },
        "rag": {
            "chroma_persist_dir": settings.chroma_persist_dir,
            "top_k": settings.rag_top_k,
            "rerank_top_k": settings.rag_rerank_top_k,
        },
        "server": {
            "host": settings.host,
            "port": settings.port,
            "log_level": settings.log_level,
        },
    }


def _print_routes(app: FastAPI) -> None:
    """启动时打印所有注册的路由。"""
    logger.info("已注册路由清单：")
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if methods and path:
            logger.info("  %-6s %s", ",".join(sorted(methods)), path)


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
