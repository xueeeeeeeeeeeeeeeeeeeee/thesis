"""Orchestrator 辅助函数单元测试。

测试 src.agents.orchestrator._format_hil_message：
- design：填充文献数量 {n}
- experiment：附带 experiment_design
- discuss：填充指标 {metric}={value}（list / dict / 空三种）
- figure：填充章节数量 {n}
- 未知 stage：返回默认消息
"""

from __future__ import annotations

from src.agents.orchestrator import _format_hil_message


class TestFormatHilMessage:
    """_format_hil_message：根据 state 填充 HIL 提示模板。"""

    # ---------- design 阶段 ----------

    def test_design_with_literature_list(self):
        # design 阶段，state_values 含 literature list → 消息含 len(literature) 填充的 {n}
        state = {"literature": [{"title": "a"}, {"title": "b"}, {"title": "c"}]}
        result = _format_hil_message("design", state)
        assert result["stage"] == "design"
        assert "3" in result["message"]
        assert "文献调研完成" in result["message"]

    def test_design_with_empty_literature(self):
        # literature 为空 list → {n} 填充为 0
        result = _format_hil_message("design", {"literature": []})
        assert "0" in result["message"]

    def test_design_with_non_list_literature(self):
        # literature 为非 list（如 None）→ 合理处理（n=0）
        result = _format_hil_message("design", {"literature": None})
        assert "0" in result["message"]

    def test_design_missing_literature_key(self):
        # 缺 literature 键 → n=0
        result = _format_hil_message("design", {})
        assert "0" in result["message"]

    # ---------- experiment 阶段 ----------

    def test_experiment_contains_experiment_design(self):
        # experiment 阶段 → 消息含 experiment_design 字段
        design = {"hypothesis": "test", "dataset": "CIFAR-10"}
        result = _format_hil_message("experiment", {"experiment_design": design})
        assert result["stage"] == "experiment"
        assert "experiment_design" in result
        assert result["experiment_design"] == design
        assert "实验方案" in result["message"]

    # ---------- discuss 阶段 ----------

    def test_discuss_with_list_metrics(self):
        # discuss 阶段，metrics 为 list of dict → 消息含指标信息
        state = {
            "experiment_results": {
                "metrics": [{"name": "acc", "value": 0.9, "unit": ""}]
            }
        }
        result = _format_hil_message("discuss", state)
        assert result["stage"] == "discuss"
        assert "acc" in result["message"]
        assert "0.9" in result["message"]

    def test_discuss_with_list_metrics_with_unit(self):
        # list metrics 含 unit → 拼接 unit
        state = {
            "experiment_results": {
                "metrics": [{"name": "loss", "value": 0.12, "unit": "ms"}]
            }
        }
        result = _format_hil_message("discuss", state)
        assert "loss" in result["message"]
        assert "0.12ms" in result["message"]

    def test_discuss_with_dict_metrics(self):
        # discuss 阶段，metrics 为 dict → 消息含 accuracy 信息
        state = {
            "experiment_results": {"metrics": {"accuracy": 0.9, "f1": 0.85}}
        }
        result = _format_hil_message("discuss", state)
        assert "accuracy" in result["message"]
        assert "0.9" in result["message"]

    def test_discuss_with_empty_metrics(self):
        # discuss 阶段，metrics 为空 → 合理处理（用 n/a 占位）
        result = _format_hil_message("discuss", {"experiment_results": {}})
        assert "metric" in result["message"]
        assert "n/a" in result["message"]

    def test_discuss_with_none_metrics(self):
        # metrics 为 None
        result = _format_hil_message(
            "discuss", {"experiment_results": {"metrics": None}}
        )
        assert "n/a" in result["message"]

    # ---------- figure 阶段 ----------

    def test_figure_with_paper_sections(self):
        # figure 阶段，state_values 含 paper_sections → 消息含 len(paper_sections)
        sections = {"intro": "x", "method": "y", "results": "z"}
        result = _format_hil_message("figure", {"paper_sections": sections})
        assert result["stage"] == "figure"
        assert "3" in result["message"]
        assert "章节" in result["message"]

    def test_figure_with_empty_sections(self):
        result = _format_hil_message("figure", {"paper_sections": {}})
        assert "0" in result["message"]

    # ---------- 未知 stage ----------

    def test_unknown_stage_returns_default_message(self):
        # 未知 stage → 返回默认消息
        result = _format_hil_message("unknown_stage", {})
        assert result["stage"] == "unknown_stage"
        assert "message" in result
        assert len(result["message"]) > 0

    # ---------- 返回结构 ----------

    def test_return_contains_required_fields(self):
        # 返回 dict 应含 stage / interrupted_after / title / message
        result = _format_hil_message("design", {"literature": []})
        for key in ("stage", "interrupted_after", "title", "message"):
            assert key in result
