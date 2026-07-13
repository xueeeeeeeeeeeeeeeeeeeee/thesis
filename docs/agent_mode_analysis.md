# RAP Agent 编排模式分析：ReAct / Plan / Workflow 的取舍

> 用途：AI 产品经理面试素材 · 技术理解力章节
> 核心结论：本项目使用 **预定义工作流（Workflow / 状态机）**，不是 ReAct，也不是 Plan-and-Execute。

---

## 一、结论

RAP 的 Agent 编排层是 **预定义工作流（Workflow）**，基于 LangGraph `StateGraph` 构建：
- 整体：8 节点固定线性流水线，边由开发者在代码中写死，LLM 不参与"下一步去哪"的决策。
- 节点内：硬编码的工具调用序列 + 单次 LLM 总结，没有 Thought→Action→Observation 的反思循环。

设计原则一句话：**流程确定性交给代码，内容生成不确定性交给 LLM。**

---

## 二、三种模式对比

| 模式 | 核心机制 | 谁决定下一步 | 适用场景 | 代价 |
|------|---------|------------|---------|------|
| **ReAct** | Thought→Action→Observation 循环，LLM 自主反思 | LLM 每步自主决定 | 开放式探索、工具组合不可预知 | 不可控、易跑偏、token 消耗大 |
| **Plan-and-Execute** | 先 LLM 生成完整计划，再逐步执行 | LLM 一次性规划 | 任务结构已知但步骤动态 | 规划错则全错，重规划贵 |
| **Workflow（本项目）** | 人工预设节点 + 边，代码编排 | 开发者预先定义 | 流程确定、阶段清晰的领域 | 灵活性低，新增阶段要改图 |

---

## 三、本项目的实际实现

### 3.1 整体编排层

文件：`llm_service/src/agents/orchestrator.py`

LangGraph `StateGraph` 构建 8 阶段状态机，节点用 `add_edge` 串成**固定线性流水线**：

```python
workflow.add_node("literature_review", literature_node)
workflow.add_node("design", design_node)
workflow.add_node("experiment", experiment_node)
# ... 8 个节点

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
    interrupt_before=INTERRUPT_BEFORE,  # 4 个 HIL 中断点
)
```

边是写死的，**LLM 不参与路由决策**。4 个 HIL 中断点通过 `interrupt_before` 精确卡住：

```python
INTERRUPT_BEFORE = ["design", "experiment", "discuss", "figure"]
```

### 3.2 单节点内部

文件：`llm_service/src/agents/literature_agent.py`

以文献调研节点为例，内部是**硬编码的工具调用序列 + 单次 LLM 总结**，不是 ReAct 循环：

```python
async def node(state: AgentState) -> dict[str, Any]:
    question = state.get("question", "")

    # 步骤1: 本地 RAG 检索
    rag_docs = await get_rag_service().query(question, top_k=5)

    # 步骤2: arXiv 检索
    arxiv_docs = await search_arxiv(question, limit=5)

    # 步骤3: Semantic Scholar 检索
    s2_docs = await search_s2(question, limit=5)

    # 步骤4: 合并为统一文献列表
    literature =