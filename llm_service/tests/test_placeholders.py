"""占位函数与 state 工具函数单元测试。

测试 src.agents 中的：
- placeholder_* 系列：LLM 失败时的占位输出
- append_history / append_error / append_hil_queue / snapshot / append_version / merge_artifacts
"""

from __future__ import annotations

from src.agents import (
    append_error,
    append_hil_queue,
    append_history,
    append_version,
    merge_artifacts,
    placeholder_design,
    placeholder_discussion,
    placeholder_evaluation,
    placeholder_experiment,
    placeholder_figures,
    placeholder_literature,
    placeholder_paper_sections,
    placeholder_submission,
    snapshot,
)


# ============================================================================
# placeholder_* 测试
# ============================================================================


class TestPlaceholderLiterature:
    def test_returns_list_of_n(self):
        # placeholder_literature(question, n=3) 返回长度 3 的 list
        result = placeholder_literature("test question", n=3)
        assert isinstance(result, list)
        assert len(result) == 3

    def test_each_item_has_required_fields(self):
        # 每项含必要字段
        result = placeholder_literature("test", n=2)
        for item in result:
            assert "title" in item
            assert "abstract" in item
            assert "authors" in item
            assert "year" in item
            assert "source" in item
            assert item["source"] == "placeholder"

    def test_n_capped_at_seeds(self):
        # n 超过种子数（5）时返回最多 5 条
        result = placeholder_literature("test", n=10)
        assert len(result) <= 5

    def test_question_embedded_in_title(self):
        # question 应嵌入 title
        result = placeholder_literature("我的问题", n=1)
        assert "我的问题" in result[0]["title"]


class TestPlaceholderDesign:
    def test_returns_dict_with_required_fields(self):
        result = placeholder_design("test")
        assert isinstance(result, dict)
        for key in ("hypothesis", "variables", "metrics", "dataset", "method_steps", "plan"):
            assert key in result

    def test_question_embedded(self):
        result = placeholder_design("我的问题")
        assert "我的问题" in result["hypothesis"]


class TestPlaceholderExperiment:
    def test_returns_dict_with_code_logs_metrics(self):
        result = placeholder_experiment()
        assert isinstance(result, dict)
        assert "code" in result
        assert "logs" in result
        assert "metrics" in result
        assert isinstance(result["logs"], list)
        assert isinstance(result["metrics"], dict)


class TestPlaceholderEvaluation:
    def test_returns_dict(self):
        result = placeholder_evaluation()
        assert isinstance(result, dict)
        assert "summary" in result
        assert "table" in result


class TestPlaceholderDiscussion:
    def test_returns_string(self):
        result = placeholder_discussion("test")
        assert isinstance(result, str)
        assert len(result) > 0
        assert "test" in result


class TestPlaceholderPaperSections:
    def test_returns_dict_with_six_keys(self):
        # 返回 dict 含 6 个 key
        result = placeholder_paper_sections("test")
        assert isinstance(result, dict)
        assert len(result) == 6
        for key in ("abstract", "intro", "method", "results", "discussion", "conclusion"):
            assert key in result

    def test_question_embedded(self):
        result = placeholder_paper_sections("我的问题")
        assert "我的问题" in result["abstract"]


class TestPlaceholderFigures:
    def test_returns_list_with_at_least_one(self):
        result = placeholder_figures()
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_each_figure_has_required_fields(self):
        result = placeholder_figures()
        for fig in result:
            assert "id" in fig
            assert "type" in fig
            assert "caption" in fig
            assert "data" in fig


class TestPlaceholderSubmission:
    def test_returns_dict(self):
        result = placeholder_submission("test")
        assert isinstance(result, dict)
        for key in ("target_venue", "checklist", "cover_letter", "suggestion"):
            assert key in result


# ============================================================================
# state 工具函数测试
# ============================================================================


class TestAppendHistory:
    def test_returns_new_list_with_entry(self):
        # append_history(state, entry) 返回新 list，含 ts
        state = {"history": []}
        entry = {"action": "test"}
        result = append_history(state, entry)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["action"] == "test"
        assert "ts" in result[0]

    def test_does_not_mutate_original(self):
        # 不修改原列表
        state = {"history": [{"action": "old"}]}
        original = list(state["history"])
        append_history(state, {"action": "new"})
        assert state["history"] == original

    def test_appends_to_existing(self):
        state = {"history": [{"action": "a"}]}
        result = append_history(state, {"action": "b"})
        assert len(result) == 2

    def test_handles_missing_history_key(self):
        # 缺 history 键 → 视为空
        result = append_history({}, {"action": "test"})
        assert len(result) == 1

    def test_preserves_existing_ts(self):
        # entry 已有 ts → 不覆盖
        result = append_history({}, {"action": "test", "ts": "fixed"})
        assert result[0]["ts"] == "fixed"


class TestAppendError:
    def test_returns_new_list_with_err(self):
        state = {"errors": []}
        result = append_error(state, "some error")
        assert "some error" in result

    def test_appends_to_existing(self):
        state = {"errors": ["old"]}
        result = append_error(state, "new")
        assert len(result) == 2


class TestAppendHilQueue:
    def test_appends_item(self):
        state = {"hil_queue": []}
        item = {"stage": "design"}
        result = append_hil_queue(state, item)
        assert len(result) == 1
        assert result[0]["stage"] == "design"

    def test_does_not_mutate_original(self):
        state = {"hil_queue": [{"stage": "old"}]}
        append_hil_queue(state, {"stage": "new"})
        assert len(state["hil_queue"]) == 1


class TestSnapshot:
    def test_returns_dict_with_required_fields(self):
        # snapshot(state, stage) 返回 dict 含关键字段
        state = {
            "literature": [{"a": 1}],
            "experiment_design": {"h": "x"},
            "experiment_results": {"r": 1},
            "evaluation": {"e": 1},
            "paper_sections": {"s": 1},
        }
        result = snapshot(state, "design")
        assert result["stage"] == "design"
        assert "ts" in result
        assert result["literature"] == [{"a": 1}]
        assert result["experiment_design"] == {"h": "x"}
        assert result["experiment_results"] == {"r": 1}
        assert result["evaluation"] == {"e": 1}
        assert result["paper_sections"] == {"s": 1}

    def test_handles_empty_state(self):
        result = snapshot({}, "literature")
        assert result["stage"] == "literature"
        assert result["literature"] == []
        assert result["experiment_design"] == {}


class TestAppendVersion:
    def test_appends_snapshot(self):
        state = {"versions": []}
        snap = {"stage": "design", "ts": "now"}
        result = append_version(state, snap)
        assert len(result) == 1
        assert result[0] == snap


class TestMergeArtifacts:
    def test_sets_key_to_value(self):
        # merge_artifacts(state, key, value) 返回 artifacts 含 [key]=value
        state = {"artifacts": {"existing": "old"}}
        result = merge_artifacts(state, "new_key", "new_value")
        assert result["new_key"] == "new_value"
        # 原有键保留
        assert result["existing"] == "old"

    def test_does_not_mutate_original(self):
        state = {"artifacts": {"a": 1}}
        merge_artifacts(state, "b", 2)
        assert "b" not in state["artifacts"]

    def test_handles_missing_artifacts_key(self):
        result = merge_artifacts({}, "key", "value")
        assert result["key"] == "value"
