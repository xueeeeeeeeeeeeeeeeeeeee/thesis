"""学科论文结构配置，与 Node 端的 disciplineProfiles 保持语义一致。"""

from __future__ import annotations

import re
from typing import Any


def _section(title: str, weight: float, role: str, focus: str) -> dict[str, Any]:
    return {"title": title, "weight": weight, "role": role, "focus": focus}


def _computing_profile(
    key: str,
    label: str,
    roles: tuple[str, str, str, str],
    evidence: str,
    method: str,
    reproducibility: str,
) -> dict[str, Any]:
    literature_role, method_role, experiment_role, analysis_role = roles
    return {
        "key": key,
        "label": label,
        "editor": "计算机学科学术总编",
        "method": method,
        "evidence": evidence,
        "reproducibility": reproducibility,
        "sections": {
            "abstract": _section("摘要", 0.08, "技术摘要作者", "问题、方法、核心结果与贡献闭环"),
            "keywords": _section("关键词", 0.025, "主题词标引 Agent", "任务、方法、数据集与评价指标关键词"),
            "introduction": _section("引言", 0.17, literature_role, "任务背景、知识缺口、研究问题与贡献"),
            "relatedWork": _section("相关工作", 0.13, literature_role, "按方法谱系比较文献并明确本文差异"),
            "method": _section("方法", 0.22, method_role, "问题形式化、模型、目标函数、算法与复杂度"),
            "experimentSetup": _section("实验设置", 0.13, experiment_role, "数据集、划分、基线、超参数、算力与评价协议"),
            "results": _section("结果与分析", 0.14, analysis_role, "主结果、显著性、效率与公平比较"),
            "errorAnalysis": _section("消融与误差分析", 0.06, analysis_role, "组件贡献、失败案例、鲁棒性与局限"),
            "conclusion": _section("结论", 0.045, "计算机学科学术总编", "贡献、适用边界与后续工作"),
        },
    }


