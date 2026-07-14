"""实验执行 Agent（experiment）。

支持两种数据来源：
1. **用户输入**（推荐）：用户通过 HIL edit 注入 `experiment_results`（含
   `source="user"` 标记），节点直接采用，跳过 LLM 调用。
2. **LLM 模拟**（回退）：auto 模式或用户未填时，调 LLM 生成伪代码 + 日志
   + 指标。LLM 失败则用占位结果。

用户输入 schema 见后端 `ExperimentInput`：
    {source, methodology, materials, procedure, metrics[], resultsDescription,
     rawLogs?, notes?}
"""

from __future__ import annotations

import json
import re
from typing import Any

from src.agents import (
    append_history,
    llm_generate,
    merge_artifacts,
    placeholder_experiment,
    safe_json_loads,
)
from src.agents.discipline_profiles import resolve_discipline_profile
from src.agents.state import AgentState
from src.llm.prompts.templates import EXPERIMENT_PROMPT
from src.models.schemas import Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.experiment")


# 学科特定实验执行提示（复用 design_agent 的 hint，确保设计→执行一致）
_DISCIPLINE_HINTS: dict[str, str] = {
    "material": (
        "材料科学实验执行：\n"
        "- methodology：记录制备批次和工艺参数，使用 XRD、SEM/TEM 及目标性能测试进行多尺度表征与重复性分析\n"
        "- materials：原料来源与纯度、配比、炉温程序、样品尺寸、设备型号、校准记录和环境条件\n"
        "- procedure：1.原料质控与配比；2.制备及热处理；3.物相和形貌表征；4.性能测试；5.结构性能关联、稳定性与失效分析\n"
        "- metrics：抗压强度(MPa)、抗折强度(MPa)、维氏硬度(HV)、密度(g/cm³)、电导率(S/m)、孔隙率(%)等\n"
        "- rawLogs：模拟 XRD/SEM 设备运行日志，含设备启动、参数设置、扫描完成等条目"
    ),
    "chemistry": (
        "化学实验执行：\n"
        "- methodology：合成路线、反应监控与产物表征\n"
        "- materials：试剂名称、纯度、当量、溶剂、催化剂\n"
        "- procedure：1.试剂准备；2.反应装置搭建；3.投料与反应；4.后处理（萃取/洗涤/干燥）；5.纯化；6.表征\n"
        "- metrics：产率(%)、选择性(%)、纯度(%)、转化率(%)、熔点(°C)\n"
        "- rawLogs：模拟反应监控日志（TLC、温度、搅拌速率）"
    ),
    "biology": (
        "生物实验执行：\n"
        "- methodology：实验设计类型、检测方法与统计学分析\n"
        "- materials：样本来源、细胞系/动物模型、试剂货号、抗体信息\n"
        "- procedure：1.样本准备；2.实验处理；3.检测（qPCR/Western blot/IHC）；4.数据采集；5.统计分析\n"
        "- metrics：表达量（倍数变化）、P值、效应量、95%置信区间、存活率(%)\n"
        "- rawLogs：模拟实验操作日志"
    ),
    "physics": (
        "物理实验执行：\n"
        "- methodology：实验/数值方法描述\n"
        "- materials：实验装置或计算资源、参数设置\n"
        "- procedure：1.装置调试/模型建立；2.参数设置；3.数据采集/模拟运行；4.误差分析；5.理论对比\n"
        "- metrics：物理量值（SI单位）、不确定度、拟合优度(R²)、相对误差(%)\n"
        "- rawLogs：模拟测量/计算日志"
    ),
    "nlp": (
        "NLP 实验执行：\n"
        "- methodology：模型训练与评估流程\n"
        "- materials：数据集名称、规模、划分方式\n"
        "- procedure：1.数据预处理；2.模型构建；3.训练；4.验证；5.测试\n"
        "- metrics：accuracy、F1、BLEU、ROUGE、BERTScore\n"
        "- rawLogs：模拟训练日志（loss、epoch、eval）"
    ),
    "cv": (
        "计算机视觉实验执行：\n"
        "- methodology：模型训练与评估\n"
        "- materials：数据集、模型骨干、GPU配置\n"
        "- procedure：1.数据增强；2.模型构建；3.训练；4.验证；5.测试\n"
        "- metrics：mAP、IoU、准确率(%)、参数量(M)、FLOPs(G)\n"
        "- rawLogs：模拟训练日志"
    ),
    "ml": (
        "机器学习实验执行：\n"
        "- methodology：学习算法与评估流程\n"
        "- materials：数据集、特征描述、计算资源\n"
        "- procedure：1.数据准备；2.特征工程；3.模型训练；4.交叉验证；5.评估\n"
        "- metrics：accuracy、AUC、MSE、MAE、R²\n"
        "- rawLogs：模拟训练日志"
    ),
}

