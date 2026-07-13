# 科研自动化 Agent 系统 — 流程图

> 适用：通用学科 / 通用领域
> Agent 框架：**LangGraph**（状态机 + checkpoint + interrupt，原生支持 Human-in-the-loop 与长流程恢复）
> 部署：本地（开发验证）→ 云端（生产运行）

---

## 一、系统总体架构图

```mermaid
flowchart TB
    subgraph User[" 用户层 "]
        U1[研究者]
        U2[审阅/确认]
    end

    subgraph Orchestrator[" Orchestrator 主控层 (LangGraph StateGraph) "]
        SG[StateGraph 状态机]
        CP[(Checkpoint 持久化)]
        INT{{Interrupt 中断点}}
        SG --- CP
        SG --- INT
    end

    subgraph Agents[" Specialist Agent 层 "]
        A1[Literature Agent<br/>文献调研]
        A2[Experiment Design Agent<br/>实验设计]
        A3[Experiment Runner Agent<br/>实验执行]
        A4[Result Evaluation Agent<br/>结果评价]
        A5[Discussion Agent<br/>讨论分析]
        A6[Writing Agent<br/>论文撰写]
        A7[Figure Agent<br/>配图生成]
        A8[Submission Agent<br/>投稿流程]
    end

    subgraph Tools[" 工具与外部服务层 "]
        T1[Semantic Scholar API]
        T2[arXiv API]
        T3[WebSearch]
        T4[Python 沙箱]
        T5[向量数据库<br/>文献检索]
        T6[matplotlib / TikZ]
        T7[LaTeX 编译器]
        T8[Overleaf / 期刊 API]
    end

    subgraph Storage[" 产物存储层 "]
        S1[(Artifact Store<br/>结构化产物)]
        S2[(Refs DB<br/>文献库)]
        S3[(Logs<br/>运行日志)]
    end

    U1 --> SG
    SG --> A1 & A2 & A3 & A4 & A5 & A6 & A7 & A8
    A1 --> T1 & T2 & T3 & T5
    A3 --> T4
    A4 --> T4
    A6 --> T7
    A7 --> T6
    A8 --> T8
    A1 & A2 & A3 & A4 & A5 & A6 & A7 & A8 --> S1
    A1 --> S2
    SG --> S3
    INT -.人工确认.-> U2
    U2 -.确认/回退.-> SG
```

---

## 二、主流程时序图（端到端）

```mermaid
sequenceDiagram
    participant U as 研究者
    participant O as Orchestrator
    participant L as Literature Agent
    participant D as Design Agent
    participant R as Runner Agent
    participant E as Eval Agent
    participant Dis as Discussion Agent
    participant W as Writing Agent
    participant F as Figure Agent
    participant S as Submission Agent

    U->>O: 1. 提交科学问题 + 约束
    O->>O: 初始化 state.json
    O->>L: 2. 触发文献调研
    L-->>O: refs.bib + review.md
    O->>U: 🔴 HIL-1: 文献综述确认
    U-->>O: 确认 / 补充关键词
    O->>D: 3. 触发实验设计
    D-->>O: hypothesis.md + protocol.md
    O->>U: 🔴 HIL-2: 实验方案确认
    U-->>O: 确认 / 修改变量
    O->>R: 4. 触发实验执行
    R->>R: 生成可复现代码
    R-->>O: raw_data + code + logs
    O->>E: 5. 触发结果评价
    E->>E: 计算 metrics + 显著性检验
    E-->>O: metrics.csv + stats.md + 中间图
    O->>U: 🔴 HIL-3: 结果评价确认
    U-->>O: 确认 / 重跑实验
    O->>Dis: 6. 触发讨论生成
    Dis-->>O: discussion.md
    O->>W: 7. 触发论文撰写
    W-->>O: sections/*.tex
    O->>F: 8. 触发配图生成
    F-->>O: figures/*.pdf
    O->>W: 9. 组装 main.tex + 编译
    W-->>O: main.pdf
    O->>U: 🔴 HIL-4: 终稿确认
    U-->>O: 确认投稿
    O->>S: 10. 触发投稿流程
    S-->>O: 选刊 + cover_letter + 投稿包
    S-->>U: 投稿跟踪
```

---

## 三、状态机图（LangGraph StateGraph）