PROFILES: dict[str, dict[str, Any]] = {
    "nlp": _computing_profile(
        "nlp",
        "自然语言处理",
        ("NLP 文献综述作者", "语言模型与算法作者", "NLP 实验工程师", "NLP 误差分析审稿人"),
        "报告数据集划分、强基线、F1/BLEU/ROUGE、人工评价、幻觉与领域迁移误差",
        "定义输入输出、分词或提示策略、模型架构、训练目标和解码方法",
        "固定随机种子并报告模型版本、提示模板、超参数、算力预算与推理配置",
    ),
    "cv": _computing_profile(
        "cv",
        "计算机视觉",
        ("计算机视觉综述作者", "视觉模型架构作者", "视觉实验工程师", "视觉鲁棒性审稿人"),
        "报告公开数据划分、mAP/IoU/准确率、参数量、FLOPs、吞吐量与失败案例",
        "说明分辨率、预处理、增强、骨干网络、任务头、损失函数和推理流程",
        "记录图像尺寸、增强概率、预训练权重、训练轮次、硬件与随机种子",
    ),
    "ml": _computing_profile(
        "ml",
        "机器学习",
        ("机器学习综述作者", "学习算法与理论作者", "机器学习实验工程师", "统计学习审稿人"),
        "在多个数据集与强基线公平比较，报告任务性能、均值方差、显著性、鲁棒性与成本",
        "定义学习问题、假设空间、模型结构、目标函数、优化算法与计算复杂度",
        "报告预处理、超参数搜索空间、随机种子、硬件、训练预算与代码版本",
    ),
    "ir": _computing_profile(
        "ir",
        "信息检索",
        ("信息检索综述作者", "检索与排序算法作者", "检索评测工程师", "检索评价审稿人"),
        "报告查询集、相关性标注、BM25 基线、nDCG/MRR/Recall、显著性、时延与吞吐量",
        "描述索引、召回、特征、排序或重排序、负采样和在线服务链路",
        "固定语料版本、索引参数、候选规模、随机种子、评测脚本与硬件配置",
    ),
    "biology": {
        "key": "biology",
        "label": "生物信息与生命科学",
        "editor": "生命科学期刊学术总编",
        "method": "规定材料来源、实验组与对照组、独立生物学重复、检测方法、统计学与伦理要求",
        "evidence": "区分相关与因果，报告效应量、95%置信区间和精确 P 值，不把模拟结果写成真实发现",
        "reproducibility": "保留试剂货号、仪器参数、原始图像、排除记录、脚本和伦理审批信息",
        "sections": {
            "abstract": _section("摘要", 0.08, "生物医学摘要作者", "目的、方法、结果与结论的结构式摘要"),
            "keywords": _section("关键词", 0.025, "生物医学主题词标引 Agent", "机制、模型、检测方法和统计学主题词"),
            "introduction": _section("引言", 0.19, "生物学文献综述作者", "机制背景、证据缺口、可证伪假设与研究目标"),
            "method": _section("材料与方法", 0.27, "实验方法学专家", "材料、对照、重复、检测、统计、伦理与可重复性"),
            "results": _section("结果", 0.18, "生物统计学审稿人", "表型、分子证据、效应量、置信区间与模拟边界"),
            "discussion": _section("讨论", 0.205, "机制讨论作者", "机制解释、文献对比、替代解释、局限与转化价值"),
            "conclusion": _section("结论", 0.045, "生命科学学术总编", "证据强度、结论边界与后续验证"),
        },
    },
    "material": {
        "key": "material",
        "label": "材料科学",
        "editor": "材料学学术总编",
        "method": "报告原料纯度、配比、制备工艺、热处理制度、样品尺寸与表征参数",
        "evidence": "结合物相、形貌、组成与力学/电学/热学性能建立结构性能关系并报告离散性",
        "reproducibility": "记录批次、设备型号、校准方式、环境条件、重复样品与原始谱图",
        "sections": {
            "abstract": _section("摘要", 0.08, "材料学摘要作者", "材料体系、制备、结构、性能与结论"),
            "keywords": _section("关键词", 0.025, "材料主题词标引 Agent", "材料、工艺、表征和性能关键词"),
            "introduction": _section("引言", 0.18, "材料科学综述作者", "应用背景、结构性能关系与研究缺口"),
            "method": _section("实验材料与制备方法", 0.25, "材料制备工艺专家", "原料、配比、制备路径、热处理与工艺窗口"),
            "characterization": _section("结构表征与性能测试", 0.14, "材料表征专家", "XRD、SEM/TEM、光谱、性能测试与校准"),
            "results": _section("结果与讨论", 0.23, "结构性能关系审稿人", "相组成、微观结构、性能、机理与不确定度"),
            "limitations": _section("工程可行性与局限", 0.065, "材料工程评估 Agent", "规模化、稳定性、成本、环境影响与失效模式"),
            "conclusion": _section("结论", 0.045, "材料学学术总编", "结构性能结论与工程边界"),
        },
    },
    "chemistry": {
        "key": "chemistry",
        "label": "化学",
        "editor": "化学期刊学术总编",
        "method": "报告试剂纯度与当量、溶剂、气氛、温度、时间、后处理、纯化、仪器与安全措施",
        "evidence": "以分离产率、选择性、纯度和 NMR/MS/IR/色谱表征支持产物结构并讨论机理",
        "reproducibility": "保留原始谱图、色谱、称量记录、批次、反应装置和重复实验",
        "sections": {
            "abstract": _section("摘要", 0.08, "化学摘要作者", "反应目标、策略、产率或选择性与意义"),
            "keywords": _section("关键词", 0.025, "化学主题词标引 Agent", "反应、催化、分析方法与产物关键词"),
            "introduction": _section("引言", 0.18, "化学文献综述作者", "合成挑战、已有路线、机理缺口与目标"),
            "method": _section("试剂、仪器与实验方法", 0.24, "合成与分析方法专家", "纯度、当量、气氛、温度、后处理与安全"),
            "characterization": _section("产物表征", 0.12, "谱学表征专家", "NMR、MS、IR、色谱、元素分析与纯度"),
            "results": _section("结果与讨论", 0.24, "反应机理与优化审稿人", "条件、产率、选择性、底物范围、对照与机理"),
            "safety": _section("安全与绿色化学评价", 0.075, "化学安全审查 Agent", "危害、废物、原子经济性、能耗与放大风险"),
            "conclusion": _section("结论", 0.045, "化学学术总编", "方法贡献、适用范围与安全边界"),
        },
    },
    "physics": {
        "key": "physics",
        "label": "物理",
        "editor": "物理学期刊学术总编",
        "method": "给出控制方程、基本假设、初始与边界条件、量纲分析、实验装置或数值离散方案",
        "evidence": "报告物理量及单位、误差传播、拟合优度、不确定度、收敛性和理论实验一致性",
        "reproducibility": "记录参数、单位、仪器校准、网格、时间步长、代码版本和随机过程设置",
        "sections": {
            "abstract": _section("摘要", 0.08, "物理学摘要作者", "物理问题、模型、方法、定量结果与意义"),
            "keywords": _section("关键词", 0.025, "物理主题词标引 Agent", "物理体系、理论、数值方法与观测量"),
            "introduction": _section("引言", 0.17, "物理学综述作者", "物理背景、尺度、已有理论与未解问题"),
            "theory": _section("理论模型", 0.19, "理论建模专家", "假设、方程、边界条件、量纲与适用范围"),
            "method": _section("实验或数值方法", 0.19, "实验与数值方法专家", "装置或算法、参数、离散化、收敛与校准"),
            "results": _section("结果", 0.18, "物理数据分析审稿人", "观测量、标度关系、误差与模型比较"),
            "discussion": _section("讨论", 0.125, "物理机制讨论作者", "物理解释、极限情况、敏感性、不确定度与局限"),
            "conclusion": _section("结论", 0.045, "物理学学术总编", "定量结论、适用尺度与未来检验"),
        },
    },
}

