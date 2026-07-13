"""Agent 编排接口。

- POST /agents/run             启动 Agent 流程（支持 mode + template）
- GET  /agents/{id}/status     查询 Agent 状态（返回 artifacts）
- POST /agents/{id}/interrupt  人审中断响应
- POST /agents/{id}/resume     恢复执行
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.agents.orchestrator import get_orchestrator
from src.models.schemas import (
    AgentInterruptRequest,
    AgentRunRequest,
    AgentStatus,
)
from src.utils.logger import get_logger

logger = get_logger("src.api.agents")

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/run")
async def run_agent(req: AgentRunRequest) -> dict:
    """启动 Agent 流程，返回 agent_id 与初始状态。"""
    orch = get_orchestrator()
    agent_id = await orch.run(
        project_id=req.project_id,
        question=req.question,
        discipline=req.discipline,
        start_stage=req.start_stage,
        mode=req.mode,
        template=req.template,
    )
    status = orch.get_status(agent_id)
    return {"agent_id": agent_id, "status": status}


@router.get("/{agent_id}/status", response_model=AgentStatus)
async def get_status(agent_id: str) -> AgentStatus:
    """查询 Agent 状态（含 artifacts / hil_pending）。"""
    orch = get_orchestrator()
    try:
        return orch.get_status(agent_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{agent_id}/interrupt", response_model=AgentStatus)
async def interrupt_agent(agent_id: str, req: AgentInterruptRequest) -> AgentStatus:
    """响应人审中断。"""
    orch = get_orchestrator()
    try:
        return await orch.interrupt(agent_id, req.action, req.payload)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{agent_id}/resume", response_model=AgentStatus)
async def resume_agent(agent_id: str) -> AgentStatus:
    """恢复执行（等价于 confirm）。"""
    orch = get_orchestrator()
    try:
        return await orch.resume(agent_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