```mermaid
stateDiagram-v2
    [*] --> INIT: 提交科学问题
    INIT --> LITERATURE: 启动
    LITERATURE --> HIL_REVIEW: 综述完成
    HIL_REVIEW --> LITERATURE: 修改关键词 (回退)
    HIL_REVIEW --> DESIGN: 确认
    DESIGN --> HIL_DESIGN: 方案完成
    HIL_DESIGN --> DESIGN: 修改方案 (回退)
    HIL_DESIGN --> EXPERIMENT: 确认
    EXPERIMENT --> EVALUATE: 数据就绪
    EVALUATE --> HIL_RESULT: 评价完成
    HIL_RESULT --> EXPERIMENT: 重跑实验 (回退)
    HIL_RESULT --> DISCUSS: 确认
    DISCUSS --> WRITE: 讨论完成
    WRITE --> FIGURE: 章节完成
    FIGURE --> COMPILE: 配图完成
    COMPILE --> HIL_FINAL: PDF 生成
    HIL_FINAL --> WRITE: 修改论文 (回退)
    HIL_FINAL --> SUBMIT: 确认投稿
    SUBMIT --> [*]: 投稿完成

    note right of HIL_REVIEW
        🔴 Human-in-the-loop #1
        Checkpoint 持久化
    end note
    note right of HIL_DESIGN
        🔴 Human-in-the-loop #2
    end note
    note right of HIL_RESULT
        🔴 Human-in-the-loop #3
    end note
    note right of HIL_FINAL
        🔴 Human-in-the-loop #4
    end note
```

---

## 四、数据流图（Artifact 流转）

```mermaid
flowchart LR
    Q[科学问题<br/>question.md] --> L
    subgraph L[Literature 阶段]
        L1[refs.bib]
        L2[review.md]
        L3[(向量库)]
    end
    L --> D
    subgraph D[Design 阶段]
        D1[hypothesis.md]
        D2[protocol.md]
        D3[variables.yaml]
    end
    D --> R
    subgraph R[Experiment 阶段]
        R1[run.py]
        R2[(raw/)]
        R3[logs/]
    end
    R --> E
    subgraph E[Evaluation 阶段]
        E1[metrics.csv]
        E2[stats.md]
        E3[figs_draft/]
    end
    E --> Dis
    L & E --> Dis[discussion.md]
    L & D & R & E & Dis --> W
    subgraph W[Writing 阶段]
        W1[sections/*.tex]
        W2[main.tex]
    end
    E --> F[figures/*.pdf]
    F & W --> C[main.pdf]
    C --> S[submission/<br/>cover_letter.md<br/>选刊报告]
    S --> END([投稿])
```

---

## 五、Agent 依赖与调用关系图

```mermaid
flowchart TD
    O[Orchestrator]

    O --> A1[Literature Agent]
    O --> A2[Experiment Design Agent]
    O --> A3[Experiment Runner Agent]
    O --> A4[Result Evaluation Agent]
    O --> A5[Discussion Agent]
    O --> A6[Writing Agent]
    O --> A7[Figure Agent]
    O --> A8[Submission Agent]

    A2 -. reads .-> A1
    A3 -. reads .-> A2
    A4 -. reads .-> A3
    A5 -. reads .-> A1
    A5 -. reads .-> A4
    A6 -. reads .-> A1
    A6 -. reads .-> A2
    A6 -. reads .-> A4
    A6 -. reads .-> A5
    A7 -. reads .-> A4
    A8 -. reads .-> A6
    A8 -. reads .-> A7

    style O fill:#ffe4b5,stroke:#333,stroke-width:2px
    style A1 fill:#e0f7fa
    style A6 fill:#f3e5f5
```

---

## 六、本地 → 云端演进流程

```mermaid
flowchart LR
    subgraph Local[" 本地开发验证阶段 "]
        L1[Python venv<br/>+ 本地 LLM API]
        L2[LangGraph<br/>in-memory checkpointer]
        L3[本地文件系统<br/>artifact store]
        L4[手动触发 + CLI]
        L1 --> L2 --> L3 --> L4
    end

    subgraph Cloud[" 云端生产运行阶段 "]
        C1[容器化<br/>Docker]
        C2[LangGraph Platform<br/>Postgres checkpointer]
        C3[对象存储<br/>S3 artifact]
        C4[Web UI / API<br/>+ 异步队列]
        C5[GPU 算力池<br/>实验执行]
        C1 --> C2 --> C3 --> C4
        C4 --> C5
    end

    Local -- 验证通过 --> Cloud
    Cloud -- 反馈/迭代 --> Local
```

---

## 七、关键子流程：实验执行 Agent 内部流程

```mermaid
flowchart TD
    Start([protocol.md]) --> Parse[解析实验方案<br/>变量/指标/样本量]
    Parse --> Gen[生成实验代码<br/>run.py]
    Gen --> Sanity[静态检查<br/>语法+依赖]
    Sanity -->|fail| Gen
    Sanity -->|pass| DryRun[小样本 Dry Run]
    DryRun -->|fail| Debug[日志分析<br/>自动修复]
    Debug --> Gen
    DryRun -->|pass| Full[全量运行]
    Full --> Save[(raw/ 落盘)]
    Save --> Log[(logs/ 落盘)]
    Log --> End([交给 Eval Agent])
```

---

