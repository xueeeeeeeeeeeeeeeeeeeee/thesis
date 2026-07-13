"""pytest 共享 fixture。

为单元测试提供统一的 mock 环境：
- mock_settings：把 src.config.settings 的 api_keys 替换为空，base_urls 用默认值
- mock_router：mock 掉 src.llm.router.router.chat，避免真实调用 LLM
- client：FastAPI TestClient（可选，用于 API 层测试）
"""

from __future__ import annotations

import os
import sys
from typing import Any

import pytest

# 把 llm_service 根目录加入 sys.path，使测试可以 import src.xxx
sys.path.insert(0, os.path.dirname(__file__))


@pytest.fixture
def mock_settings(monkeypatch: pytest.MonkeyPatch) -> Any:
    """替换 src.config.settings 的 api_keys 为空，base_urls 为默认值。"""
    from src import config

    monkeypatch.setattr(config.settings, "deepseek_api_key", "", raising=False)
    monkeypatch.setattr(config.settings, "kimi_api_key", "", raising=False)
    monkeypatch.setattr(config.settings, "qwen_api_key", "", raising=False)
    monkeypatch.setattr(
        config.settings, "deepseek_base_url", "https://api.deepseek.com", raising=False
    )
    monkeypatch.setattr(
        config.settings, "kimi_base_url", "https://api.moonshot.cn/v1", raising=False
    )
    monkeypatch.setattr(
        config.settings,
        "qwen_base_url",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
        raising=False,
    )
    return config.settings


@pytest.fixture
def mock_router(monkeypatch: pytest.MonkeyPatch) -> Any:
    """mock src.llm.router.router.chat，返回空字符串。

    直接 patch 模块级单例的 chat 方法，避免真实 HTTP 调用。
    """
    from src.llm import router as router_mod

    async def _fake_chat(messages, tier="economical", temperature=0.7, max_tokens=None):
        return ("", "mock-model")

    monkeypatch.setattr(router_mod.router, "chat", _fake_chat)
    return router_mod.router


@pytest.fixture
def client(mock_settings: Any, mock_router: Any):
    """FastAPI TestClient，依赖 mock_settings 与 mock_router。

    延迟导入 src.main 以避免在未配置 LLM 时副作用过大。
    """
    from fastapi.testclient import TestClient

    from src.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
