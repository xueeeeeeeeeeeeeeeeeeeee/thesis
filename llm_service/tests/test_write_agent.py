from __future__ import annotations

import pytest

from src.agents.write_agent import _resolve_discipline_profile, node


@pytest.mark.parametrize(
    ("discipline", "profile_key", "required_sections", "metric"),
    [
        ("NLP", "nlp", {"relatedWork", "experimentSetup", "errorAnalysis"}, "F1"),
        ("CV", "cv", {"relatedWork", "experimentSetup", "errorAnalysis"}, "mAP"),
        ("Bio", "biology", {"method", "results", "discussion"}, "效应量"),
        ("Material", "material", {"method", "characterization", "limitations"}, "力学"),
        ("Chem", "chemistry", {"method", "characterization", "safety"}, "产率"),
        ("Physics", "physics", {"theory", "method", "discussion"}, "不确定度"),
        ("ML", "ml", {"relatedWork", "experimentSetup", "errorAnalysis"}, "方差"),
        ("IR", "ir", {"relatedWork", "experimentSetup", "errorAnalysis"}, "nDCG"),
    ],
)
def test_resolve_discipline_profile(discipline, profile_key, required_sections, metric):
    profile = _resolve_discipline_profile(discipline)

    assert profile["key"] == profile_key
    assert required_sections <= set(profile["sections"])
    assert metric in profile["evidence"]


def test_material_societal_impact_uses_review_and_governance_profile():
    profile = _resolve_discipline_profile("Material", "新材料对人类社会的影响")

    assert profile["key"] == "material"
    assert profile["approach"] == "societal_impact"
    assert {"conceptualFramework", "socialImpact", "governance"} <= set(profile["sections"])
    assert "利益相关方" in profile["method"]
    assert "XRD" not in profile["method"]


async def test_node_uses_nlp_agents_and_sections(monkeypatch):
    async def fake_generate(prompt: str, tier: str = "default") -> str:
        if "相同键的 JSON" in prompt:
            return ""
        return "本节为待验证的专业内容，不包含虚构实验数据。"

    monkeypatch.setattr("src.agents.write_agent.llm_generate", fake_generate)
    result = await node(
        {
            "project_id": "p-1",
            "question": "如何改进文本分类？",
            "discipline": "NLP",
            "word_limit": 1200,
            "literature": [],
            "experiment_design": {},
            "experiment_results": {},
            "evaluation": {},
            "artifacts": {},
            "history": [],
            "errors": [],
        }
    )

    assert {"relatedWork", "experimentSetup", "errorAnalysis"} <= set(result["paper_sections"])
    plan = result["artifacts"]["writing_plan"]
    assert plan["discipline_profile"] == "nlp"
    assert any("NLP" in agent["role"] for agent in plan["agents"])
