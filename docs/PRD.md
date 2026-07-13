# PRD — 科研自动化 Agent 系统

| 字段 | 内容 |
|---|---|
| 项目名称 | Research Auto-Pilot（科研自动化 Agent 系统） |
| 版本 | v1.0 |
| 文档状态 | Draft |
| 适用范围 | 通用学科 / 通用领域 |
| Agent 框架 | LangGraph（推荐） |
| 部署路径 | 本地验证 → 云端生产 |
| 创建日期 | 2026-06-28 |

---

## 1. 背景与动机

科研工作者在完成一项研究时，需要跨越「文献调研 → 实验设计 → 实验执行 → 结果分析 → 讨论 → 论文撰写 → 配图 → 投稿」八大阶段。每个阶段都需要不同的工具栈、知识背景与人工协调，导致：

- **重复劳动多**：文献检索、格式排版、图表重画等占用大量时间；
- **跨阶段割裂**：综述、实验、写作常使用不同工具，数据难追溯；
- **复现性差**：实验过程散落在多份脚本中，缺乏统一记录；
- **流程难审计**：从假设到结论的推理链不透明，难复盘。

本系统通过 **多 Agent 协作 + 状态机编排**，将端到端科研流程自动化，并在关键节点保留人工审阅，目标是让研究者专注「科学判断」而非「流程操作」。

---

## 2. 目标与非目标

### 2.1 目标（Goals）

| # | 目标 | 衡量指标 |
|---|---|---|
| G1 | 端到端覆盖科研全生命周期 8 个阶段 | 8 个 Agent 全部上线，状态机闭环 |
| G2 | 通用学科适配 | 通过 ≥3 个跨学科 case 验证（如 NLP / 材料 / 生物信息） |
| G3 | 关键节点 Human-in-the-loop | 4 个 HIL 中断点可中断/回退/恢复 |
| G4 | 实验可复现 | 实验代码独立可运行，raw data + logs 完整落盘 |
| G5 | 论文产物可直接投稿 | 生成 main.pdf + cover letter + 选刊报告 |
| G6 | 本地→云端无缝迁移 | 同一套 LangGraph 代码本地 / 云端均可运行 |
| G7 | 中文论文输出 | 默认产出中文论文（CTeX 模板），可切英文 |
| G8 | 实验版本管理 | 同一项目支持多轮实验迭代，可对比、可回溯 |
| G9 | LLM 国产化 | 默认国产模型（DeepSeek / GLM / Qwen / Kimi） |

### 2.2 非目标（Non-Goals）

- ❌ 取代研究者的科学判断与原创性思考；
- ❌ 自动发现科学问题（v1 仅接受用户输入问题）；
- ❌ 执行湿实验操作（仅支持计算模拟、公开数据集、API 实验）；
- ❌ 保证论文被接收（仅产出符合格式要求的投稿包）；
- ❌ 替代同行评审；
- ❌ 团队协作 / 多用户共享 state（v1 单用户）；
- ❌ 限定投稿目标（保持开源 / 顶会 / 综合期刊全开放）。

---

## 3. 用户角色与场景

### 3.1 角色

| 角色 | 描述 | 关键诉求 |
|---|---|---|
| 主研究者 | 提出问题、做关键科学决策 | 流程自动化 + 可控 |
| 协作者 | 审阅中间产物 | 可视化 artifact + 评论 |
| 复现者 | 后续复现实验 | 完整代码 + 数据 + 日志 |

### 3.2 核心使用场景

**场景 A：通用计算实验**
用户输入「对比算法 X 与算法 Y 在数据集 D 上的性能差异及原因」，系统自动完成文献调研、设计消融实验、跑代码、统计检验、画对比图、写论文。

**场景 B：公开数据集分析**
用户输入「基于公开 GEO 数据集分析基因 G 在疾病 Z 中的表达差异」，系统调取数据、设计统计分析、生成图表与讨论。

**场景 C：跨学科探索**
研究者本人不熟悉某子领域，系统通过文献 Agent 快速构建综述，帮助设计可执行的最小验证实验。

---

## 4. 功能需求

### 4.1 功能模块清单

