from __future__ import annotations

from src.agents.design_agent import _get_discipline_hint, node


def test_material_societal_impact_design_hint_uses_review_method():
    hint = _get_discipline_hint("Material", "新材料对人类社会的影响")

    assert "系统性文献综述" in hint
    assert "利益相关方" in hint
    assert "XRD" not in hint


async def test_material_societal_impact_design_prompt_avoids_lab_protocol(monkeypatch):
    captured: dict[str, str] = {}

    async def capture_prompt(prompt, tier="economical"):
        captured["prompt"] = prompt
        return ""

    monkeypatch.setattr("src.agents.design_agent.llm_generate", capture_prompt)
    await node(
        {
            "question": "新材料对人类社会的影响",
            "discipline": "Material",
            "literature": [],
            "history": [],
            "errors": [],
            "artifacts": {},
        }
    )

    assert "系统性文献综述" in captured["prompt"]
    assert "案例比较" in captured["prompt"]
    assert "XRD" not in captured["prompt"]
    assert "热处理" not in captured["prompt"]


async def test_material_societal_impact_rejects_lab_design_from_llm(monkeypatch):
    async def wrong_design(prompt, tier="economical"):
        return """{
          "hypothesis": "热处理提高材料强度",
          "variables": {"independent": ["炉温"], "dependent": ["强度"], "control": []},
          "metrics": ["XRD", "SEM/TEM"],
          "dataset": "原料和烧结炉",
          "method_steps": ["配比", "热处理", "XRD表征"]
        }"""

    monkeypatch.setattr("src.agents.design_agent.llm_generate", wrong_design)
    result = await node(
        {
            "question": "新材料对人类社会的影响",
            "discipline": "Material",
            "literature": [],
            "history": [],
            "errors": [],
            "artifacts": {},
        }
    )

    design_text = str(result["experiment_design"])
    assert "利益相关方" in design_text
    assert "案例比较" in design_text
    assert "XRD" not in design_text
    assert "热处理" not in design_text
