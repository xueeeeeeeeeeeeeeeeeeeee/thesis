"""LangGraph Agent 状态定义。

`AgentState` 是 8 阶段流水线在节点间共享的可变快照。
各字段在节点间传递，节点返回的 dict 会按键覆盖更新。
"""

from __future__ import annotations

from typing import Optional, TypedDict

from src.models.schemas import Stage


class AgentState(TypedDict, total=False):
    """LangGraph 主控状态。

    注意：使用 total=False 是为了新增字段时不破坏旧节点函数的 state.get 调用。
    各节点应通过 state.get("key", default) 安全访问。
    """

    # ---------- 基础元信息 ----------
    project_id: str
    question: str
    discipline: str
    stage: Stage
    # ---------- 流水线配置 ----------
    mode: str                  # 'auto' / 'manual'
    template: str              # 'ctex' / 'ieee' / 'journal' / 'markdown'
    # ---------- 核心产出（按阶段逐步累加）----------
    literature: list[dict]        # 文献列表 → artifacts.literature
    experiment_design: dict       # 实验方案 → artifacts.design
    experiment_results: dict      # 实验结果 → artifacts.experiment
    evaluation: dict              # 评价 → artifacts.evaluation
    discussion: str               # 讨论 → artifacts.discussion
    paper_sections: dict          # 章节 → artifacts.paper_sections
    figures: list[dict]           # 图表 → artifacts.figures
    submission: dict              # 投稿信息 → artifacts.submission
    # ---------- 统一 artifacts 容器（前端主用）----------
    artifacts: dict               # 包含 literature/design/experiment/.../draft_text
    # ---------- 人审相关 ----------
    hil_pending: Optional[dict]   # 当前正在等待人审的项
    hil_queue: list[dict]         # 已触发的人审项历史（每触发一个就 push 一份）
    # ---------- 审计 / 快照 ----------
    history: list[dict]           # 操作历史
    versions: list[dict]          # 版本快照（用于 rollback）
    errors: list[str]             # 错误日志