| 模块 | 功能点 | 优先级 |
|---|---|---|
| F1 Orchestrator | 状态机编排、Checkpoint、HIL 中断 | P0 |
| F2 Literature Agent | 文献检索、去重、综述生成、bib 管理 | P0 |
| F3 Experiment Design Agent | 假设生成、实验方案、变量与指标定义 | P0 |
| F4 Experiment Runner Agent | 代码生成、dry-run、全量执行、日志 | P0 |
| F5 Result Evaluation Agent | metrics 计算、显著性检验、统计图 | P0 |
| F6 Discussion Agent | 机理分析、对比、局限性、未来工作 | P1 |
| F7 Writing Agent | 章节生成、LaTeX 模板、引用插入 | P0 |
| F8 Figure Agent | 终版图、TikZ/matplotlib、矢量输出 | P0 |
| F9 Submission Agent | 选刊推荐、格式适配、cover letter | P1 |
| F10 Artifact Store | 结构化产物落盘、版本化 | P0 |
| F11 CLI / Web UI | 触发、查看、审阅 | P1（CLI P0 / Web P2） |

### 4.2 详细需求

#### F1 Orchestrator

- **F1.1** 基于 LangGraph `StateGraph` 实现，节点对应 8 个 Agent + 4 个 HIL 中断点。
- **F1.2** 状态持久化到 `state.json` 与 Checkpoint Store（本地：SQLite / 内存；云端：Postgres）。
- **F1.3** 支持 4 种 HIL 决策：`confirm` / `edit` / `rollback` / `abort`。
- **F1.4** 支持崩溃恢复：重启后从最近 checkpoint 继续。
- **F1.5** 全流程日志可追溯（每个节点 entry/exit/decision）。

#### F2 Literature Agent

- **F2.1** 输入：科学问题 + 关键词 + 时间范围 + 学科。
- **F2.2** 工具：Semantic Scholar API、arXiv API、WebSearch、向量检索（Chroma/FAISS）。
- **F2.3** 输出：
  - `refs.bib`（去重 + 格式化）
  - `review.md`（综述，含研究空白分析）
  - 向量库索引（供后续 Agent 检索）
- **F2.4** 质量要求：覆盖 ≥10 篇近 3 年文献，含 ≥2 篇综述类。

#### F3 Experiment Design Agent

- **F3.1** 输入：问题 + 综述。
- **F3.2** 输出：
  - `hypothesis.md`：可证伪假设
  - `protocol.md`：实验方案（变量、控制、样本量、随机化）
  - `variables.yaml`：结构化变量定义
  - `metrics_def.yaml`：评估指标定义
- **F3.3** 必须包含：消融实验、基线对比、统计功效分析。

#### F4 Experiment Runner Agent

- **F4.1** 输入：`protocol.md` + `variables.yaml`。
- **F4.2** 输出：
  - `code/run.py`（独立可运行）
  - `code/requirements.txt`
  - `raw/`（原始数据）
  - `logs/`（运行日志，含 stdout/stderr/资源占用）
- **F4.3** 流程：生成 → 静态检查 → 小样本 dry-run → 失败自动修复（≤3 次）→ 全量运行。
- **F4.4** 禁止「伪跑」：所有数据必须真实生成。

#### F5 Result Evaluation Agent

- **F5.1** 输入：`raw/` + `metrics_def.yaml`。
- **F5.2** 输出：
  - `metrics.csv`
  - `stats.md`（含 t 检验 / Mann-Whitney / ANOVA / 置信区间）
  - `figs_draft/`（中间图：boxplot、ROC、confusion 等）
- **F5.3** 必须报告效应量（effect size），不仅 p 值。

#### F6 Discussion Agent

- **F6.1** 输入：结果 + 文献库。
- **F6.2** 输出：`discussion.md`，含：
  - 结果解释（与假设对照）
  - 与文献对比
  - 机理推测
  - 局限性
  - 未来工作

#### F7 Writing Agent

- **F7.1** 输入：所有上游 artifact。
- **F7.2** 输出：
  - `sections/abstract.tex` `intro.tex` `related.tex` `method.tex` `exp.tex` `discussion.tex` `conclusion.tex`
  - `main.tex`（组装 + 引用插入）
  - `main.pdf`（编译产物）
- **F7.3** 引用必须来自 `refs.bib`，禁止幻觉引用。
- **F7.4** 支持多种模板（IEEE / ACM / Nature / 双栏通用）。

#### F8 Figure Agent

- **F8.1** 输入：`metrics.csv` + 章节需求。
- **F8.2** 输出：`figures/*.pdf`（矢量）+ `figures/*.png`（预览）。
- **F8.3** 工具：matplotlib（数据图）、TikZ（流程图）、Seaborn（统计图）。
- **F8.4** 风格统一：字体、配色、坐标轴规范。

#### F9 Submission Agent

- **F9.1** 输入：`main.pdf` + 元信息。
- **F9.2** 输出：
  - 选刊报告（匹配度、影响因子、审稿周期）
  - `cover_letter.md`
  - 格式适配后的投稿包