_MATERIAL_SOCIETAL_IMPACT_HINT = (
    "材料科学与社会影响研究执行：\n"
    "- methodology：执行系统性文献综述、案例比较、生命周期与社会影响评价及利益相关方分析\n"
    "- materials：文献检索记录、官方统计、产业和政策报告、案例材料及指标定义\n"
    "- procedure：界定范围；检索与质量评价；案例选择；证据编码；社会影响与治理分析\n"
    "- metrics：证据覆盖度、利益相关方覆盖、生命周期环境负荷、公平性与治理成熟度\n"
    "- resultsDescription：只报告已有证据和待验证判断，不生成虚构问卷、访谈或实验数值\n"
    "- rawLogs：记录检索、筛选、编码和证据复核过程，不模拟实验设备日志\n"
    "- 禁止：不得输出与题意无关的实验室制备、设备或表征操作"
)

_LAB_PROTOCOL_PATTERN = re.compile(
    r"XRD|SEM/?TEM|炉温|烧结|热处理|原料纯度|抗压强度|维氏硬度|电导率"
)


def _societal_impact_execution(question: str) -> dict[str, Any]:
    return {
        "source": "agent",
        "methodology": "采用系统性文献综述、典型案例比较、生命周期与社会影响评价及利益相关方分析；当前未获得完整证据集，因此只生成待执行框架。",
        "materials": "待检索的同行评议文献、官方统计、产业与政策报告、生命周期数据、公开案例及利益相关方资料。",
        "procedure": "1. 界定研究范围；2. 执行数据库检索与去重；3. 按标准筛选并评价证据；4. 选择和编码典型案例；5. 开展案例比较与利益相关方分析；6. 评价社会影响、伦理风险和治理条件。",
        "metrics": [
            {"name": "证据覆盖度", "value": "待检索", "unit": "", "note": "按数据库、年份和研究类型统计"},
            {"name": "利益相关方覆盖", "value": "待编码", "unit": "", "note": "企业、劳动者、消费者、社区与监管者"},
            {"name": "治理成熟度", "value": "待评价", "unit": "", "note": "标准、追踪、回收和公众参与"},
        ],
        "resultsDescription": "当前只形成证据综合和社会影响评价框架，不代表已完成调查、案例编码或因果识别。",
        "rawLogs": "[pending] 文献检索\n[pending] 证据筛选\n[pending] 案例编码\n[pending] 利益相关方复核\n[pending] 治理评价",
        "status": "placeholder",
        "question": question,
    }


def _get_discipline_hint(discipline: str, question: str = "") -> str:
    """根据学科 key 返回特定实验执行提示。"""
    profile = resolve_discipline_profile(discipline, question)
    if profile.get("approach") == "societal_impact":
        return _MATERIAL_SOCIETAL_IMPACT_HINT
    key = profile.get("key", "general")
    return _DISCIPLINE_HINTS.get(key, "请根据学科特点执行合理的实验。")


def _is_user_inputed(results: Any) -> bool:
    """判断 experiment_results 是否由用户通过 HIL 注入。"""
    if not isinstance(results, dict):
        return False
    if results.get("source") == "user":
        return True
    # 兼容：无 source 但有 methodology 字段也视为用户输入
    methodology = results.get("methodology")
    if isinstance(methodology, str) and methodology.strip():
        return True
    return False


