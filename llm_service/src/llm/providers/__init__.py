"""LLM Provider 包。

每个 provider 封装一个 OpenAI 兼容的 HTTP 客户端，使用 httpx 直接调用，
不依赖 langchain-openai，避免额外依赖与初始化开销。
"""

from src.llm.providers.deepseek import DeepSeekProvider
from src.llm.providers.kimi import KimiProvider
from src.llm.providers.qwen import QwenProvider

__all__ = ["DeepSeekProvider", "KimiProvider", "QwenProvider"]
