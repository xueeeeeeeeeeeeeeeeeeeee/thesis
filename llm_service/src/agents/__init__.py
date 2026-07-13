"""Agent 编排包。

提供各 Agent 节点函数与共享工具：
- llm_generate: 调用 LLM 的统一封装（未配置 Key 时返回空串，不抛错）
- safe_json_loads: 解析 LLM 输出的 JSON，失败时返回空字典/列表
- append_history: 追加操作历史（返回新列表，适配无 reducer 的 state）
- snapshot: 生成版本快照
- merge_artifacts: 把当前核心字段合并进 state["artifacts"]
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from src.llm.router import LLMNotConfiguredError, router
from src.utils.logger import get_logger

logger = get_logger("src.agents")


async def llm_generate(prompt: str, tier: str = "economical") -> str:
    """调用 LLM 生成文本。

    未配置 Key 或调用失败时返回空串，确保 Agent 流程不崩溃。
    """
    if not prompt:
        return ""
    try:
        content, _ = await router.chat(
            [{"role": "user", "content": prompt}], tier=tier
        )
        return content or ""
    except LLMNotConfiguredError as e:
        logger.info("LLM 未配置，使用占位输出：%s", e)
        return ""
    except Exception as e:  # noqa: BLE001 - 兜底，避免单节点失败中断整条流水线
        logger.warning("LLM 调用失败，使用占位输出：%s", e)
        return ""


def safe_json_loads(
    text: str,
    default: Any = None,
) -> Any:
    """从 LLM 输出中尽力提取 JSON。

    - 标准 JSON
    - 包含在 ```json ... ``` 代码块中的 JSON
    - 失败时返回 default（默认 None）
    """
    if not text:
        return default
    # 尝试 1：直接解析
    try:
        return json.loads(text)
    except Exception:
        pass
    # 尝试 2：提取 ```json ... ``` 块
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # 尝试 3：取首对花括号 / 中括号
    for opener, closer in (("{", "}"), ("[", "]")):
        idx = text.find(opener)
        if idx < 0:
            continue
        end = text.rfind(closer)
        if end > idx:
            try:
                return json.loads(text[idx : end + 1])
            except Exception:
                continue
    return default


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def append_history(state: dict[str, Any], entry: dict[str, Any]) -> list[dict]:
    """返回追加了 entry 的历史列表（不修改原列表）。"""
    history = list(state.get("history", []) or [])
    entry = dict(entry)
    entry.setdefault("ts", now_iso())
    history.append(entry)
    return history


def append_error(state: dict[str, Any], err: str) -> list[str]:
    errors = list(state.get("errors", []) or [])
    errors.append(err)
    return errors


def append_hil_queue(state: dict[str, Any], item: dict[str, Any]) -> list[dict]:
    """追加 HIL 等待项到 hil_queue。"""
    queue = list(state.get("hil_queue", []) or [])
    queue.append(dict(item))
    return queue


def snapshot(state: dict[str, Any], stage: str) -> dict[str, Any]:
    """生成当前关键字段的版本快照。"""
    return {
        "stage": stage,
        "ts": now_iso(),
        "literature": list(state.get("literature", []) or []),
        "experiment_design": dict(state.get("experiment_design", {}) or {}),
        "experiment_results": dict(state.get("experiment_results", {}) or {}),
        "evaluation": dict(state.get("evaluation", {}) or {}),
        "paper_sections": dict(state.get("paper_sections", {}) or {}),
    }


def append_version(state: dict[str, Any], snap: dict[str, Any]) -> list[dict]:
    versions = list(state.get("versions", []) or [])
    versions.append(snap)
    return versions


def merge_artifacts(state: dict[str, Any], key: str, value: Any) -> dict[str, Any]:
    """把 value 写入 state["artifacts"][key]，返回新的 artifacts 字典。"""
    artifacts = dict(state.get("artifacts", {}) or {})
    artifacts[key] = value
    return artifacts


def placeholder_literature(question: str, n: int = 3) -> list[dict]:
    """LLM 失败时使用的占位文献列表。"""
    seeds = [
        f"A Survey on {question}: Methods and Benchmarks",
        f"Recent Advances in {question}: A Systematic Review",
        f"Towards Practical {question}: Lessons from Large-Scale Evaluation",
        f"A Comparative Study of {question} Techniques",
        f"Open Problems in {question}: From Theory to Practice",
    ]
    out: list[dict] = []
    for title in seeds[:n]:
        out.append(
            {
                "title": title,
                "abstract": f"（占位摘要）围绕「{question}」展开的相关研究综述与方法对比。",
                "authors": ["Author A", "Author B"],
                "year": 2024,
                "doi": None,
                "url": None,
                "source": "placeholder",
                "summary": f"（占位）该文与「{question}」高度相关。",
            }
        )
    return out


def placeholder_design(question: str) -> dict[str, Any]:
    """LLM 失败时使用的占位实验方案。"""
    return {
        "hypothesis": f"（占位）针对「{question}」的合理假设尚未生成。",
        "variables": {
            "independent": ["方法", "超参数"],
            "dependent": ["accuracy", "f1"],
            "control": ["随机种子", "数据集划分"],
        },
        "metrics": ["accuracy", "f1", "loss", "precision", "recall"],
        "dataset": "（占位）公开数据集，待补充。",
        "method_steps": [
            "数据预处理与划分",
            "基线模型训练",
            "改进模型训练",
            "指标计算与对比",
            "结果可视化与误差分析",
        ],
        "plan": "（占位实验方案）按 method_steps 执行即可。",
    }


def placeholder_experiment() -> dict[str, Any]:
    """LLM 失败时使用的占位实验结果。"""
    return {
        "code": (
            "# 占位实验代码\n"
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.metrics import accuracy_score, f1_score\n"
            "model = LogisticRegression(max_iter=200)\n"
            "model.fit(X_train, y_train)\n"
            "pred = model.predict(X_test)\n"
        ),
        "logs": [
            "[INFO] loading dataset ...",
            "[INFO] training baseline ...",
            "[INFO] evaluating ...",
            "[INFO] done.",
        ],
        "metrics": {
            "accuracy": 0.0,
            "f1": 0.0,
            "loss": 0.0,
            "precision": 0.0,
            "recall": 0.0,
        },
    }


def placeholder_evaluation() -> dict[str, Any]:
    """LLM 失败时使用的占位评价。"""
    return {
        "summary": "（占位评价）实验结果评价未生成。",
        "table": [
            ["指标", "数值", "评价"],
            ["accuracy", "0.0", "占位"],
        ],
        "comparison": ["（占位）与基线对比待生成。"],
        "limitations": ["（占位）样本规模有限。"],
        "improvements": ["（占位）扩大数据集并细化消融。"],
    }


def placeholder_discussion(question: str) -> str:
    """LLM 失败时使用的占位讨论。"""
    return (
        f"（占位讨论）本节针对「{question}」进行学术讨论。"
        "受 LLM 未配置或调用失败影响，详细分析未生成。"
    )


def placeholder_paper_sections(question: str) -> dict[str, str]:
    """LLM 失败时使用的占位 6 章节。"""
    base = (
        f"（占位章节）本节围绕「{question}」撰写，"
        "受 LLM 未配置或调用失败影响，暂以占位文字呈现。"
    )
    return {
        "abstract": (
            f"（占位摘要）本文针对「{question}」展开研究，"
            "设计实验方案并得到初步结果。受 LLM 未配置或调用失败影响，"
            "详细方法与结果将后续补充。"
        ),
        "intro": base + " 研究背景与问题陈述。",
        "method": base + " 实验设计、数据与流程。",
        "results": base + " 关键结果呈现。",
        "discussion": base + " 结果讨论与对比。",
        "conclusion": base + " 核心结论与展望。",
    }


def placeholder_figures() -> list[dict[str, Any]]:
    """LLM 失败时使用的占位图表。"""
    return [
        {
            "id": "fig_1",
            "type": "line",
            "caption": "（占位）训练曲线：loss/accuracy 随 epoch 变化",
            "data": {"x": [1, 2, 3, 4, 5], "y1": [0.6, 0.7, 0.8, 0.85, 0.9], "y2": [0.4, 0.3, 0.2, 0.15, 0.1]},
            "code": "import matplotlib.pyplot as plt\nplt.plot(x, y1, label='acc')\nplt.plot(x, y2, label='loss')",
        },
        {
            "id": "fig_2",
            "type": "bar",
            "caption": "（占位）方法对比：不同模型在测试集上的 accuracy",
            "data": {"categories": ["A", "B", "C"], "values": [0.7, 0.8, 0.85]},
            "code": "import matplotlib.pyplot as plt\nplt.bar(categories, values)",
        },
    ]


def placeholder_submission(question: str) -> dict[str, Any]:
    """LLM 失败时使用的占位投稿包。"""
    return {
        "target_venue": [
            {"name": "（占位）相关领域期刊/会议 A", "tier": "Q1", "reason": "与本文主题高度相关"},
            {"name": "（占位）相关领域期刊/会议 B", "tier": "Q2", "reason": "投稿范围匹配"},
        ],
        "checklist": [
            "投稿信（cover_letter）",
            "PDF 全文（按模板排版）",
            "源代码与数据可用性声明",
            "所有作者签字与利益冲突声明",
            "图表分辨率 ≥ 300 dpi",
        ],
        "cover_letter": (
            f"（占位 Cover Letter）本文围绕「{question}」展开，"
            "投稿贵刊/会议供审阅。详细描述见正文。"
        ),
        "suggestion": "（占位投稿建议）建议先投 Q1 期刊备选会议。",
    }