- **F9.3** 不自动点击投稿按钮，仅产出包，由用户最后确认。

---

## 5. 非功能需求

| 维度 | 要求 |
|---|---|
| **可复现性** | 每个 artifact 含 `provenance.json`，记录生成 agent、LLM 版本、输入 hash、时间戳 |
| **可审计性** | 全流程日志，可导出为单一 zip 包复盘 |
| **可扩展性** | Agent 通过注册机制接入，新增学科适配器无需改 Orchestrator |
| **可移植性** | 本地 / 云端同一份代码，差异仅在 config 与 checkpointer |
| **成本** | 单次完整流程 LLM token 预算 ≤ 50 万（含强模型 + 廉模型分级） |
| **延迟** | 单 Agent 节点 ≤ 5 分钟（实验执行除外，受算力限制） |
| **安全** | 代码沙箱隔离，禁止网络外联（白名单仅 API 域名） |
| **国际化** | 默认中文论文输出（CTeX 模板），可切换英文 |
| **版本管理** | 单项目支持多轮实验迭代，每轮含独立 artifact 集合，可对比、可回溯、可分支 |
| **LLM 国产化** | 默认接入国产模型，强/弱/长上下文/本地四档分级 |

---

## 6. 系统接口

### 6.1 用户接口

- **CLI**（P0）：`rap run --question question.md --config config.yaml`
- **Web UI**（P2）：artifact 浏览、HIL 审阅、日志查看
- **Config**（YAML）：
  ```yaml
  project:
    name: "case-001"
    domain: "NLP"          # 通用则填 general
    language: "zh"         # zh | en  论文输出语言
  llm:
    provider: "deepseek"   # deepseek | glm | qwen | kimi | local
    strong_model: "deepseek-reasoner"   # 推理 / 写作
    cheap_model: "deepseek-chat"        # 抽取 / 格式化
    long_ctx_model: "moonshot-v1-200k"  # 长文献综述（可选）
    local_model: null                   # 本地部署时填路径，如 qwen2.5-14b
    mode: "api"           # api | local | hybrid
  apis:
    semantic_scholar: ${SS_API_KEY}
    arxiv: ""
  hil:
    enabled: true
    points: [review, design, result, final]
  versioning:
    enabled: true
    strategy: "snapshot"  # snapshot | git
    keep_latest: 5
  runtime:
    env: "local"           # local | cloud
    sandbox: "docker"
  ```

### 6.2 Agent 间接口（Artifact Schema）

每个 artifact 必须满足：

```json
{
  "artifact_id": "uuid",
  "type": "review|protocol|raw_data|metrics|discussion|tex|figure|submission",
  "produced_by": "agent_name",
  "produced_at": "ISO-8601",
  "input_refs": ["artifact_id_1", "artifact_id_2"],
  "schema_version": "1.0",
  "content_path": "01_literature/review.md",
  "provenance": {
    "llm": "gpt-4o-2024-xx",
    "tools_used": ["semantic_scholar", "web_search"],
    "token_usage": 12345
  }
}
```

---

## 7. Agent 框架与 LLM 选型说明

### 7.1 Agent 框架：LangGraph

| 框架 | 状态机 | Checkpoint | HIL | 部署 | 生态 | 评分 |
|---|---|---|---|---|---|---|
| **LangGraph** | ✅ 一等公民 | ✅ 原生 | ✅ interrupt | 本地/云 | LangChain 生态 | ⭐⭐⭐⭐⭐ |
| CrewAI | 角色-based | 弱 | 弱 | 本地 | 中 | ⭐⭐⭐ |
| AutoGen | 对话-based | 弱 | 中 | 本地 | 中 | ⭐⭐⭐ |
| 自研 | 自定义 | 自研 | 自研 | 自定义 | — | ⭐⭐（成本高） |

选择 LangGraph 的理由：强状态依赖、Checkpoint 原生、interrupt API、本地→云端零改动、LangChain 工具生态。

### 7.2 LLM 选型：国产模型四档分级

按用途分四档，可单档或多档组合：

| 档位 | 用途 | API 推荐 | 本地部署推荐 | 上下文 |
|---|---|---|---|---|
| **强模型** | 推理 / 写作 / 假设生成 | DeepSeek-R1（reasoner）/ GLM-4.5 / Qwen-Max | DeepSeek-R1-Distill-32B / Qwen2.5-32B | 64K+ |
| **廉模型** | 抽取 / 格式化 / 分类 | DeepSeek-V3 / GLM-4-Flash / Qwen-Turbo | Qwen2.5-7B / GLM-4-9B | 32K |
| **长上下文** | 文献综述 / 全文阅读 | Kimi moonshot-v1-200k / GLM-4-Long | Qwen2.5-1M（实验性） | 200K–1M |
| **嵌入模型** | 向量库 / 文献检索 | bge-m3 / Qwen-Embedding | bge-large-zh | — |