PROFILES["general"] = {
    "key": "general",
    "label": "综合学科",
    "editor": "学术总编",
    "method": "明确材料、变量、研究流程、质量控制与分析方法",
    "evidence": "区分已有证据、合理推断和待验证假设，并报告限制、不确定性与稳健性",
    "reproducibility": "记录数据来源、处理步骤、评价标准、分析脚本与版本信息",
    "sections": {
        "abstract": _section("摘要", 0.08, "摘要作者", "背景、问题、方法、结果与结论"),
        "keywords": _section("关键词", 0.025, "主题词标引 Agent", "研究对象、方法与评价关键词"),
        "introduction": _section("引言", 0.2, "文献综述作者", "背景、缺口与研究目标"),
        "method": _section("研究方法", 0.27, "方法学专家", "材料、变量、流程、质量控制与分析"),
        "results": _section("研究结果", 0.2, "结果审稿人", "主要发现、证据与不确定性"),
        "discussion": _section("讨论", 0.21, "讨论作者", "解释、对比、局限与未来研究"),
        "conclusion": _section("结论", 0.045, "学术总编", "结论边界与贡献"),
    },
}

MATERIAL_SOCIETAL_IMPACT_PROFILE: dict[str, Any] = {
    "key": "material",
    "approach": "societal_impact",
    "label": "材料科学与社会影响研究",
    "editor": "材料科学与科技社会研究跨学科总编",
    "method": "采用系统性文献综述、典型案例比较、生命周期与社会影响评价、利益相关方分析和情景分析，明确材料类别、时间、地域与评价边界",
    "evidence": "结合同行评议文献、官方统计、产业报告、生命周期数据和利益相关方证据，区分技术潜力、已观察影响与情景推演，避免把相关性写成确定因果",
    "reproducibility": "公开数据库、检索式、纳入排除标准、案例选择依据、编码框架、指标定义、证据等级和利益冲突声明",
    "sections": {
        "abstract": _section("摘要", 0.08, "跨学科摘要作者", "新材料类型、研究范围、社会影响维度与主要判断"),
        "keywords": _section("关键词", 0.025, "跨学科主题词标引 Agent", "材料技术、社会影响、可持续性、伦理和治理关键词"),
        "introduction": _section("引言", 0.15, "材料技术与社会综述作者", "技术背景、社会问题、研究缺口与研究问题"),
        "conceptualFramework": _section("概念框架与研究范围", 0.13, "科技与社会研究方法专家", "系统综述、案例比较、生命周期与社会影响评价、利益相关方和指标边界"),
        "technologyApplications": _section("新材料技术发展与应用场景", 0.15, "材料技术综述专家", "材料类别、关键特性、成熟度、产业链与应用场景"),
        "socialImpact": _section("社会影响分析", 0.22, "科技与社会影响分析 Agent", "经济产业、就业技能、公共健康、生活方式、环境、公平与可及性"),
        "governance": _section("风险、伦理与治理", 0.13, "科技伦理与政策治理审稿人", "全生命周期风险、责任分配、标准监管、公众参与与转型治理"),
        "discussion": _section("讨论", 0.07, "跨学科讨论作者", "影响机制、受益与受损群体、证据限制、替代解释与情景差异"),
        "conclusion": _section("结论", 0.045, "跨学科学术总编", "技术收益、社会成本、治理条件与结论边界"),
    },
}


def resolve_discipline_profile(discipline: str, question: str = "") -> dict[str, Any]:
    normalized = (discipline or "").strip().lower()
    if re.search(r"^nlp$|自然语言", normalized):
        return PROFILES["nlp"]
    if re.search(r"^cv$|计算机视觉|图像", normalized):
        return PROFILES["cv"]
    if re.search(r"^bio$|生物|生命|医学|医药|临床", normalized):
        return PROFILES["biology"]
    if re.search(r"^material$|材料", normalized) and re.search(
        r"人类社会|社会影响|社会发展|社会生活|社会公平|公共政策|公众参与|科技伦理|伦理问题|政策治理|监管治理|产业变革|就业影响|经济社会|生活方式|公正转型",
        question or "",
    ):
        return MATERIAL_SOCIETAL_IMPACT_PROFILE
    if re.search(r"^material$|材料", normalized):
        return PROFILES["material"]
    if re.search(r"^chem$|化学", normalized):
        return PROFILES["chemistry"]
    if re.search(r"^physics$|物理", normalized):
        return PROFILES["physics"]
    if re.search(r"^ml$|机器学习", normalized):
        return PROFILES["ml"]
    if re.search(r"^ir$|信息检索|检索", normalized):
        return PROFILES["ir"]
    return PROFILES["general"]
