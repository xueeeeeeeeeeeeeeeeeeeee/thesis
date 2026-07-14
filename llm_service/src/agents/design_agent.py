"""实验设计 Agent（design）。

基于文献生成实验方案：构造 DESIGN_PROMPT → 调 LLM (economical / V4 Flash) →
解析 JSON 拿到 hypothesis / variables / metrics / dataset / method_steps。
LLM 失败时降级为占位方案。
"""

from __future__ import annotations

import json
import re
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_design,
    safe_json_loads,
)
from src.agents.discipline_profiles import resolve_discipline_profile
from src.agents.state import AgentState
from src.llm.prompts.templates import DESIGN_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.design")


# 学科特定实验设计指导原则（告诉 LLM 应遵循什么规范，而非替它写好内容）
_DISCIPLINE_HINTS: dict[str, str] = {
    "material": (
        "材料科学实验设计原则：\n"
        "- 必须围绕科研问题设计具体的材料体系、制备路线和表征方案\n"
        "- 原料：需写明具体材料名称、来源、纯度和粒径\n"
        "- 制备工艺：需针对具体材料设计温度程序、成型方式和热处理参数\n"
        "- 表征：根据研究目标选择 XRD/SEM/TEM/粒度/密度等表征手段\n"
        "- 性能测试：根据材料类型选择力学/电学/热学/光学等性能测试\n"
        "- 指标范围参考：抗压强度(MPa)、硬度(HV)、密度(g/cm³)、电导率(S/m)、孔隙率(%)\n"
        "- 严禁使用计算机科学指标（accuracy/f1/loss 等）\n"
        "- 每组至少 3 个平行样品，报告均值与标准差"
    ),
    "chemistry": (
        "化学实验设计原则：\n"
        "- 必须围绕科研问题设计具体的合成路线和反应条件\n"
        "- 试剂：需写明具体试剂名称、纯度、当量和溶剂\n"
        "- 反应条件：温度、时间、气氛、搅拌、加料顺序\n"
        "- 表征：NMR/MS/IR/色谱/元素分析\n"
        "- 指标：产率(%)、选择性(%)、纯度(%)、转化率(%)\n"
        "- 安全：危害评估、废物处理"
    ),
    "biology": (
        "生物实验设计原则：\n"
        "- 必须围绕科研问题设计具体的实验组和对照组\n"
        "- 样本：来源、伦理审批、组别设计\n"
        "- 重复：独立生物学重复 ≥3\n"
        "- 检测：qPCR/Western blot/IHC/流式/测序\n"
        "- 指标：表达量（倍数变化）、P值、效应量、置信区间\n"
        "- 统计学：t-test/ANOVA、多重比较校正"
    ),
    "physics": (
        "物理实验设计原则：\n"
        "- 必须围绕科研问题建立理论模型或实验方案\n"
        "- 理论：控制方程、边界条件、量纲分析\n"
        "- 装置/数值方法：设备参数、网格、时间步长\n"
        "- 指标：物理量(SI单位)、不确定度、拟合优度(R²)、相对误差\n"
        "- 严禁使用非物理学的指标"
    ),
    "nlp": (
        "NLP 实验设计原则：\n"
        "- 数据集：名称、划分、语言、规模\n"
        "- 基线：模型名称和复现设置\n"
        "- 指标：accuracy/F1/BLEU/ROUGE\n"
        "- 显著性：bootstrap 或 paired t-test"
    ),
    "cv": (
        "计算机视觉实验设计原则：\n"
        "- 数据集：名称、类别、数量、分辨率\n"
        "- 模型：骨干网络、预训练权重\n"
        "- 指标：mAP/IoU/准确率/参数量/FLOPs"
    ),
    "ml": (
        "机器学习实验设计原则：\n"
        "- 数据集：名称、特征维度、样本量\n"
        "- 模型：假设空间、目标函数、优化器\n"
        "- 指标：accuracy/AUC/MSE/MAE/R²\n"
        "- 评估：交叉验证、显著性检验"
    ),
}

_MATERIAL_SOCIETAL_IMPACT_HINT = (
    "材料科学与社会影响研究设计：\n"
    "- 研究类型：系统性文献综述、典型案例比较、生命周期与社会影响评价\n"
    "- 研究范围：明确材料类别、技术成熟度、应用场景、地域和时间边界\n"
    "- 证据来源：同行评议文献、官方统计、产业与政策报告、生命周期数据库\n"
    "- 分析维度：产业与就业、公共健康、生活质量、环境、公平与技术可及性\n"
    "- 利益相关方：研发机构、企业、劳动者、消费者、社区和监管者\n"
    "- 治理分析：标准监管、责任分配、公众参与、回收体系与公正转型\n"
    "- 禁止：不得强行套用与题意无关的实验室制备和表征流程"
)

_LAB_PROTOCOL_PATTERN = re.compile(
    r"XRD|SEM/?TEM|炉温|烧结|热处理|原料纯度|抗压强度|维氏硬度|电导率"
)


