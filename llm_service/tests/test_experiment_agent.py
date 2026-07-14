"""experiment_agent 单元测试（用户重点关注）。

重点测试 source=user 检测逻辑：
- _is_user_inputed：判断 experiment_results 是否由用户通过 HIL 注入
- _summarize_user_metrics：把用户输入的 metrics 列表摘要成可读字符串
- node：实验执行节点的用户输入分支与 LLM 回退分支
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

import pytest

from src.agents.experiment_agent import (
    _get_discipline_hint,
    _is_user_inputed,
    _summarize_user_metrics,
    node,
)
from src.models.schemas import Stage


# ============================================================================
# _is_user_inputed 测试
# ============================================================================


class TestIsUserInputed:
    """_is_user_inputed：判断 experiment_results 是否由用户注入。"""

    # ---------- 非 dict 输入 → False ----------

    def test_none_returns_false(self):
        assert _is_user_inputed(None) is False

    def test_list_returns_false(self):
        assert _is_user_inputed([]) is False

    def test_string_returns_false(self):
        assert _is_user_inputed("string") is False

    def test_int_returns_false(self):
        assert _is_user_inputed(123) is False

    # ---------- source 字段分支 ----------

    def test_source_user_returns_true(self):
        assert _is_user_inputed({"source": "user"}) is True

    def test_source_agent_returns_false(self):
        assert _is_user_inputed({"source": "agent"}) is False

    def test_source_user_uppercase_returns_false(self):
        # 源码用 == "user" 精确匹配，大写不匹配 → False
        assert _is_user_inputed({"source": "USER"}) is False

    def test_source_user_with_other_fields_returns_true(self):
        assert _is_user_inputed({"source": "user", "methodology": ""}) is True

    # ---------- methodology 兼容分支 ----------

    def test_methodology_text_returns_true(self):
        # 无 source 但有 methodology 文本 → 视为用户输入
        assert _is_user_inputed({"methodology": "对比实验"}) is True

    def test_methodology_whitespace_only_returns_false(self):
        # methodology 纯空白 → False
        assert _is_user_inputed({"methodology": "  "}) is False

    def test_methodology_empty_string_returns_false(self):
        assert _is_user_inputed({"methodology": ""}) is False

    def test_methodology_non_string_returns_false(self):
        # methodology 非字符串 → False
        assert _is_user_inputed({"methodology": 123}) is False

    # ---------- 空字典 ----------

    def test_empty_dict_returns_false(self):
        assert _is_user_inputed({}) is False


def test_material_societal_impact_hint_is_evidence_synthesis_not_lab_work():
    hint = _get_discipline_hint("Material", "新材料对人类社会的影响")

    assert "利益相关方" in hint
    assert "案例比较" in hint
    assert "XRD" not in hint
    assert "炉温" not in hint


async def test_material_societal_impact_node_prompt_avoids_lab_protocol(monkeypatch):
    captured: dict[str, str] = {}

    async def capture_prompt(prompt, tier="economical"):
        captured["prompt"] = prompt
        return ""

    monkeypatch.setattr("src.agents.experiment_agent.llm_generate", capture_prompt)
    await node(
        {
            "question": "新材料对人类社会的影响",
            "discipline": "Material",
            "experiment_design": {},
            "experiment_results": {},
            "history": [],
            "errors": [],
            "artifacts": {},
        }
    )

    assert "利益相关方" in captured["prompt"]
    assert "案例比较" in captured["prompt"]
    assert "XRD" not in captured["prompt"]
    assert "强度 200-800 MPa" not in captured["prompt"]


async def test_material_societal_impact_rejects_lab_execution_from_llm(monkeypatch):
    async def wrong_execution(prompt, tier="economical"):
        return json.dumps(
            {
                "methodology": "记录制备批次，使用 XRD 和 SEM/TEM 表征",
                "materials": "原料纯度、配比和炉温程序",
                "procedure": "1. 烧结；2. 热处理；3. XRD",
                "metrics": [{"name": "抗压强度", "value": "500", "unit": "MPa"}],
                "resultsDescription": "模拟强度提升",
                "rawLogs": "XRD scan complete",
            },
            ensure_ascii=False,
        )

    monkeypatch.setattr("src.agents.experiment_agent.llm_generate", wrong_execution)
    result = await node(
        {
            "question": "新材料对人类社会的影响",
            "discipline": "Material",
            "experiment_design": {},
            "experiment_results": {},
            "history": [],
            "errors": [],
            "artifacts": {},
        }
    )

    execution_text = str(result["experiment_results"])
    assert "利益相关方" in execution_text
    assert "案例比较" in execution_text
    assert "XRD" not in execution_text
    assert "热处理" not in execution_text


# ============================================================================
# _summarize_user_metrics 测试
# ============================================================================


class TestSummarizeUserMetrics:
    """_summarize_user_metrics：摘要用户输入的指标。"""

    def test_no_metrics_returns_default(self):
        # 无 metrics → 默认提示
        result = _summarize_user_metrics({})
        assert "无结构化指标" in result

    def test_metrics_none_returns_default(self):
        result = _summarize_user_metrics({"metrics": None})
        assert "无结构化指标" in result

    def test_metrics_dict_returns_default(self):
        # metrics 为非 list（如 dict）→ 默认提示
        result = _summarize_user_metrics({"metrics": {"accuracy": 0.9}})
        assert "无结构化指标" in result

    def test_metrics_empty_list_returns_default(self):
        result = _summarize_user_metrics({"metrics": []})
        assert "无结构化指标" in result

    def test_metrics_single_item(self):
        # 单项指标 → 拼接为 "用户输入指标：acc=0.9"
        result = _summarize_user_metrics(
            {"metrics": [{"name": "acc", "value": 0.9, "unit": ""}]}
        )
        assert "用户输入指标" in result
        assert "acc=0.9" in result

    def test_metrics_multiple_items(self):
        # 多项指标 → 全部拼接
        result = _summarize_user_metrics(
            {
                "metrics": [
                    {"name": "acc", "value": 0.9, "unit": ""},
                    {"name": "f1", "value": 0.85, "unit": ""},
                ]
            }
        )
        assert "acc=0.9" in result
        assert "f1=0.85" in result
        assert "," in result or "，" in result

    def test_metrics_with_unit(self):
        # 含 unit 的指标 → 拼接 unit
        result = _summarize_user_metrics(
            {"metrics": [{"name": "loss", "value": 0.12, "unit": "ms"}]}
        )
        assert "loss=0.12ms" in result

    def test_metrics_with_non_dict_item_skipped(self):
        # 含非 dict 项 → 跳过该项，正常处理其他项
        result = _summarize_user_metrics(
            {"metrics": ["not_a_dict", {"name": "acc", "value": 0.9, "unit": ""}]}
        )
        assert "acc=0.9" in result

    def test_metrics_all_skipped_returns_default(self):
        # 全部被跳过 → 返回 "用户输入实验结果"
        result = _summarize_user_metrics({"metrics": ["not_a_dict", 123, None]})
        # parts 为空时返回 "用户输入实验结果"
        assert "用户输入实验结果" in result


# ============================================================================
# node 测试（mock llm_generate）
# ============================================================================


@pytest.fixture
def base_state() -> dict[str, Any]:
    """构造一个基础 state，供 node 测试使用。"""
    return {
        "project_id": "proj-1",
        "question": "如何提升模型准确率？",
        "experiment_design": {"dataset": "CIFAR-10", "metrics": ["accuracy"]},
        "experiment_results": {},
        "history": [],
        "errors": [],
        "artifacts": {},
    }


class TestNodeUserInputBranch:
    """node：用户输入分支（_is_user_inputed=True 时跳过 LLM）。"""

    async def test_user_input_skips_llm(self, base_state, monkeypatch):
        # 分支 A：state 含 experiment_results 且 _is_user_inputed 为 True
        # → 跳过 LLM，直接构造结果
        user_results = {
            "source": "user",
            "methodology": "对比实验",
            "metrics": [{"name": "acc", "value": 0.92, "unit": ""}],
        }
        base_state["experiment_results"] = user_results

        # 用一个会失败的 mock 验证 LLM 没被调用
        call_count = 0

        async def _fail_llm(prompt, tier="economical"):
            nonlocal call_count
            call_count += 1
            raise AssertionError("LLM 不应被调用")

        monkeypatch.setattr("src.agents.experiment_agent.llm_generate", _fail_llm)

        result = await node(base_state)

        assert call_count == 0
        # stage 应为 EXPERIMENT
        assert result["stage"] == Stage.EXPERIMENT
        # experiment_results 应保留用户输入并标记 status/source
        er = result["experiment_results"]
        assert er["source"] == "user"
        assert er["status"] == "completed"
        assert er["methodology"] == "对比实验"
        assert er["question"] == base_state["question"]
        # history 应含一条 experiment_user_input 记录
        assert len(result["history"]) == 1
        assert result["history"][0]["action"] == "experiment_user_input"
        # artifacts["experiment"] 是 payload，内含 experiment 与 metrics 两个键
        assert "experiment" in result["artifacts"]
        payload = result["artifacts"]["experiment"]
        assert "experiment" in payload
        assert "metrics" in payload

    async def test_user_input_via_methodology(self, base_state, monkeypatch):
        # 兼容分支：无 source 但有 methodology → 也走用户输入路径
        base_state["experiment_results"] = {"methodology": "消融实验"}

        called = False

        async def _fail_llm(prompt, tier="economical"):
            nonlocal called
            called = True
            return ""

        monkeypatch.setattr("src.agents.experiment_agent.llm_generate", _fail_llm)

        result = await node(base_state)
        assert not called
        # 走用户输入分支后 source 被强制设为 "user"
        assert result["experiment_results"]["source"] == "user"


class TestNodeLLMBranch:
    """node：LLM 回退分支。"""

    async def test_llm_returns_empty_goes_placeholder(self, base_state, monkeypatch):
        # 分支 B：mock llm_generate 返回空串 → 走 placeholder 路径
        async def _empty_llm(prompt, tier="economical"):
            return ""

        monkeypatch.setattr("src.agents.experiment_agent.llm_generate", _empty_llm)

        result = await node(base_state)
        er = result["experiment_results"]
        assert er["source"] == "agent"
        assert er["status"] == "placeholder"
        # placeholder_experiment 应含 code/logs/metrics
        assert "code" in er
        assert "logs" in er
        assert "metrics" in er
        # history 应为 experiment_run
        assert result["history"][0]["action"] == "experiment_run"

    async def test_llm_returns_json_with_code(self, base_state, monkeypatch):
        # 分支 B：mock llm_generate 返回带 code 的 JSON → 走兼容旧版转换路径
        llm_output = json.dumps(
            {
                "code": "import torch\nmodel = torch.nn.Linear(10, 2)",
                "logs": ["[INFO] training", "[INFO] done"],
                "metrics": {"accuracy": 0.88, "f1": 0.82},
            }
        )

        async def _json_llm(prompt, tier="economical"):
            return llm_output

        monkeypatch.setattr("src.agents.experiment_agent.llm_generate", _json_llm)

        result = await node(base_state)
        er = result["experiment_results"]
        assert er["source"] == "agent"
        assert er["status"] == "completed"
        # 兼容旧版格式被转换为新 schema
        assert er["methodology"]  # 非空
        assert er["procedure"] == "import torch\nmodel = torch.nn.Linear(10, 2)"
        # metrics 从 dict 转为 list
        assert isinstance(er["metrics"], list)
        names = [m["name"] for m in er["metrics"]]
        assert "accuracy" in names
        assert "f1" in names

    async def test_llm_returns_structured_json(self, base_state, monkeypatch):
        # 分支 B：mock llm_generate 返回增强版结构化 JSON → 直接采用
        llm_output = json.dumps(
            {
                "source": "agent",
                "methodology": "对比实验方法",
                "materials": "CIFAR-10 数据集，50000 张训练图片",
                "procedure": "1. 数据预处理\n2. 模型构建\n3. 训练\n4. 评估",
                "metrics": [
                    {"name": "accuracy", "value": "0.88", "unit": "", "note": "基线 0.82"},
                    {"name": "f1", "value": "0.85", "unit": "", "note": ""},
                ],
                "resultsDescription": "模型在测试集上达到 88% 准确率。",
                "rawLogs": "[10:00] [INFO] training started\n[10:05] [INFO] done",
            }
        )

        async def _json_llm(prompt, tier="economical"):
            return llm_output

        monkeypatch.setattr("src.agents.experiment_agent.llm_generate", _json_llm)

        result = await node(base_state)
        er = result["experiment_results"]
        assert er["source"] == "agent"
        assert er["status"] == "completed"
        assert er["methodology"] == "对比实验方法"
        assert er["materials"] == "CIFAR-10 数据集，50000 张训练图片"
        assert er["procedure"] == "1. 数据预处理\n2. 模型构建\n3. 训练\n4. 评估"
        assert len(er["metrics"]) == 2
        assert er["metrics"][0]["name"] == "accuracy"
        assert er["resultsDescription"] == "模型在测试集上达到 88% 准确率。"

    async def test_llm_returns_no_code_goes_placeholder(self, base_state, monkeypatch):
        # LLM 返回 JSON 但无 methodology 和 code → 走 placeholder
        async def _no_code_llm(prompt, tier="economical"):
            return json.dumps({"logs": ["no code here"]})

        monkeypatch.setattr("src.agents.experiment_agent.llm_generate", _no_code_llm)

        result = await node(base_state)
        er = result["experiment_results"]
        assert er["status"] == "placeholder"