## 八、HIL（Human-in-the-loop）中断恢复机制

```mermaid
sequenceDiagram
    participant U as 用户
    participant O as Orchestrator
    participant CP as Checkpoint Store

    O->>CP: 1. 进入 HIL 节点前 checkpoint
    O->>U: 2. 推送待审阅 artifact
    Note over U: 用户离线/思考
    U-->>O: 3. 返回决策（确认/修改/回退）
    alt 确认
        O->>CP: 4a. 标记节点完成，前进
    else 修改
        O->>CP: 4b. 更新 state，重新进入节点
    else 回退
        O->>CP: 4c. 加载历史 checkpoint，回退
    end
    Note over CP: 任一分支均持久化，支持崩溃恢复
```

---

## 九、版本管理流程（多轮实验迭代）

```mermaid
flowchart TD
    Start([项目启动]) --> V1[创建 v1 baseline]
    V1 --> Run1[实验 + 评价]
    Run1 --> Snap1[快照 v1<br/>artifact_ids 集合]
    Snap1 --> HIL1{HIL-3 确认}
    HIL1 -- 修改方案 --> Diff1[diff v1 → 工作区]
    Diff1 --> Run2[新一轮实验]
    Run2 --> Snap2[快照 v2<br/>parent=v1]
    Snap2 --> HIL2{HIL-3 确认}
    HIL2 -- 满意 --> Write[论文撰写<br/>基于 v_current]
    HIL2 -- 再迭代 --> Run3[新一轮实验]
    Run3 --> Snap3[快照 v3<br/>parent=v2]

    Snap1 & Snap2 & Snap3 -.-> VM[( _versions/<br/>manifest.json )]

    VM --> CLI[rap version list]
    VM --> Diff[rap version diff v1 v3]
    VM --> RB[rap version rollback v2]

    style V1 fill:#ffe4b5
    style Snap1 fill:#e0f7fa
    style Snap2 fill:#e0f7fa
    style Snap3 fill:#e0f7fa
    style VM fill:#f3e5f5
```

---

## 十、LLM 路由流程（API / 本地 / Hybrid）

```mermaid
flowchart TD
    Req([Agent 请求 LLM]) --> Tier{判断档位}
    Tier -->|strong 推理/写作| R1
    Tier -->|long 长文综述| R2
    Tier -->|cheap 抽取/格式化| R3
    Tier -->|embed 向量| R4

    subgraph R1[强模型路由]
        R1A{mode?}
        R1A -- api/hybrid --> DS[DeepSeek-R1 API]
        R1A -- local --> QW32[Qwen2.5-32B 本地]
    end

    subgraph R2[长文路由]
        R2A{mode?}
        R2A -- api/hybrid --> Kimi[Kimi 200K API]
        R2A -- local --> QW1M[Qwen2.5-1M 实验]
    end

    subgraph R3[廉模型路由]
        R3A{mode?}
        R3A -- api --> DS3[DeepSeek-V3 API]
        R3A -- local/hybrid --> QW7[Qwen2.5-7B 本地]
    end

    subgraph R4[嵌入路由]
        R4A{mode?}
        R4A -- api --> BGEa[bge-m3 API]
        R4A -- local/hybrid --> BGEl[bge-m3 本地]
    end

    DS & QW32 & Kimi & QW1M & DS3 & QW7 & BGEa & BGEl --> FB{失败?}
    FB -- 是 --> Fb[降级到 fallback 链]
    FB -- 否 --> Budget{Token 预算检查}
    Budget -- 超限 --> Abort[抛 BudgetExceeded]
    Budget -- 通过 --> Ret([返回结果])

    style DS fill:#ffe4b5
    style Kimi fill:#ffe4b5
    style QW7 fill:#e0f7fa
    style BGEl fill:#e0f7fa
```

---

## 十一、中文论文生成流程（CTeX 模板）

```mermaid
flowchart LR
    Up[上游 artifact<br/>中文 review/discussion/metrics] --> W[Writing Agent]
    W --> Sel{config.language?}
    Sel -- zh --> CTeX[CTeX 模板<br/>ctexart / ctexrep]
    Sel -- en --> Std[标准模板<br/>IEEE / ACM / article]

    CTeX --> Sec[生成中文章节<br/>摘要/引言/方法/实验/讨论/结论]
    Sec --> Cite[插入 refs.bib 引用<br/>强制来源校验]
    Cite --> Fig[插入 figures/*.pdf<br/>中文图注]
    Fig --> Compile[xelatex → bibtex → xelatex ×2]
    Compile --> Check{编译成功?}
    Check -- 否 --> Fix[字体/宏包兜底<br/>自动修复]
    Fix --> Compile
    Check -- 是 --> PDF[main.pdf 中文版]

    style CTeX fill:#ffe4b5
    style PDF fill:#e0f7fa
```