def _societal_impact_design(question: str) -> dict[str, Any]:
    return {
        "hypothesis": f"“{question}”的收益与风险并非由材料性能单独决定，而受到应用场景、制度安排和利益相关方分配机制共同影响。",
        "variables": {
            "independent": ["材料类别与技术成熟度", "应用场景", "地域与政策环境"],
            "dependent": ["产业与就业影响", "健康与生活质量", "环境负荷", "公平性与可及性", "治理成熟度"],
            "control": ["证据时间范围", "案例选择标准", "评价指标定义"],
        },
        "metrics": ["证据覆盖度", "案例可比性", "利益相关方覆盖", "生命周期影响", "治理成熟度"],
        "dataset": "同行评议文献、官方统计、产业与政策报告、生命周期数据及公开案例；所有来源均需检索和核验。",
        "method_steps": [
            "界定新材料类别、应用场景、地域和时间范围",
            "制定数据库检索式、纳入排除标准与证据质量规则",
            "选择不同技术成熟度和应用领域的典型案例",
            "按产业、就业、健康、环境、公平和可及性维度进行案例比较",
            "开展利益相关方分析，识别受益群体、成本承担者与责任主体",
            "综合伦理风险、标准监管、公众参与和公正转型方案",
        ],
        "plan": "已按社会影响评价研究路径纠偏；正式执行前需完成文献检索、案例选择和证据质量审阅。",
    }


def _get_discipline_hint(discipline: str, question: str = "") -> str:
    """根据学科 key 返回特定实验设计提示。"""
    profile = resolve_discipline_profile(discipline, question)
    if profile.get("approach") == "societal_impact":
        return _MATERIAL_SOCIETAL_IMPACT_HINT
    key = profile.get("key", "general")
    return _DISCIPLINE_HINTS.get(key, "请根据学科特点设计合理的实验方案。")


async def node(state: AgentState) -> dict[str, Any]:
    """实验设计节点。"""
    question = state.get("question", "") or ""
    discipline = state.get("discipline", "general")
    literature_summary = _summarize_literature(state.get("literature", []) or [])

    # 获取学科 profile
    profile = resolve_discipline_profile(discipline, question)

    # 1. 调 LLM 生成方案（注入学科方法学要求）
    prompt = DESIGN_PROMPT.format(
        question=question,
        discipline=discipline,
        discipline_label=profile.get("label", "综合学科"),
        method_requirement=profile.get("method", ""),
        evidence_requirement=profile.get("evidence", ""),
        reproducibility_requirement=profile.get("reproducibility", ""),
        literature_summary=literature_summary,
        discipline_hint=_get_discipline_hint(discipline, question),
    )
    raw = await llm_generate(prompt, tier="economical")

    # 2. 解析 LLM JSON，失败回退到占位
    parsed = safe_json_loads(raw, default=None)
    if profile.get("approach") == "societal_impact" and _LAB_PROTOCOL_PATTERN.search(
        json.dumps(parsed, ensure_ascii=False) if parsed is not None else raw
    ):
        logger.warning("社会影响研究收到实验室方案，已拒绝并改用证据综合方案")
        parsed = None
    if isinstance(parsed, dict) and parsed.get("hypothesis"):
        experiment_design: dict[str, Any] = {
            "hypothesis": parsed.get("hypothesis", ""),
            "variables": parsed.get("variables", {}) or {},
            "metrics": parsed.get("metrics", []) or [],
            "dataset": parsed.get("dataset", ""),
            "method_steps": parsed.get("method_steps", []) or [],
            "plan": raw,  # 保留原始文本，便于后续 review
        }
    elif profile.get("approach") == "societal_impact":
        experiment_design = _societal_impact_design(question)
    else:
        experiment_design = placeholder_design(question)
        experiment_design["plan"] = (
            raw
            if raw
            else f"[占位实验方案] 针对问题「{question}」的简化实验设计。"
            "（未配置 LLM 或调用失败，已返回占位结果。）"
        )

    # 3. 写 artifacts
    artifacts_payload = {
        "design": experiment_design,
        "summary": experiment_design.get("plan", ""),
    }

    return {
        "stage": Stage.DESIGN,
        "experiment_design": experiment_design,
        "artifacts": merge_artifacts(state, "design", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.DESIGN.value,
                "action": "experiment_design",
                "detail": "生成实验方案",
                "summary": json.dumps(experiment_design, ensure_ascii=False)[:500],
            },
        ),
        "errors": state.get("errors", []),
    }


def _summarize_literature(literature: list[dict[str, Any]]) -> str:
    """把文献列表格式化为 LLM 上下文。"""
    if not literature:
        return "（暂无文献）"
    lines: list[str] = []
    for item in literature[:8]:
        title = item.get("title", "")
        year = item.get("year") or "n.d."
        lines.append(f"- [{item.get('source')}] {title} ({year})")
    return "\n".join(lines)
