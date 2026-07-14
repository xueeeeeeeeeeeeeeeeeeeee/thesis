"""DeepSeek Provider。

封装 DeepSeek（R1 / V3 / V4）的 OpenAI 兼容 HTTP 调用，使用 httpx 异步客户端。
支持 reasoning 模型（deepseek-reasoner），可返回思考过程（reasoning_content）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.llm.providers.deepseek")


@dataclass
class ChatResult:
    """LLM 调用结果，content 是正文，reasoning 是推理过程（可选）。"""
    content: str
    reasoning: str = ""


class DeepSeekProvider:
    """DeepSeek API 封装。"""

    def __init__(self) -> None:
        self.api_key: str = settings.deepseek_api_key or ""
        self.base_url: str = settings.deepseek_base_url.rstrip("/")
        self.timeout: float = 180.0

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        """调用 DeepSeek chat completions 接口，返回正文文本。"""
        result = await self.chat_with_reasoning(messages, model, temperature, max_tokens)
        return result.content

    async def chat_with_reasoning(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> ChatResult:
        """调用 DeepSeek chat completions 接口，返回含推理过程的完整结果。

        对于 reasoning 模型（deepseek-reasoner），API 会在 message 中返回
        reasoning_content 字段（思考过程）和 content 字段（最终答案）。
        """
        if not self.available:
            raise RuntimeError("DeepSeek API Key 未配置")

        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        # reasoning 模型不支持 temperature 参数
        if "reasoner" not in model.lower():
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        try:
            message = data["choices"][0]["message"]
            content = message.get("content", "") or ""
            reasoning = message.get("reasoning_content", "") or ""
            if reasoning:
                logger.info("DeepSeek reasoning 模型返回了 %d 字符的思考过程", len(reasoning))
            return ChatResult(content=content, reasoning=reasoning)
        except (KeyError, IndexError) as e:
            logger.error("DeepSeek 返回解析失败：%s | data=%s", e, data)
            raise RuntimeError(f"DeepSeek 响应解析失败：{e}") from e
