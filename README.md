# Research Auto-Pilot (RAP)

科研自动化 Agent 系统 —— 从科学问题出发，端到端覆盖文献调研、实验设计、实验执行、结果评价、讨论、论文撰写、画图、投稿全流程。

## 技术栈

| 层 | 技术 | 端口 | 说明 |
|----|------|------|------|
| 前端 | React 18 + Vite + TS + Ant Design 5 + Zustand | 5173 | 前后端分离，独立部署 |
| 后端 | Node.js 20 + Express + TypeScript + ws | 3001 | API 网关 + WebSocket 推送 |
| LLM 服务 | Python 3.11 + FastAPI + LangGraph + LangChain | 8000 | Agent 编排 + RAG + LLM 路由 |

## 顶层目录

```
thesis/
├── docs/              # 已有：PRD/流程图/UI 原型/Figma Plugin
├── frontend/          # React 前端
├── backend/           # Node.js 后端 (API 网关)
├── llm_service/       # Python LLM 服务 (Agent + RAG)
├── docker-compose.yml # 一键启动
└── README.md
```

## 快速启动

```bash
# 1. 启动 LLM 服务（Python）
cd llm_service && pip install -r requirements.txt && uvicorn src.main:app --reload --port 8000

# 2. 启动后端（Node.js）
cd backend && npm install && npm run dev

# 3. 启动前端（React）
cd frontend && npm install && npm run dev

# 或一键启动
docker-compose up -d
```

## 核心架构

- **状态机**：8 阶段 LITERATURE → DESIGN → EXPERIMENT → EVALUATE → DISCUSS → WRITE → FIGURE → SUBMIT
- **HIL 中断点**：4 个（综述/方案/结果/终稿），支持 confirm/edit/rollback/abort
- **国产 LLM 四档分级**：强(DeepSeek-R1) / 廉(DeepSeek-V3) / 长文(Kimi 200K) / 嵌入(bge-m3)
- **RAG 混合检索**：向量 + BM25 + 元数据过滤 + bge-reranker
- **版本管理**：每轮 EXPERIMENT→EVALUATE 自动快照到 `_versions/vN/`
- **冷启动**：RAG 懒加载，按需从 arXiv/S2/OpenAlex 拉取

详细设计见 `docs/PRD.md` 与 `docs/flowchart.md`。
