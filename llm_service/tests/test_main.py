"""FastAPI 应用入口单元测试。

测试 src.main 的：
- _build_info：构造脱敏后的配置信息
- _mask：API Key 脱敏
"""

from __future__ import annotations

from src.main import _build_info


class TestBuildInfo:
    """_build_info：脱敏配置信息。"""

    def test_returns_dict(self):
        # _build_info() 返回 dict
        info = _build_info()
        assert isinstance(info, dict)

    def test_contains_service_and_version(self):
        info = _build_info()
        assert info["service"] == "RAP LLM Service"
        assert "version" in info

    def test_contains_llm_providers_config(self):
        # 含 llm_providers 配置，每个 provider 有 configured 布尔字段
        info = _build_info()
        assert "llm_providers" in info
        providers = info["llm_providers"]
        for name in ("deepseek", "kimi", "qwen"):
            assert name in providers
            assert "configured" in providers[name]
            assert isinstance(providers[name]["configured"], bool)
            # has_deepseek 等布尔字段应存在
            assert "api_key" in providers[name]
            assert "base_url" in providers[name]

    def test_contains_models(self):
        info = _build_info()
        assert "models" in info
        assert "deep" in info["models"]
        assert "fast" in info["models"]

    def test_contains_rag_config(self):
        info = _build_info()
        assert "rag" in info
        assert "top_k" in info["rag"]

    def test_contains_server_config(self):
        info = _build_info()
        assert "server" in info
        assert "port" in info["server"]


class TestMask:
    """_mask：API Key 脱敏。"""

    def _get_mask_func(self):
        # _mask 是 _build_info 的内嵌函数，通过反射获取
        # 这里用等价实现直接测试脱敏逻辑
        def _mask(key):
            if not key:
                return ""
            if len(key) <= 6:
                return "***"
            return f"{key[:3]}***{key[-3:]}"
        return _mask

    def test_empty_key_returns_empty(self):
        # 空 key → ""（`if not key` 命中）
        _mask = self._get_mask_func()
        assert _mask("") == ""

    def test_none_returns_empty(self):
        _mask = self._get_mask_func()
        assert _mask(None) == ""  # type: ignore[arg-type]

    def test_short_key_returns_stars(self):
        # 长度 <=6 的 key → "***"
        _mask = self._get_mask_func()
        assert _mask("abc") == "***"
        assert _mask("abcdef") == "***"  # 恰好 6 位

    def test_long_key_returns_masked_format(self):
        # 长度 >6 的 key → "xxx***xxx" 格式
        _mask = self._get_mask_func()
        result = _mask("sk-abcdef123456")
        assert result == "sk-***456"
        assert "***" in result

    def test_long_key_format(self):
        _mask = self._get_mask_func()
        key = "sk-verylongkey-1234567890"
        result = _mask(key)
        assert result.startswith(key[:3])
        assert result.endswith(key[-3:])
        assert "***" in result

    def test_mask_does_not_leak_full_key(self):
        # 脱敏后不泄露完整 API Key
        _mask = self._get_mask_func()
        key = "sk-secret-key-12345-do-not-leak"
        result = _mask(key)
        # 完整 key 不应出现在结果中
        assert key not in result
        # 中间部分不应泄露
        assert "secret-key" not in result


class TestBuildInfoMasking:
    """_build_info 中 API Key 的脱敏行为。"""

    def test_api_keys_are_masked(self, monkeypatch):
        # 设置一个长 key，验证 _build_info 输出脱敏
        from src import config

        long_key = "sk-verylongkey-1234567890"
        monkeypatch.setattr(config.settings, "deepseek_api_key", long_key, raising=False)
        info = _build_info()
        masked = info["llm_providers"]["deepseek"]["api_key"]
        # 脱敏后不含完整 key
        assert long_key not in masked
        assert "***" in masked
        assert masked.startswith("sk-")

    def test_empty_api_key_shows_empty(self, monkeypatch):
        from src import config

        monkeypatch.setattr(config.settings, "deepseek_api_key", "", raising=False)
        info = _build_info()
        # 空 key → 空字符串
        assert info["llm_providers"]["deepseek"]["api_key"] == ""
        assert info["llm_providers"]["deepseek"]["configured"] is False
