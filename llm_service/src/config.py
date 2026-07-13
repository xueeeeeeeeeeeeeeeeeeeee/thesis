"""配置管理模块。

使用 pydantic-settings BaseSettings 读取环境变量，导出 settings 单例。
"""

from __future__ import annotations

from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """服务全局配置。

    所有字段均从环境变量（或 .env 文件）读取，未配置时使用默认值，
    因此服务可以在没有任何 API Key 的情况下启动。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- LLM API Keys ----------
    deepseek_api_key: Optional[str] = Field(default="", description="DeepSeek API Key")
    kimi_api_key: Optional[str] = Field(default="", description="Kimi (Moonshot) API Key")
    qwen_api_key: Optional[str] = Field(default="", description="Qwen (DashScope) API Key")

    # ---------- LLM 端点 ----------
    deepseek_base_url: str = Field(
        default="https://api.deepseek.com", description="DeepSeek API 端点"
    )
    kimi_base_url: str = Field(
        default="https://api.moonshot.cn/v1", description="Kimi API 端点"
    )
    qwen_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        description="Qwen API 端点",
    )

    # ---------- LLM 默认模型（DeepSeek V4 系列）----------
    # V4 Pro：1.6T 总参 / 49B 激活，强推理（复杂任务：实验设计/评价/讨论）
    # V4 Flash：284B 总参 / 13B 激活，速度快价格低（高频任务：文献/画图/渲染）
    # V4 长文档：用 V4 Pro 的 1M context 充当长文，无需 Kimi
    deepseek_deep_model: str = Field(
        default="deepseek-v4-pro", description="强推理模型（V4 Pro，替代 R1）"
    )
    deepseek_fast_model: str = Field(
        default="deepseek-v4-flash", description="经济模型（V4 Flash，替代 V3）"
    )
    deepseek_long_model: str = Field(
        default="deepseek-v4-pro", description="长文档模型（V4 Pro 1M context，替代 Kimi 200K）"
    )

    # ---------- Embedding / Reranker ----------
    embedding_model: str = Field(default="BAAI/bge-m3", description="嵌入模型")
    reranker_model: str = Field(
        default="BAAI/bge-reranker-v2-m3", description="重排序模型"
    )

    # ---------- RAG ----------
    chroma_persist_dir: str = Field(default="./.chroma", description="ChromaDB 持久化目录")
    rag_top_k: int = Field(default=10, description="RAG 初检 top K")
    rag_rerank_top_k: int = Field(default=5, description="RAG 重排后 top K")

    # ---------- 服务 ----------
    host: str = Field(default="0.0.0.0", description="监听地址")
    port: int = Field(default=8000, description="监听端口")
    log_level: str = Field(default="INFO", description="日志级别")

    # ---------- 外部学术 API ----------
    arxiv_base_url: str = Field(
        default="http://export.arxiv.org/api/query", description="arXiv API 端点"
    )
    s2_base_url: str = Field(
        default="https://api.semanticscholar.org/graph/v1",
        description="Semantic Scholar API 端点",
    )
    openalex_base_url: str = Field(
        default="https://api.openalex.org", description="OpenAlex API 端点"
    )
    pubmed_base_url: str = Field(
        default="https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
        description="PubMed E-utilities 端点",
    )

    # ---------- 便利属性 ----------
    @property
    def has_deepseek(self) -> bool:
        return bool(self.deepseek_api_key and self.deepseek_api_key.strip())

    @property
    def has_kimi(self) -> bool:
        return bool(self.kimi_api_key and self.kimi_api_key.strip())

    @property
    def has_qwen(self) -> bool:
        return bool(self.qwen_api_key and self.qwen_api_key.strip())

    @property
    def has_any_llm(self) -> bool:
        """是否配置了至少一个 LLM API Key。"""
        return self.has_deepseek or self.has_kimi or self.has_qwen


# 单例：模块级导入即创建，不触发任何重型依赖
settings = Settings()
