"""主控 Orchestrator：8 阶段状态机 + 4 个 HIL 中断点。

阶段：literature → design → experiment → evaluate → discuss → write → figure → submit
中断点（interrupt_before）：design / experiment / discuss / figure
  - design 前  ← literature 后（确认文献方向）
  - experiment 前 ← design 后（确认实验方案）
  - discuss 前  ← evaluate 后（确认结果评价）
  - figure 前   ← write 后（确认论文初稿）

模式：
- mode='auto'   全自动，HIL 中断点直接通过（不暂停）
- mode='manual' 遇到中断点停等人审（通过 POST /agents/{id}/interrupt 恢复）

artifacts 容器：所有阶段产物会同步写入 state["artifacts"]，便于前端读取。
完成时调用 draft_renderer 渲染 draft_text 写进 artifacts。
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from src.agents import append_hil_queue
from src.agents.design_agent import node as design_node
from src.agents.draft_renderer import render as render_draft
from src.agents.discuss_agent import node as discuss_node
from src.agents.evaluate_agent import node as evaluate_node
from src.agents.experiment_agent import node as experiment_node
from src.agents.figure_agent import node as figure_node
from src.agents.literature_agent import node as literature_node
from src.agents.state import AgentState
from src.agents.submit_agent import node as submit_node
from src.agents.write_agent import node as write_node
from src.models.schemas import AgentStatus, AgentStatusEnum, HILAction, Stage
from src.utils.logger import get_logger

logger = get_logger("src.agents.orchestrator")

# HIL 中断点（interrupt_before）
INTERRUPT_BEFORE = ["design", "experiment", "discuss", "figure"]


# ============================================================================
# 4 个 HIL 提示（中文友好版）
# 模板里的 {n} / {metric} / {value} 在生成时由具体内容填充
# ============================================================================

_HIL_MESSAGES = {
    "design": {
        "stage": "design",
        "interrupted_after": "literature",
        "title": "文献调研完成",
        "message": "文献调研完成（{n} 篇），请审阅后确认进入实验设计。",
        "default_message": "文献调研完成（{n} 篇），请审阅后确认进入实验设计。",
    },
    "experiment": {
        "stage": "experiment",
        "interrupted_after": "design",
        "title": "请输入实验内容与结果",
        "message": "实验方案已生成，请在表单中填写实验内容与结果（方法/材料/步骤/指标/结果描述），提交后进入评估阶段。",
        "default_message": "实验方案已生成，请填写实验内容与结果后提交。",
    },
    "discuss": {
        "stage": "discuss",
        "interrupted_after": "evaluate",
        "title": "结果评价已完成",
        "message": "结果评价已完成（{metric}={value}），请审阅后进入讨论。",
        "default_message": "结果评价已完成，请审阅后进入讨论。",
    },
    "figure": {
        "stage": "figure",
        "interrupted_after": "write",
        "title": "论文初稿已完成",
        "message": "论文初稿已完成（{n} 章节），请审阅后进入图表生成。",
        "default_message": "论文初稿已完成（{n} 章节），请审阅后进入图表生成。",
    },
}


def _format_hil_message(stage: str, state_values: dict[str, Any]) -> dict[str, Any]:
    """根据当前 state 填充 HIL 提示模板。"""
    template = _HIL_MESSAGES.get(stage)
    if not template:
        return {"stage": stage, "message": f"{stage} 阶段已就绪，请确认。"}
    msg_template = template["message"]
    if stage == "design":
        lit = state_values.get("literature", []) or []
        n = len(lit) if isinstance(lit, list) else 0
        msg = msg_template.format(n=n)
    elif stage == "experiment":
        msg = msg_template
    elif stage == "discuss":
        exp_results = state_values.get("experiment_results", {}) or {}
        metrics = exp_results.get("metrics") or {}
        # 兼容两种 metrics 格式：
        # - 用户输入：list of {name, value, unit, note}
        # - LLM 模拟：dict of {accuracy: 0.95, ...}
        if isinstance(metrics, list) and metrics:
            first = metrics[0] if isinstance(metrics[0], dict) else {}
            metric_name = first.get("name", "metric")
            value = first.get("value", "n/a")
            unit = first.get("unit", "")
            msg = msg_template.format(
                metric=metric_name, value=f"{value}{unit}" if unit else value
            )
        elif isinstance(metrics, dict) and metrics:
            metric_name = next(
                (k for k in ("accuracy", "f1", "loss", "precision") if k in metrics),
                next(iter(metrics.keys()), "metric"),
            )
            value = metrics.get(metric_name, "n/a")
            msg = msg_template.format(metric=metric_name, value=value)
        else:
            msg = msg_template.format(metric="metric", value="n/a")
    elif stage == "figure":
        sections = state_values.get("paper_sections", {}) or {}
        n = len(sections) if isinstance(sections, dict) else 0
        msg = msg_template.format(n=n)
    else:
        msg = template.get("default_message", msg_template)
    result = {
        "stage": stage,
        "interrupted_after": template.get("interrupted_after", ""),
        "title": template.get("title", ""),
        "message": msg,
    }
    # experiment 阶段附带 experiment_design，供前端预填到表单
    if stage == "experiment":
        result["experiment_design"] = state_values.get("experiment_design", {}) or {}
    return result


class Orchestrator:
    """主控编排器。"""

    def __init__(self) -> None:
        self._checkpointer = MemorySaver()
        self._graph = self._build_graph()
        # agent_id -> 元信息 {project_id, question, discipline, mode, template,
        #                     status, hil_pending, hil_queue}
        self._agents: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------
    def _build_graph(self):
        """构建 8 阶段状态机。"""
        workflow = StateGraph(AgentState)

        # 注意：LangGraph 不允许节点名与 state key 同名，
        # AgentState 中已有 `literature` 字段，故节点名用 `literature_review`
        workflow.add_node("literature_review", literature_node)
        workflow.add_node("design", design_node)
        workflow.add_node("experiment", experiment_node)
        workflow.add_node("evaluate", evaluate_node)
        workflow.add_node("discuss", discuss_node)
        workflow.add_node("write", write_node)
        workflow.add_node("figure", figure_node)
        workflow.add_node("submit", submit_node)

        workflow.set_entry_point("literature_review")
        workflow.add_edge("literature_review", "design")
        workflow.add_edge("design", "experiment")
        workflow.add_edge("experiment", "evaluate")
        workflow.add_edge("evaluate", "discuss")
        workflow.add_edge("discuss", "write")
        workflow.add_edge("write", "figure")
        workflow.add_edge("figure", "submit")
        workflow.add_edge("submit", END)

        return workflow.compile(
            checkpointer=self._checkpointer,
            interrupt_before=INTERRUPT_BEFORE,
        )

    # ------------------------------------------------------------------
    def _initial_state(
        self,
        agent_id: str,
        project_id: str,
        question: str,
        discipline: str,
        mode: str,
        template: str,
        start_stage: Optional[Stage],
    ) -> AgentState:
        return {
            "project_id": project_id,
            "question": question,
            "discipline": discipline,
            "mode": mode,
            "template": template,
            "stage": start_stage or Stage.LITERATURE,
            "literature": [],
            "experiment_design": {},
            "experiment_results": {},
            "evaluation": {},
            "discussion": "",
            "paper_sections": {},
            "figures": [],
            "submission": {},
            "artifacts": {},
            "hil_pending": None,
            "hil_queue": [],
            "history": [],
            "versions": [],
            "errors": [],
        }

    def _config(self, agent_id: str) -> dict[str, Any]:
        return {"configurable": {"thread_id": agent_id}}

    # ------------------------------------------------------------------
    async def run(
        self,
        project_id: str,
        question: str,
        discipline: str = "general",
        start_stage: Optional[Stage] = None,
        mode: str = "auto",
        template: str = "markdown",
    ) -> str:
        """启动 Agent 流程，运行至第一个 HIL 中断点或结束。

        mode='auto' 时遇到 HIL 中断点会自动 confirm 继续推进；
        mode='manual' 时遇到 HIL 中断点会暂停，等待 /interrupt 接口恢复。

        返回 agent_id。
        """
        agent_id = uuid.uuid4().hex
        mode = (mode or "auto").lower()
        if mode not in ("auto", "manual"):
            logger.warning("未识别的 mode=%s，回退到 'auto'", mode)
            mode = "auto"
        template = (template or "markdown").lower()
        if template not in ("ctex", "ieee", "journal", "markdown"):
            logger.warning("未识别的 template=%s，回退到 'markdown'", template)
            template = "markdown"

        self._agents[agent_id] = {
            "project_id": project_id,
            "question": question,
            "discipline": discipline,
            "mode": mode,
            "template": template,
            "status": AgentStatusEnum.RUNNING,
            "hil_pending": None,
            "hil_queue": [],
        }

        if start_stage and start_stage != Stage.LITERATURE:
            # 当前骨架为线性状态机，暂不支持从中间阶段切入；记录到日志
            logger.info(
                "start_stage=%s 暂未实现跳过，将从 literature 开始（agent_id=%s）",
                start_stage,
                agent_id,
            )

        initial = self._initial_state(
            agent_id, project_id, question, discipline, mode, template, start_stage
        )
        config = self._config(agent_id)

        try:
            await self._graph.ainvoke(initial, config=config)
        except Exception as e:  # noqa: BLE001
            logger.exception("Agent 运行失败：%s", e)
            self._agents[agent_id]["status"] = AgentStatusEnum.ERROR
            return agent_id

        # auto 模式：自动穿越所有 HIL 中断点（一次性推完）
        if mode == "auto":
            await self._auto_pass_hil(agent_id)

        self._refresh_status(agent_id)
        return agent_id

    async def _auto_pass_hil(self, agent_id: str) -> None:
        """auto 模式下循环唤醒 graph，直到所有 HIL 中断点全部通过或流程结束。"""
        config = self._config(agent_id)
        max_steps = 10  # 4 个 HIL 节点，安全余量
        for _ in range(max_steps):
            snap = self._graph.get_state(config)
            nxt = snap.next or ()
            if not nxt:
                # 流程已结束
                return
            if nxt[0] not in INTERRUPT_BEFORE:
                # 下一个不是 HIL 中断点（说明已经过了），跳出
                return
            # auto 模式：写入空 payload（视为 confirm）后 ainvoke(None) 继续
            try:
                await self._graph.ainvoke(None, config=config)
            except Exception as e:  # noqa: BLE001
                logger.warning("auto 模式推进 HIL 失败：%s", e)
                return

    # ------------------------------------------------------------------
    async def interrupt(
        self,
        agent_id: str,
        action: HILAction,
        payload: Optional[dict[str, Any]] = None,
    ) -> AgentStatus:
        """响应人审中断。"""
        if agent_id not in self._agents:
            raise KeyError(f"agent 不存在：{agent_id}")

        meta = self._agents[agent_id]
        config = self._config(agent_id)

        if action == HILAction.ABORT:
            meta["status"] = AgentStatusEnum.ABORTED
            meta["hil_pending"] = None
            logger.info("Agent 已中止（agent_id=%s）", agent_id)
            return self.get_status(agent_id)

        # confirm / edit / rollback 后均恢复执行
        if action == HILAction.EDIT and payload:
            # 用 payload 中的字段覆盖 state（如修改 experiment_design 等）
            try:
                self._graph.update_state(config, values=payload)
            except Exception as e:  # noqa: BLE001
                logger.warning("update_state(edit) 失败：%s", e)

        if action == HILAction.ROLLBACK:
            restored = self._rollback_values(agent_id, payload)
            if restored:
                try:
                    self._graph.update_state(config, values=restored)
                except Exception as e:  # noqa: BLE001
                    logger.warning("update_state(rollback) 失败：%s", e)
            else:
                logger.info("无可回滚的版本快照，直接恢复执行")

        # 恢复执行
        meta["status"] = AgentStatusEnum.RUNNING
        meta["hil_pending"] = None
        try:
            await self._graph.ainvoke(None, config=config)
        except Exception as e:  # noqa: BLE001
            logger.exception("Agent 恢复运行失败：%s", e)
            meta["status"] = AgentStatusEnum.ERROR
            return self.get_status(agent_id)

        # auto 模式：可能还有后续 HIL 中断点，继续自动通过
        if meta.get("mode") == "auto":
            await self._auto_pass_hil(agent_id)

        self._refresh_status(agent_id)
        return self.get_status(agent_id)

    async def resume(self, agent_id: str) -> AgentStatus:
        """恢复执行（等价于 confirm）。"""
        return await self.interrupt(agent_id, HILAction.CONFIRM)

    # ------------------------------------------------------------------
    def _rollback_values(
        self, agent_id: str, payload: Optional[dict[str, Any]]
    ) -> dict[str, Any]:
        """从 versions 快照构造回滚值。

        payload 可指定 {"version_index": int}，否则回滚到最近一个快照。
        """
        snap_state = self._graph.get_state(self._config(agent_id))
        versions = (snap_state.values or {}).get("versions", []) or []
        if not versions:
            return {}
        idx = -1
        if payload and isinstance(payload.get("version_index"), int):
            i = payload["version_index"]
            if 0 <= i < len(versions):
                idx = i
        snap = versions[idx]
        # 仅回滚关键内容字段
        return {
            "literature": list(snap.get("literature", []) or []),
            "experiment_design": dict(snap.get("experiment_design", {}) or {}),
            "experiment_results": dict(snap.get("experiment_results", {}) or {}),
            "evaluation": dict(snap.get("evaluation", {}) or {}),
            "paper_sections": dict(snap.get("paper_sections", {}) or {}),
        }

    # ------------------------------------------------------------------
    def _refresh_status(self, agent_id: str) -> None:
        """根据 graph 当前状态刷新元信息中的 status / hil_pending / hil_queue。"""
        meta = self._agents[agent_id]
        snap = self._graph.get_state(self._config(agent_id))
        values: dict[str, Any] = snap.values or {}
        nxt = snap.next or ()

        # 流程结束 → 渲染草稿并写齐 artifacts
        if not nxt:
            meta["status"] = AgentStatusEnum.COMPLETED
            meta["hil_pending"] = None
            self._finalize_artifacts(agent_id, values)
            return

        next_node = nxt[0]
        if next_node in INTERRUPT_BEFORE:
            meta["status"] = AgentStatusEnum.INTERRUPTED
            hil_item = _format_hil_message(next_node, values)
            meta["hil_pending"] = hil_item
            # 把已触发的 HIL 推入 hil_queue
            meta["hil_queue"] = append_hil_queue(values, hil_item)
            try:
                self._graph.update_state(
                    self._config(agent_id),
                    values={"hil_queue": meta["hil_queue"]},
                )
            except Exception as e:  # noqa: BLE001
                logger.warning("update_state(hil_queue) 失败：%s", e)
        else:
            meta["status"] = AgentStatusEnum.RUNNING
            meta["hil_pending"] = None

    def _finalize_artifacts(self, agent_id: str, values: dict[str, Any]) -> None:
        """流程结束时把 draft_text 渲染写进 artifacts。

        draft_text 取决于 template；其它核心字段已由各 node 写入。
        """
        template = (self._agents[agent_id].get("template") or "markdown").lower()
        artifacts = dict(values.get("artifacts", {}) or {})

        # 兼容处理：node 写入 artifacts[key] 时可能用 dict 包裹（payload），
        # 渲染层需要的是真正的 list / dict。统一 unwrap 一次。
        def _unwrap(value: Any, inner_key: str) -> Any:
            """如果 value 是 dict 且包含 inner_key，则返回 value[inner_key]；否则原样返回。"""
            if isinstance(value, dict) and inner_key in value:
                return value[inner_key]
            return value

        # 注入 question 方便模板渲染
        artifacts["question"] = values.get("question", "")
        # 顶层核心字段：优先取 values 的真正 list / dict（不是 node 写入时的 wrapper）
        artifacts["literature"] = _unwrap(
            values.get("literature") or artifacts.get("literature"), "literature"
        )
        artifacts["design"] = _unwrap(
            values.get("experiment_design") or artifacts.get("design"), "design"
        )
        artifacts["experiment"] = _unwrap(
            values.get("experiment_results") or artifacts.get("experiment"),
            "experiment",
        )
        artifacts["evaluation"] = _unwrap(
            values.get("evaluation") or artifacts.get("evaluation"), "evaluation"
        )
        artifacts["discussion"] = _unwrap(
            values.get("discussion") or artifacts.get("discussion"), "discussion"
        )
        artifacts["paper_sections"] = _unwrap(
            values.get("paper_sections") or artifacts.get("paper_sections"),
            "paper_sections",
        )
        artifacts["figures"] = _unwrap(
            values.get("figures") or artifacts.get("figures"), "figures"
        )
        artifacts["submission"] = _unwrap(
            values.get("submission") or artifacts.get("submission"), "submission"
        )
        artifacts["hil_queue"] = values.get("hil_queue", []) or []

        try:
            draft = render_draft(artifacts, template=template)
        except Exception as e:  # noqa: BLE001
            logger.warning("render_draft 失败，降级为 markdown：%s", e)
            draft = render_draft(artifacts, template="markdown")
        artifacts["draft_text"] = draft

        # 持久化回 graph state
        try:
            self._graph.update_state(
                self._config(agent_id),
                values={"artifacts": artifacts},
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("update_state(artifacts) 失败：%s", e)

    # ------------------------------------------------------------------
    def get_status(self, agent_id: str) -> AgentStatus:
        """查询 Agent 状态。"""
        if agent_id not in self._agents:
            raise KeyError(f"agent 不存在：{agent_id}")

        meta = self._agents[agent_id]
        snap = self._graph.get_state(self._config(agent_id))
        values: dict[str, Any] = snap.values or {}

        # 同步 stage 字段（优先用 graph state 中的值）
        stage = values.get("stage", Stage.LITERATURE)
        stage_val = stage.value if isinstance(stage, Stage) else str(stage)

        # 组装 artifacts 容器（前端主用）
        def _unwrap(value: Any, inner_key: str) -> Any:
            if isinstance(value, dict) and inner_key in value:
                return value[inner_key]
            return value

        artifacts = dict(values.get("artifacts", {}) or {})
        artifacts["literature"] = _unwrap(
            values.get("literature") or artifacts.get("literature"), "literature"
        )
        artifacts["design"] = _unwrap(
            values.get("experiment_design") or artifacts.get("design"), "design"
        )
        artifacts["experiment"] = _unwrap(
            values.get("experiment_results") or artifacts.get("experiment"),
            "experiment",
        )
        artifacts["evaluation"] = _unwrap(
            values.get("evaluation") or artifacts.get("evaluation"), "evaluation"
        )
        artifacts["discussion"] = _unwrap(
            values.get("discussion") or artifacts.get("discussion"), "discussion"
        )
        artifacts["paper_sections"] = _unwrap(
            values.get("paper_sections") or artifacts.get("paper_sections"),
            "paper_sections",
        )
        artifacts["figures"] = _unwrap(
            values.get("figures") or artifacts.get("figures"), "figures"
        )
        artifacts["submission"] = _unwrap(
            values.get("submission") or artifacts.get("submission"), "submission"
        )
        artifacts["hil_queue"] = values.get("hil_queue", []) or []

        return AgentStatus(
            agent_id=agent_id,
            project_id=meta["project_id"],
            question=meta["question"],
            discipline=meta["discipline"],
            mode=meta.get("mode", "auto"),
            template=meta.get("template", "markdown"),
            stage=stage_val,
            status=meta["status"],
            literature=values.get("literature", []) or [],
            experiment_design=values.get("experiment_design", {}) or {},
            experiment_results=values.get("experiment_results", {}) or {},
            evaluation=values.get("evaluation", {}) or {},
            discussion=values.get("discussion", "") or "",
            paper_sections=values.get("paper_sections", {}) or {},
            figures=values.get("figures", []) or [],
            submission=values.get("submission", {}) or {},
            artifacts=artifacts,
            hil_pending=meta.get("hil_pending"),
            history=values.get("history", []) or [],
            errors=values.get("errors", []) or [],
        )

    def list_agents(self) -> list[str]:
        """返回所有 agent_id。"""
        return list(self._agents.keys())


# 模块级单例
orchestrator = Orchestrator()


def get_orchestrator() -> Orchestrator:
    """获取全局 Orchestrator 单例。"""
    return orchestrator