async def node(state: AgentState) -> dict[str, Any]:
    """实验执行节点。

    优先采用用户通过 HIL 注入的 experiment_results；
    否则回退到 LLM 模拟（auto 模式或用户未填）。
    """
    question = state.get("question", "") or ""
    experiment_design = state.get("experiment_design", {}) or {}
    existing_results = state.get("experiment_results", {}) or {}

    # 1. 用户输入优先：HIL edit 已把 experiment_results 写入 state
    if _is_user_inputed(existing_results):
        logger.info("采用用户输入的实验结果，跳过 LLM 调用")
        experiment_results: dict[str, Any] = dict(existing_results)
        experiment_results["status"] = "completed"
        experiment_results["source"] = "user"
        experiment_results.setdefault("question", question)

        artifacts_payload = {
            "experiment": experiment_results,
            "metrics": experiment_results.get("metrics", []) or [],
        }
        return {
            "stage": Stage.EXPERIMENT,
            "experiment_results": experiment_results,
            "artifacts": merge_artifacts(state, "experiment", artifacts_payload),
            "history": append_history(
                state,
                {
                    "stage": Stage.EXPERIMENT.value,
                    "action": "experiment_user_input",
                    "detail": "用户输入实验结果",
                    "summary": _summarize_user_metrics(experiment_results),
                },
            ),
            "errors": state.get("errors", []),
        }

    # 2. 回退：LLM 模拟（auto 模式或用户未填）
    discipline = state.get("discipline", "general")
    profile = resolve_discipline_profile(discipline, question)
    dataset_hint = experiment_design.get("dataset", "（无）") or "（无）"
    prompt = EXPERIMENT_PROMPT.format(
        question=question,
        discipline=discipline,
        discipline_label=profile.get("label", "综合学科"),
        method_requirement=profile.get("method", ""),
        evidence_requirement=profile.get("evidence", ""),
        reproducibility_requirement=profile.get("reproducibility", ""),
        experiment_design=json.dumps(experiment_design, ensure_ascii=False),
        dataset_hint=dataset_hint,
        discipline_hint=_get_discipline_hint(discipline, question),
    )
    raw = await llm_generate(prompt, tier="economical")

    parsed = safe_json_loads(raw, default=None)
    if profile.get("approach") == "societal_impact" and _LAB_PROTOCOL_PATTERN.search(
        json.dumps(parsed, ensure_ascii=False) if parsed is not None else raw
    ):
        logger.warning("社会影响研究收到实验室执行方案，已拒绝并改用证据综合框架")
        parsed = None
    if isinstance(parsed, dict) and parsed.get("methodology"):
        # 增强版：LLM 返回的结构化实验方案（与用户输入 schema 对齐）
        experiment_results = {
            "source": "agent",
            "methodology": parsed.get("methodology", ""),
            "materials": parsed.get("materials", ""),
            "procedure": parsed.get("procedure", ""),
            "metrics": parsed.get("metrics", []) or [],
            "resultsDescription": parsed.get("resultsDescription", ""),
            "rawLogs": parsed.get("rawLogs", ""),
            "status": "completed",
            "question": question,
        }
    elif isinstance(parsed, dict) and parsed.get("code"):
        # 兼容旧版 LLM 输出格式（code/logs/metrics dict）
        old_metrics = parsed.get("metrics", {}) or {}
        metrics_list = []
        if isinstance(old_metrics, dict):
            for name, value in old_metrics.items():
                metrics_list.append({"name": name, "value": str(value), "unit": "", "note": ""})
        experiment_results = {
            "source": "agent",
            "methodology": "（LLM 模拟）基于实验方案执行",
            "materials": dataset_hint,
            "procedure": parsed.get("code", ""),
            "metrics": metrics_list,
            "resultsDescription": json.dumps(old_metrics, ensure_ascii=False),
            "rawLogs": "\n".join(parsed.get("logs", []) or []),
            "status": "completed",
            "question": question,
        }
    elif profile.get("approach") == "societal_impact":
        experiment_results = _societal_impact_execution(question)
    else:
        experiment_results = placeholder_experiment()
        experiment_results["status"] = "placeholder"
        experiment_results["source"] = "agent"
        experiment_results["question"] = question

    artifacts_payload = {
        "experiment": experiment_results,
        "metrics": experiment_results.get("metrics", []) or [],
    }

    return {
        "stage": Stage.EXPERIMENT,
        "experiment_results": experiment_results,
        "artifacts": merge_artifacts(state, "experiment", artifacts_payload),
        "history": append_history(
            state,
            {
                "stage": Stage.EXPERIMENT.value,
                "action": "experiment_run",
                "detail": "实验执行（LLM 模拟·结构化）",
                "summary": _summarize_agent_metrics(experiment_results),
            },
        ),
        "errors": state.get("errors", []),
    }


def _summarize_user_metrics(results: dict[str, Any]) -> str:
    """把用户输入的 metrics 列表摘要成可读字符串，供 history 记录。"""
    metrics = results.get("metrics") or []
    if not isinstance(metrics, list) or not metrics:
        return "用户输入实验结果（无结构化指标）"
    parts: list[str] = []
    for m in metrics:
        if not isinstance(m, dict):
            continue
        name = m.get("name", "?")
        value = m.get("value", "?")
        unit = m.get("unit", "")
        parts.append(f"{name}={value}{unit}" if unit else f"{name}={value}")
    return "用户输入指标：" + ", ".join(parts) if parts else "用户输入实验结果"


def _summarize_agent_metrics(results: dict[str, Any]) -> str:
    """把 LLM 模拟的 metrics 列表摘要成可读字符串，供 history 记录。"""
    metrics = results.get("metrics") or []
    if not isinstance(metrics, list) or not metrics:
        return "LLM 模拟实验结果（无结构化指标）"
    parts: list[str] = []
    for m in metrics:
        if not isinstance(m, dict):
            continue
        name = m.get("name", "?")
        value = m.get("value", "?")
        unit = m.get("unit", "")
        parts.append(f"{name}={value}{unit}" if unit else f"{name}={value}")
    return "LLM 模拟指标：" + ", ".join(parts) if parts else "LLM 模拟实验结果"
