# RAP LLM Service

科研自动化 Agent 系统（RAP）的 Agent 编排 + RAG + LLM 路由层服务。

## 技术栈

- Python 3.11+
- FastAPI + Uvicorn
- LangGraph（Agent 状态机编排）
- LangChain（LLM 抽象）
- pydantic v2
- httpx（异步 HTTP 客户端）
- chromadb（向量数据库，本地嵌入式）
- rank_bm25（BM25 检索）
- sentence-transformers（bge-m3 嵌入 + bge-reranker，懒加载）

## 安装

```bash
cd llm_service
pip install -r requirements.txt
```

## 配置

复制 `.env.example` 为 `.env`，按需配置 LLM API Key：

```bash
cp .env.example .env
```

支持以下 LLM Provider（按需配置，至少一个即可使用 LLM 功能）：

- DeepSeek（R1 / V3）
- Kimi（200K 长文本）
- Qwen（备用）

> 服务本身可以在没有任何 API Key 的情况下成功启动，`/health`、`/info`、`/llm/models` 等不依赖 Key 的接口正常可用；调用 LLM 时若未配置 Key 会返回 503 + 友好错误信息。

## 启动

```bash
uvicorn src.main:app --reload --port 8000
```

服务默认监听 `0.0.0.0:8000`。

## 接口概览

### 健康检查 & 信息
- `GET /health` 健康检查
- `GET /info` 显示配置信息（脱敏 Key）

### LLM 路由
- `POST /llm/chat` 对话（按 tier 路由模型）
- `GET /llm/models` 返回四档分级模型清单

### Agent 编排
- `POST /agents/run` 启动 Agent 流程
- `GET /agents/{id}/status` 查询 Agent 状态
- `POST /agents/{id}/interrupt` 人审中断响应
- `POST /agents/{id}/resume` 恢复执行

### RAG 检索
- `POST /rag/query` 混合检索
- `POST /rag/ingest` 文档导入
- `GET /rag/sources` 数据源列表
- `DELETE /rag/documents/{id}` 删除文档

## 验证

```bash
# 健康检查
curl http://localhost:8000/health

# 模型清单
curl http://localhost:8000/llm/models

# RAG 检索（无数据时返回空列表）
curl http://localhost:8000/rag/query -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
```

## 四档分级 LLM 路由

| Tier | 用途 | 默认模型 |
| --- | --- | --- |
| `strong` | 复杂推理 | DeepSeek-R1 |
| `economical` | 常规对话 | DeepSeek-V3 |
| `long_text` | 长文本 | Kimi 200K |
| `embedding` | 向量化 | bge-m3 |

## 8 阶段 Agent 状态机

```
literature → design → experiment → evaluate → discuss → write → figure → submit
```

4 个 HIL（Human-in-the-Loop）中断点：
- literature 后（确认文献方向）
- design 后（确认实验方案）
- evaluate 后（确认结果评价）
- write 后（确认论文初稿）

## 注意事项

- `sentence-transformers` / `chromadb` 等重型依赖**懒加载**，不会在启动时加载模型权重
- 首次调用 RAG / Embedding 时才会下载模型权重
- RAG 服务在没有数据时返回空列表，不会报错
- Agent 状态目前用内存字典存储（后续可接 LangGraph checkpointer）
