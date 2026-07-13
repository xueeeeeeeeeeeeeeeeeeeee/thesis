"""Qwen (DashScope) Provider。

封装 Qwen 备用模型的 OpenAI 兼容 HTTP 调用。
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("src.llm.providers.qwen")


class QwenProvider:
    """Qwen API 封装。"""

    def __init__(self) -> None:
        self.api_key: str = settings.qwen_api_key or ""
        self.base_url: str = settings.qwen_base_url.rstrip("/")
        self.timeout: float = 120.0

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str = "qwen-plus",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        """调用 Qwen chat completions 接口。"""
        if not self.available:
            raise RuntimeError("Qwen API Key 未配置")

        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
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
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            logger.error("Qwen 返回解析失败：%s | data=%s", e, data)
            raise RuntimeError(f"Qwen 响应解析失败：{e}") from e
