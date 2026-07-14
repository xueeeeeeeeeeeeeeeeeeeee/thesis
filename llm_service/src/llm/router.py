"""LLM 路由层。

四档分级路由（默认使用 DeepSeek V4 系列，2026-04 发布）：
- strong      → deepseek-v4-pro    1.6T 总参 / 49B 激活，强推理
- economical  → deepseek-v4-flash  284B 总参 / 13B 激活，速度快价格低
- long_text   → deepseek-v4-pro    1M context 充当长文（替代 Kimi 200K）
- embedding   → bge-m3             向量化（懒加载 sentence-transformers）

对外提供：
- async chat(messages, tier="economical") -> str
- async embed(texts) -> list[list[float]]
- get_model_list() -> list[ModelInfo]
- API Key 未配置时抛出 LLMNotConfiguredError，由 API 层转 503 友好错误，不崩溃。
"""

from __future__ import annotations

from typing import Any, Optional

from src.config import settings
from src.models.schemas import ModelInfo, ModelTier
from src.utils.logger import get_logger
from src.llm.providers.deepseek import ChatResult, DeepSeekProvider
from src.llm.providers.kimi import KimiProvider
from src.llm.providers.qwen import QwenProvider

logger = get_logger("src.llm.router")


class LLMNotConfiguredError(RuntimeError):
    """调用 LLM 时未配置对应 API Key 的友好错误。"""

    def __init__(self, tier: str, provider: str) -> None:
        self.tier = tier
        self.provider = provider
        super().__init__(
            f"未配置 {provider} 的 API Key，无法使用 tier='{tier}'。"
            f"请在 .env 中配置对应的 *_API_KEY 后重试。"
        )


# 嵌入模型懒加载单例（sentence-transformers，重型依赖）
# 模块级共享，供 router.embed（async）与 rag/vectorstore（sync）共用同一实例
_embedding_model_instance: Any = None


def get_embedder() -> Any:
    """懒加载并返回 SentenceTransformer 嵌入模型实例（同步）。

    首次调用时才导入 sentence-transformers 并加载权重，避免启动时下载。
    多次调用返回同一实例。
    """
    global _embedding_model_instance
    if _embedding_model_instance is None:
        logger.info("首次加载嵌入模型：%s（懒加载）", settings.embedding_model)
        from sentence_transformers import SentenceTransformer

        _embedding_model_instance = SentenceTransformer(settings.embedding_model)
    return _embedding_model_instance


def embed_sync(texts: list[str]) -> list[list[float]]:
    """同步向量化接口（供 ChromaDB 等同步上下文使用）。"""
    if not texts:
        return []
    model = get_embedder()
    vectors = model.encode(texts, convert_to_numpy=True)
    return [list(map(float, v)) for v in vectors]


class LLMRouter:
    """LLM 四档分级路由。"""

    def __init__(self) -> None:
        self.deepseek = DeepSeekProvider()
        self.kimi = KimiProvider()
        self.qwen = QwenProvider()

    # ------------------------------------------------------------------
    # 模型清单
    # ------------------------------------------------------------------
    def get_model_list(self) -> list[ModelInfo]:
        """返回四档分级模型清单（含可用性）。"""
        return [
            ModelInfo(
                tier=ModelTier.STRONG.value,
                provider="deepseek",
                model=settings.deepseek_deep_model,
                available=self.deepseek.available,
                description="强推理（DeepSeek V4 Pro，1.6T 总参 / 49B 激活）",
            ),
            ModelInfo(
                tier=ModelTier.ECONOMICAL.value,
                provider="deepseek",
                model=settings.deepseek_fast_model,
                available=self.deepseek.available,
                description="经济（DeepSeek V4 Flash，284B 总参 / 13B 激活）",
            ),
            ModelInfo(
                tier=ModelTier.LONG_TEXT.value,
                provider="deepseek",
                model=settings.deepseek_long_model,
                available=self.deepseek.available,
                description="长文本（DeepSeek V4 Pro 1M context，替代 Kimi 200K）",
            ),
            ModelInfo(
                tier=ModelTier.REASONING.value,
                provider="deepseek",
                model=settings.deepseek_reasoning_model,
                available=self.deepseek.available,
                description="推理模型（deepseek-reasoner，先思考再输出）",
            ),
            ModelInfo(
                tier=ModelTier.EMBEDDING.value,
                provider="sentence-transformers",
                model=settings.embedding_model,
                available=True,  # 本地模型，按需加载
                description="向量化（bge-m3，懒加载）",
            ),
        ]

    # ------------------------------------------------------------------
    # 对话
    # ------------------------------------------------------------------
    async def chat(
        self,
        messages: list[dict[str, str]],
        tier: str = ModelTier.ECONOMICAL.value,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> tuple[str, str]:
        """按分级路由调用 LLM 对话。

        返回 (content, model_name)。
        若对应 provider 未配置 Key，抛出 LLMNotConfiguredError。
        """
        tier = tier.lower()
        logger.info("LLM 路由：tier=%s", tier)

        if tier == ModelTier.STRONG.value:
            if not self.deepseek.available:
                raise LLMNotConfiguredError(tier, "deepseek")
            model = settings.deepseek_deep_model
            content = await self.deepseek.chat(
                messages, model=model, temperature=temperature, max_tokens=max_tokens
            )
            return content, model

        if tier == ModelTier.ECONOMICAL.value:
            if not self.deepseek.available:
                raise LLMNotConfiguredError(tier, "deepseek")
            model = settings.deepseek_fast_model
            content = await self.deepseek.chat(
                messages, model=model, temperature=temperature, max_tokens=max_tokens
            )
            return content, model

        if tier == ModelTier.LONG_TEXT.value:
            if not self.deepseek.available:
                raise LLMNotConfiguredError(tier, "deepseek")
            # V4 Pro 1M context 足够当长文模型；如已配 Kimi 可走 kimi 通道
            if self.kimi.available:
                model = "moonshot-v1-200k"
                content = await self.kimi.chat(
                    messages, model=model, temperature=temperature, max_tokens=max_tokens
                )
                return content, model
            model = settings.deepseek_long_model
            content = await self.deepseek.chat(
                messages, model=model, temperature=temperature, max_tokens=max_tokens
            )
            return content, model

        if tier == ModelTier.REASONING.value:
            raise ValueError(
                "reasoning tier 请使用 chat_with_reasoning() 方法以获取思考过程"
            )

        raise ValueError(f"不支持的对话 tier：{tier}（embedding tier 仅用于向量化）")

    async def chat_with_reasoning(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> tuple[str, str]:
        """调用 reasoning 模型，返回 (content, reasoning_content)。

        使用 deepseek-reasoner 模型，先深度思考再输出最终答案。
        """
        if not self.deepseek.available:
            raise LLMNotConfiguredError("reasoning", "deepseek")
        model = settings.deepseek_reasoning_model
        result = await self.deepseek.chat_with_reasoning(
            messages, model=model, temperature=temperature, max_tokens=max_tokens
        )
        return result.content, result.reasoning

    # ------------------------------------------------------------------
    # 向量化（懒加载 sentence-transformers）
    # ------------------------------------------------------------------
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """使用 bge-m3 对文本列表进行向量化。

        sentence-transformers 在首次调用时才加载，避免启动时下载权重。
        """
        if not texts:
            return []
        # 复用同步懒加载逻辑
        return embed_sync(texts)


# 模块级单例（不触发重型依赖）
router = LLMRouter()


def get_router() -> LLMRouter:
    """获取全局 LLMRouter 单例。"""
    return router
