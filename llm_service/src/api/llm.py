"""LLM 路由接口。

- POST /llm/chat    对话（按 tier 路由模型）
- GET  /llm/models  返回四档分级模型清单
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.llm.router import LLMNotConfiguredError, get_router
from src.models.schemas import (
    ChatRequest,
    ChatResponse,
    ModelList,
)
from src.utils.logger import get_logger

logger = get_logger("src.api.llm")

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/models", response_model=ModelList)
async def list_models() -> ModelList:
    """返回四档分级模型清单（含可用性）。"""
    return ModelList(models=get_router().get_model_list())


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """按 tier 路由调用 LLM 对话。

    未配置对应 API Key 时返回 503 + 友好错误信息。
    """
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    try:
        content, model = await get_router().chat(
            messages=messages,
            tier=req.model_tier.value,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
    except LLMNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("LLM 调用异常：%s", e)
        raise HTTPException(status_code=502, detail=f"LLM 调用失败：{e}") from e

    return ChatResponse(
        content=content, model=model, tier=req.model_tier.value, raw=None
    )
