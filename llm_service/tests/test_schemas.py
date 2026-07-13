"""Pydantic 数据模型单元测试。

测试 src.models.schemas 的：
- ChatRequest temperature 边界
- AgentRunRequest mode/template Literal 校验
- AgentStatus 默认值
- Document 必填/可选字段
- 各 Enum 的 value 正确
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.schemas import (
    AgentRunRequest,
    AgentStatus,
    AgentStatusEnum,
    ChatRequest,
    Document,
    DraftTemplate,
    HILAction,
    ModelTier,
    PipelineMode,
    Stage,
)
from src.models.schemas import ChatMessage


# ============================================================================
# Enum value 测试
# ============================================================================


class TestEnumValues:
    """各 Enum 的 value 正确。"""

    def test_model_tier_values(self):
        assert ModelTier.STRONG.value == "strong"
        assert ModelTier.ECONOMICAL.value == "economical"
        assert ModelTier.LONG_TEXT.value == "long_text"
        assert ModelTier.EMBEDDING.value == "embedding"

    def test_stage_values(self):
        assert Stage.LITERATURE.value == "literature"
        assert Stage.EXPERIMENT.value == "experiment"
        assert Stage.SUBMIT.value == "submit"

    def test_agent_status_enum_values(self):
        assert AgentStatusEnum.PENDING.value == "pending"
        assert AgentStatusEnum.RUNNING.value == "running"
        assert AgentStatusEnum.COMPLETED.value == "completed"
        assert AgentStatusEnum.ERROR.value == "error"

    def test_hil_action_values(self):
        assert HILAction.CONFIRM.value == "confirm"
        assert HILAction.EDIT.value == "edit"
        assert HILAction.ABORT.value == "abort"

    def test_pipeline_mode_values(self):
        assert PipelineMode.AUTO.value == "auto"
        assert PipelineMode.MANUAL.value == "manual"

    def test_draft_template_values(self):
        assert DraftTemplate.CTEX.value == "ctex"
        assert DraftTemplate.IEEE.value == "ieee"
        assert DraftTemplate.MARKDOWN.value == "markdown"


# ============================================================================
# ChatRequest 测试
# ============================================================================


class TestChatRequest:
    """ChatRequest：temperature 边界校验。"""

    def _make_messages(self):
        return [ChatMessage(role="user", content="hello")]

    def test_temperature_zero_ok(self):
        # temperature=0.0 正常
        req = ChatRequest(messages=self._make_messages(), temperature=0.0)
        assert req.temperature == 0.0

    def test_temperature_two_ok(self):
        # temperature=2.0 正常（上界）
        req = ChatRequest(messages=self._make_messages(), temperature=2.0)
        assert req.temperature == 2.0

    def test_temperature_below_zero_raises(self):
        # temperature < 0 → ValidationError
        with pytest.raises(ValidationError):
            ChatRequest(messages=self._make_messages(), temperature=-0.1)

    def test_temperature_above_two_raises(self):
        # temperature > 2.0 → ValidationError
        with pytest.raises(ValidationError):
            ChatRequest(messages=self._make_messages(), temperature=2.1)

    def test_default_temperature(self):
        # 默认 temperature=0.7
        req = ChatRequest(messages=self._make_messages())
        assert req.temperature == 0.7

    def test_default_model_tier(self):
        # 默认 model_tier=economical
        req = ChatRequest(messages=self._make_messages())
        assert req.model_tier == ModelTier.ECONOMICAL

    def test_messages_required(self):
        # messages 必填，省略该字段 → ValidationError
        # 注意：空列表 [] 是合法的 list 值，不抛错；只有完全省略才抛错
        with pytest.raises(ValidationError):
            ChatRequest()  # type: ignore[call-arg]

    def test_empty_messages_allowed(self):
        # 空列表是合法的 list 值（pydantic 不强制 min_items）
        req = ChatRequest(messages=[])
        assert req.messages == []


# ============================================================================
# AgentRunRequest 测试
# ============================================================================


class TestAgentRunRequest:
    """AgentRunRequest：mode/template Literal 校验。"""

    def _base_kwargs(self):
        return {"project_id": "p1", "question": "test question"}

    def test_mode_auto_ok(self):
        req = AgentRunRequest(mode="auto", **self._base_kwargs())
        assert req.mode == "auto"

    def test_mode_manual_ok(self):
        req = AgentRunRequest(mode="manual", **self._base_kwargs())
        assert req.mode == "manual"

    def test_mode_invalid_raises(self):
        # 非 auto/manual → ValidationError
        with pytest.raises(ValidationError):
            AgentRunRequest(mode="invalid", **self._base_kwargs())

    def test_template_markdown_ok(self):
        req = AgentRunRequest(template="markdown", **self._base_kwargs())
        assert req.template == "markdown"

    def test_template_ctex_ok(self):
        req = AgentRunRequest(template="ctex", **self._base_kwargs())
        assert req.template == "ctex"

    def test_template_ieee_ok(self):
        req = AgentRunRequest(template="ieee", **self._base_kwargs())
        assert req.template == "ieee"

    def test_template_journal_ok(self):
        req = AgentRunRequest(template="journal", **self._base_kwargs())
        assert req.template == "journal"

    def test_template_invalid_raises(self):
        # 非法 template → ValidationError
        with pytest.raises(ValidationError):
            AgentRunRequest(template="unknown", **self._base_kwargs())

    def test_defaults(self):
        # 默认 mode=auto, template=markdown, discipline=general
        req = AgentRunRequest(**self._base_kwargs())
        assert req.mode == "auto"
        assert req.template == "markdown"
        assert req.discipline == "general"

    def test_required_fields_missing_raises(self):
        # project_id / question 必填
        with pytest.raises(ValidationError):
            AgentRunRequest(question="q")  # type: ignore[call-arg]
        with pytest.raises(ValidationError):
            AgentRunRequest(project_id="p")  # type: ignore[call-arg]


# ============================================================================
# AgentStatus 测试
# ============================================================================


class TestAgentStatus:
    """AgentStatus：默认值。"""

    def test_default_values(self):
        # 默认值：literature=[]、experiment_design={} 等
        status = AgentStatus(
            agent_id="a1",
            project_id="p1",
            question="q",
            discipline="general",
            stage="literature",
            status=AgentStatusEnum.RUNNING,
        )
        assert status.literature == []
        assert status.experiment_design == {}
        assert status.experiment_results == {}
        assert status.evaluation == {}
        assert status.discussion == ""
        assert status.paper_sections == {}
        assert status.figures == []
        assert status.submission == {}
        assert status.artifacts == {}
        assert status.history == []
        assert status.errors == []
        assert status.hil_pending is None

    def test_mode_default(self):
        status = AgentStatus(
            agent_id="a1",
            project_id="p1",
            question="q",
            discipline="general",
            stage="literature",
            status=AgentStatusEnum.RUNNING,
        )
        assert status.mode == "auto"
        assert status.template == "markdown"


# ============================================================================
# Document 测试
# ============================================================================


class TestDocument:
    """Document：必填/可选字段。"""

    def test_content_required(self):
        # content 必填
        doc = Document(content="some text")
        assert doc.content == "some text"

    def test_content_missing_raises(self):
        # 缺 content → ValidationError
        with pytest.raises(ValidationError):
            Document()  # type: ignore[call-arg]

    def test_title_optional_default_empty(self):
        # title 可选，默认 ""
        doc = Document(content="text")
        assert doc.title == ""

    def test_metadata_optional_default_empty(self):
        # metadata 可选，默认 {}
        doc = Document(content="text")
        assert doc.metadata == {}

    def test_full_document(self):
        doc = Document(
            title="Paper",
            content="content",
            metadata={"year": 2024, "source": "arxiv"},
        )
        assert doc.title == "Paper"
        assert doc.metadata["year"] == 2024
