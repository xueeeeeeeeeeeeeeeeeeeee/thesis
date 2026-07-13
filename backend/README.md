# rap-backend

科研自动化 Agent 系统（RAP）API 网关。

基于 Node.js + Express + TypeScript 实现，作为前端与 Python LLM 服务之间的 API 网关，
负责项目管理、LLM 代理、RAG 代理与 WebSocket 事件广播。

## 技术栈

- Node.js 20+ / Express 4 / TypeScript
- ws（WebSocket）
- axios（调用 Python LLM 服务）
- cors / helmet / morgan
- dotenv / uuid
- ts-node-dev（热重载开发）

## 目录结构

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── index.ts                # 入口（HTTP + WebSocket 共享端口）
    ├── app.ts                  # Express app 配置
    ├── config/index.ts         # 环境变量配置
    ├── routes/                 # 路由层
    ├── controllers/            # 控制器层
    ├── services/               # 服务层（LLM 代理 / 项目存储 / WebSocket）
    ├── middleware/             # 中间件（错误处理 / 日志）
    ├── types/index.ts          # 类型定义
    └── utils/response.ts       # 统一响应封装
```

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制示例配置并按需修改：

```bash
cp .env.example .env
```

默认配置：

```env
PORT=3001
LLM_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### 3. 启动开发服务

```bash
npm run dev
```

启动后访问：

- HTTP: http://localhost:3001
- WebSocket: ws://localhost:3001/ws
- 健康检查: http://localhost:3001/health

### 4. 生产构建

```bash
npm run build
npm start
```

## 依赖说明

本服务作为 API 网关，依赖 Python LLM 服务（默认运行在 `http://localhost:8000`）。

**重要：即使 Python 服务未启动，本服务也能独立启动**，调用 LLM/RAG 接口时会返回友好的 503 错误提示。

## API 路由

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 服务健康检查 |

### 项目管理 `/api/projects`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| GET | `/api/projects/:id` | 项目详情 |
| POST | `/api/projects` | 创建项目 |
| PATCH | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| POST | `/api/projects/:id/advance` | 推进到下一阶段 |
| POST | `/api/projects/:id/rollback` | 回滚到指定阶段/版本 |

**创建项目请求体：**

```json
{
  "name": "示例项目",
  "discipline": "计算机科学",
  "question": "如何提升 RAG 检索精度？",
  "description": "可选描述"
}
```

**项目阶段：** `topic` → `literature` → `hypothesis` → `experiment` → `analysis` → `writing` → `review`

### LLM 代理 `/api/llm`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/llm/chat` | 通用对话 |
| POST | `/api/llm/agents/run` | 触发 Agent 运行 |
| GET | `/api/llm/agents/:id/status` | Agent 状态查询 |
| POST | `/api/llm/agents/:id/interrupt` | HIL 中断响应 |
| GET | `/api/llm/models` | 可用模型列表 |

### RAG 代理 `/api/rag`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/rag/query` | 检索 |
| POST | `/api/rag/ingest` | 导入文献 |
| GET | `/api/rag/sources` | 数据源列表 |

### WebSocket 状态 `/api/ws`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ws` | WebSocket 服务状态与客户端列表 |
| POST | `/api/ws/broadcast` | 手动广播事件 |

## WebSocket 事件

连接地址：`ws://localhost:3001/ws`

服务端会广播以下事件类型：

| 事件类型 | 说明 |
|---------|------|
| `agent_progress` | Agent 执行进度 |
| `log_line` | 日志行 |
| `hil_required` | 需要人工介入 |
| `stage_change` | 项目阶段变更 |
| `experiment_status` | 实验状态变更 |
| `heartbeat` | 心跳 |
| `connected` | 连接成功 |

消息结构：

```json
{
  "type": "stage_change",
  "payload": { "projectId": "...", "from": "topic", "to": "literature" },
  "timestamp": "2026-06-28T00:00:00.000Z"
}
```

## 统一响应格式

所有接口统一返回：

```json
{
  "code": 0,
  "data": {},
  "message": "成功"
}
```

错误时：

```json
{
  "code": -1,
  "data": null,
  "message": "错误描述"
}
```

## 数据存储

当前项目数据使用内存 `Map` 存储，服务重启后数据会丢失。后续将接入 SQLite/Postgres 持久化。

## 验证

启动服务后可用以下命令验证：

```bash
# 健康检查
curl http://localhost:3001/health

# 项目列表（应返回空数组）
curl http://localhost:3001/api/projects

# 创建项目
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"测试项目","discipline":"CS","question":"测试问题"}'
```
