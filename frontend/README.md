# 科研自动化 Agent 系统 · RAP Frontend

科研自动化 Agent 系统（Research Auto-Pilot, RAP）的前端项目。基于 React 18 + Vite 5 + TypeScript + Ant Design 5 构建，提供 8 阶段科研流程的可视化编排、人审中断点（HIL）审阅、文献库管理、实验监控、论文编辑与版本管理等能力。

## 技术栈

- **React 18** + **Vite 5** + **TypeScript**
- **Ant Design 5.x**（按需引入，中文 locale）
- **Zustand**（状态管理）
- **React Router 6**（路由）
- **Axios**（HTTP 请求）
- **dayjs**（时间处理）
- **@ant-design/icons**

## 项目结构

```
frontend/
├── package.json          # 依赖与脚本
├── vite.config.ts        # Vite 配置，代理 /api、/ws 到后端 3001
├── tsconfig.json
├── tsconfig.node.json
├── index.html
├── .gitignore
└── src/
    ├── main.tsx          # 入口，挂载 ConfigProvider zhCN
    ├── App.tsx           # 路由配置
    ├── vite-env.d.ts
    ├── styles/global.css # 全局样式
    ├── layouts/MainLayout.tsx   # 侧边栏 + 顶栏布局
    ├── pages/            # 8 个页面
    │   ├── Dashboard.tsx        # 仪表盘
    │   ├── Workbench.tsx        # 项目工作台
    │   ├── HILReview.tsx        # 人审中断点审阅
    │   ├── Literature.tsx       # 文献库
    │   ├── Experiment.tsx       # 实验监控
    │   ├── PaperEditor.tsx      # 论文编辑器
    │   ├── Version.tsx          # 版本管理
    │   └── Config.tsx           # 配置页
    ├── components/        # 公共组件
    ├── store/             # Zustand 状态管理
    ├── services/          # axios / WebSocket 封装
    ├── types/             # 共享 TypeScript 类型
    └── constants/         # 8 阶段状态机常量
```

## 8 阶段科研流程

系统将科研流程拆分为 8 个阶段：

1. **文献**（literature）— 检索、筛选、整理论文，构建 RAG 知识库
2. **设计**（design）— 生成研究方案、假设与实验设计
3. **实验**（experiment）— 执行代码、训练模型、采集指标
4. **评价**（evaluation）— 评估实验结果，对照基线
5. **讨论**（discussion）— 分析结论，挖掘创新点与局限
6. **撰写**（writing）— 撰写论文各章节初稿
7. **画图**（figure）— 生成图表、流程图与可视化
8. **投稿**（submission）— 格式化与目标期刊/会议投稿

其中包含 4 个人审中断点（HIL）：文献筛选、方案确认、实验准入、论文定稿。

## 启动方式

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 5173）
npm run dev

# 类型检查
npm run lint

# 构建生产包（仅打包，本任务未要求执行）
npm run build
```

启动后访问：http://localhost:5173

## 代理说明

Vite 开发服务器配置了代理：

| 路径 | 转发目标 | 说明 |
|------|---------|------|
| `/api` | http://localhost:3001 | 后端 REST API |
| `/ws`  | http://localhost:3001 | WebSocket（实时推送） |

后端未就绪时，前端使用内置 mock 数据填充页面，所有 8 个页面均可正常浏览与交互，不会因接口缺失而报错。

## 页面说明

- **仪表盘**：项目统计卡片、项目列表表格、最近活动时间线、新建项目弹窗
- **项目工作台**：8 步阶段 Steps、阶段时间线、HIL 中断点提示、Agent 输出区、继续/暂停/回滚操作
- **人审中断点**：待审阅列表 + Agent 提议 + 用户编辑器 + 决策按钮（通过/编辑/回滚/中止）
- **文献库**：搜索栏（关键词/学科/来源多选）、文献表格、详情抽屉（分段展示）
- **实验监控**：实验列表 + 代码/日志/指标图表 + 资源占用，实时日志通过 WebSocket 推送
- **论文编辑器**：章节大纲 + Markdown 编辑器（带预览）+ 引用列表与校验状态
- **版本管理**：版本时间线 + 版本表格 + diff 视图
- **系统配置**：LLM 四档模型配置 / RAG 配置 / 学科适配器 / 通用设置

## 注意事项

- 所有界面文本均为中文
- 页面数据为 mock，便于演示
- 代码注释为中文
- TypeScript 类型完整，未使用 any
