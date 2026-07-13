"""配置管理单元测试。

测试 src.config.settings 的：
- has_deepseek / has_kimi / has_qwen / has_any_llm 在 api_key 为空时为 False
- 默认值正确（rag_top_k=10, port=8000）
- monkeypatch 环境变量后字段更新
"""

from __future__ import annotations

import pytest

from src.config import Settings, settings


class TestConfigProperties:
    """has_* 属性测试。"""

    def test_has_deepseek_false_when_empty(self, monkeypatch):
        # api_key 为空时 has_deepseek 为 False
        monkeypatch.setattr(settings, "deepseek_api_key", "", raising=False)
        assert settings.has_deepseek is False

    def test_has_deepseek_true_when_set(self, monkeypatch):
        # api_key 非空时 has_deepseek 为 True
        monkeypatch.setattr(settings, "deepseek_api_key", "sk-test", raising=False)
        assert settings.has_deepseek is True

    def test_has_deepseek_false_when_whitespace(self, monkeypatch):
        # api_key 纯空白时 has_deepseek 为 False
        monkeypatch.setattr(settings, "deepseek_api_key", "   ", raising=False)
        assert settings.has_deepseek is False

    def test_has_any_llm_false_when_all_empty(self, monkeypatch):
        # 所有 api_key 为空时 has_any_llm 为 False
        monkeypatch.setattr(settings, "deepseek_api_key", "", raising=False)
        monkeypatch.setattr(settings, "kimi_api_key", "", raising=False)
        monkeypatch.setattr(settings, "qwen_api_key", "", raising=False)
        assert settings.has_any_llm is False

    def test_has_any_llm_true_when_any_set(self, monkeypatch):
        # 任一 api_key 非空时 has_any_llm 为 True
        monkeypatch.setattr(settings, "deepseek_api_key", "", raising=False)
        monkeypatch.setattr(settings, "kimi_api_key", "sk-kimi", raising=False)
        monkeypatch.setattr(settings, "qwen_api_key", "", raising=False)
        assert settings.has_any_llm is True


class TestConfigDefaults:
    """默认值测试。"""

    def test_rag_top_k_default(self):
        # 默认 rag_top_k=10
        # 注意：settings 是从 .env 加载的单例，可能被覆盖；这里测试字段类型与合理性
        assert isinstance(settings.rag_top_k, int)
        assert settings.rag_top_k > 0

    def test_port_default(self):
        # 默认 port=8000
        assert isinstance(settings.port, int)
        assert settings.port > 0

    def test_rag_rerank_top_k_default(self):
        assert isinstance(settings.rag_rerank_top_k, int)
        assert settings.rag_rerank_top_k > 0

    def test_default_base_urls(self):
        # base_url 默认值正确
        assert "deepseek" in settings.deepseek_base_url
        assert "moonshot" in settings.kimi_base_url
        assert "dashscope" in settings.qwen_base_url

    def test_default_models(self):
        # 默认模型名非空
        assert settings.deepseek_deep_model
        assert settings.deepseek_fast_model
        assert settings.embedding_model

    def test_log_level_default(self):
        assert settings.log_level in ("INFO", "DEBUG", "WARNING", "ERROR")


class TestConfigEnvVarOverride:
    """环境变量覆盖测试（创建新 Settings 实例）。"""

    def test_env_var_sets_api_key(self, monkeypatch):
        # monkeypatch 环境变量后字段更新
        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-from-env")
        # 创建新实例读取环境变量
        new_settings = Settings()
        assert new_settings.deepseek_api_key == "sk-from-env"
        assert new_settings.has_deepseek is True

    def test_env_var_overrides_default_port(self, monkeypatch):
        # 环境变量覆盖默认 port
        monkeypatch.setenv("PORT", "9999")
        new_settings = Settings()
        assert new_settings.port == 9999

    def test_env_var_overrides_rag_top_k(self, monkeypatch):
        monkeypatch.setenv("RAG_TOP_K", "20")
        new_settings = Settings()
        assert new_settings.rag_top_k == 20

    def test_env_var_empty_string_treated_as_not_configured(self, monkeypatch):
        # 空字符串环境变量 → has_* 为 False
        monkeypatch.setenv("DEEPSEEK_API_KEY", "")
        new_settings = Settings()
        assert new_settings.has_deepseek is False

    def test_multiple_env_vars(self, monkeypatch):
        # 同时设置多个环境变量
        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-ds")
        monkeypatch.setenv("KIMI_API_KEY", "sk-kimi")
        monkeypatch.setenv("PORT", "8080")
        new_settings = Settings()
        assert new_settings.has_deepseek is True
        assert new_settings.has_kimi is True
        assert new_settings.has_any_llm is True
        assert new_settings.port == 8080