**默认组合（API 模式）**：
- 强：`deepseek-reasoner`（推理与论文撰写性价比最优）
- 廉：`deepseek-chat`（V3，结构化抽取）
- 长文：`moonshot-v1-200k`（综述阶段调用）
- 嵌入：`bge-m3`（本地或 API 均可）

**默认组合（本地模式）**：见 [docs/LLM_OPTIONS.md](file:///Users/xuee/Desktop/xuee/myproject/thesis/docs/LLM_OPTIONS.md) 详细对比。

### 7.3 接入方式

通过 LangChain 的 `ChatModel` 抽象统一接入，切换 provider 仅改 config：

```python
# 强模型工厂
def get_strong_llm(config):
    p = config.llm.provider
    if p == "deepseek": return ChatDeepSeek(model=config.llm.strong_model)
    if p == "glm":      return ChatZhipuAI(model=config.llm.strong_model)
    if p == "qwen":     return ChatTongyi(model=config.llm.strong_model)
    if p == "kimi":     return ChatMoonshot(model=config.llm.strong_model)
    if p == "local":    return ChatOllama(model=config.llm.local_model)
```

---

## 8. 数据模型（state.json 摘要）

```json
{
  "project_id": "case-001",
  "language": "zh",
  "current_node": "HIL_RESULT",
  "current_version": "v3",
  "versions": [
    {
      "version": "v1",
      "label": "baseline",
      "created_at": "ISO-8601",
      "parent": null,
      "artifact_ids": ["a1","a2","a3","a4","a5"],
      "diff_from_parent": "init"
    },
    {
      "version": "v2",
      "label": "add-ablation",
      "parent": "v1",
      "artifact_ids": ["a1","a2","a3","a6","a7"],
      "diff_from_parent": "experiment+evaluate"
    },
    {
      "version": "v3",
      "label": "current",
      "parent": "v2",
      "artifact_ids": ["a1","a2","a3","a6","a8"],
      "diff_from_parent": "evaluate"
    }
  ],
  "history": [
    {"node": "LITERATURE", "status": "done", "artifact_ids": ["a1","a2"]},
    {"node": "HIL_REVIEW", "status": "confirmed", "decision": "confirm"},
    {"node": "DESIGN", "status": "done", "artifact_ids": ["a3"]},
    {"node": "EXPERIMENT", "status": "done", "artifact_ids": ["a6"]},
    {"node": "EVALUATE", "status": "done", "artifact_ids": ["a8"]}
  ],
  "artifacts": { /* artifact_id -> schema */ },
  "hil_decisions": {
    "HIL_REVIEW": {"by":"user","at":"...","decision":"confirm","comment":""}
  },
  "config_hash": "sha256",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**版本管理语义**：
- 每次 `EXPERIMENT → EVALUATE` 完成即生成新版本快照；
- 每个版本独立持有 artifact_id 集合，未变化的 artifact 通过 id 复用（不复制文件）；
- `rap version list / diff v1 v3 / rollback v2` 命令支持；
- `keep_latest: 5` 自动清理旧版本（标记保留的不清）。

---

## 9. 目录结构（产物落盘）

```
thesis/
├── config.yaml
├── state.json
├── docs/
│   ├── flowchart.md          # 已生成
│   ├── PRD.md                # 本文档
│   └── LLM_OPTIONS.md        # LLM 方案对比
├── 00_question/
│   └── question.md
├── 01_literature/
│   ├── refs.bib
│   ├── review.md             # 中文或英文，按 config.language
│   └── vectorstore/
├── 02_design/
│   ├── hypothesis.md
│   ├── protocol.md
│   ├── variables.yaml
│   └── metrics_def.yaml
├── 03_experiment/
│   ├── code/
│   │   ├── run.py
│   │   └── requirements.txt
│   ├── raw/
│   └── logs/
├── 04_results/
│   ├── metrics.csv
│   ├── stats.md
│   └── figs_draft/
├── 05_discussion/
│   └── discussion.md
├── 06_paper/
│   ├── sections/
│   ├── figures/
│   ├── main.tex              # language=zh 时用 CTeX 模板
│   ├── main.pdf
│   └── refs.bib
├── 07_submission/
│   ├── venue_report.md       # 不限定类型，按产物匹配
│   ├── cover_letter.md
│   └── submission_package.zip
├── _versions/                # 版本管理快照
│   ├── v1/
│   │   ├── manifest.json     # 版本元数据 + artifact_id 列表
│   │   └── state.json.snap
│   ├── v2/
│   └── v3/
└── _meta/
    ├── provenance/
    └── logs/
```

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| LLM 幻觉引用 | 论文可信度崩塌 | 引用强制来自 refs.bib，Writing Agent 后置校验 |
| 国产模型英文场景弱于 GPT | 英文论文质量波动 | language=en 时优先 Qwen-Max，配双语校验 |
| 国产模型工具调用稳定性 | Agent 流程中断 | 关键节点重试 + 兜底廉模型 + JSON schema 强约束 |
| 本地部署显存不足 | 推理 OOM | 按 GPU 显存自动选型（见 LLM_OPTIONS.md） |
| 实验代码不可复现 | 研究失效 | 强制独立可运行 + dry-run + 日志落盘 |
| HIL 节点用户体验差 | 流程停滞 | CLI 即时可审阅，Web UI P2 补齐 |
| 学科适配困难 | 通用性受损 | 学科适配器插件化，先验 case 3 个 |
| LLM 成本失控 | 不可持续 | 强/弱模型分级 + token 预算守门 |
| 外部 API 限流 | 流程中断 | 重试 + 退避 + WebSearch 兜底 |
| 投稿格式频繁变动 | 投稿失败 | 模板与 Submission Agent 解耦，模板独立维护 |
| 版本膨胀磁盘占满 | 存储溢出 | artifact_id 复用 + keep_latest 自动清理 + 大文件软链 |
| 中文 LaTeX 编译失败 | PDF 生成失败 | 强制 CTeX 模板 + 字体兜底 + 编译预检 |

---

## 11. 里程碑与验收

| 里程碑 | 范围 | 验收标准 |
|---|---|---|
| **M0 骨架** | Orchestrator + 1 个 Agent hello-world | 跑通端到端空流程，state.json 正确流转 |
| **M1 文献+设计** | F2 + F3 + HIL-1/2 | 给定问题输出综述 + 方案，人工确认通过 |
| **M2 实验执行+评价** | F4 + F5 + HIL-3 | 跑通 1 个 NLP case，metrics + 统计完整 |
| **M3 论文+图（中文）** | F7 + F8 + HIL-4 | CTeX 模板 main.pdf 编译通过，中文图表完整 |
| **M4 投稿** | F9 + F6 | 产出投稿包（不限定类型），含 cover letter |
| **M5 版本管理** | F10 版本化 + CLI 命令 | 同项目跑 3 轮迭代，可 diff/rollback |
| **M6 通用性验证** | 3 个跨学科 case | NLP / 材料 / 生物信息各跑通 1 例 |
| **M7 LLM 双模式** | API + 本地 + hybrid | 同一 case 在 API / 本地 / hybrid 三种模式跑通 |
| **M8 云端化** | Docker + Postgres + Web UI | 同一 case 本地与云端结果一致 |

---

## 12. 决策记录（已确认）

| # | 问题 | 决策 | 影响章节 |
|---|---|---|---|
| 1 | 默认 LLM 提供商 | **国产模型**（DeepSeek / GLM / Qwen / Kimi 四档分级） | §2.1 G9、§7.2、§6.1 config |
| 2 | 中文论文输出 | **需要**，默认中文（CTeX 模板），可切英文 | §2.1 G7、§5、§9 |
| 3 | 投稿目标预限定 | **不限定**，Submission Agent 按产物匹配 | §4.2 F9、§9 |
| 4 | 实验算力 | **本地 LLM 与 API 两方案均支持，先 API 后本地** | §7.2、新增 [LLM_OPTIONS.md](file:///Users/xuee/Desktop/xuee/myproject/thesis/docs/LLM_OPTIONS.md) |
| 5 | 团队协作 | **暂不设计**（v1 单用户） | §2.2 非目标 |
| 6 | 版本管理 | **需要**，每轮实验自动快照，支持 diff/rollback | §2.1 G8、§8、§9 `_versions/`、§11 M5 |

---

## 13. 附录

### 13.1 术语表

| 术语 | 含义 |
|---|---|
| HIL | Human-in-the-loop，人工介入节点 |
| Artifact | Agent 产出的结构化文件 |
| Checkpoint | 状态机快照，用于恢复 |
| Provenance | 产物溯源信息 |
| Orchestrator | 主控 Agent，负责调度 |

### 13.2 参考流程图

见 [docs/flowchart.md](file:///Users/xuee/Desktop/xuee/myproject/thesis/docs/flowchart.md)。
