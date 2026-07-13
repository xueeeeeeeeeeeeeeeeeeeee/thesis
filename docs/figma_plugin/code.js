// =====================================================================
// Research Auto-Pilot UI Generator for Figma
// 在 Figma 内运行此脚本，自动生成 8 个 UI 页面的原生 Frame
// =====================================================================

// ---------- 颜色（Figma 使用 0-1 浮点 RGB） ----------
const C = {
  primary:   { r: 0.146, g: 0.388, b: 0.922 }, // #2563eb
  primaryLight: { r: 0.91, g: 0.95, b: 1.0 },  // #e8f1ff
  bg:        { r: 1, g: 1, b: 1 },
  bgGray:    { r: 0.97, g: 0.97, b: 0.98 },
  sidebar:   { r: 0.96, g: 0.97, b: 0.99 },
  border:    { r: 0.91, g: 0.93, b: 0.96 },
  text:      { r: 0.13, g: 0.16, b: 0.2 },
  textSub:   { r: 0.4, g: 0.45, b: 0.52 },
  textWhite: { r: 1, g: 1, b: 1 },
  green:     { r: 0.13, g: 0.77, b: 0.37 },  // 运行中
  yellow:    { r: 0.92, g: 0.7, b: 0.03 },   // HIL
  red:       { r: 0.94, g: 0.27, b: 0.27 },  // 错误
  gray:      { r: 0.58, g: 0.62, b: 0.66 },  // 完成
  cardBg:    { r: 1, g: 1, b: 1 },
  shadow:    { r: 0, g: 0, b: 0 },
  code:      { r: 0.07, g: 0.08, b: 0.1 },
  codeText:  { r: 0.85, g: 0.88, b: 0.92 },
};

const FONT = { family: "Inter", style: "Regular" };
const FONT_BOLD = { family: "Inter", style: "Bold" };
const FONT_MONO = { family: "JetBrains Mono", style: "Regular" };

const W = 1440, H = 900; // 单页尺寸
const GAP = 80;          // 页面间距

// ---------- 辅助函数 ----------
function solid(color, opacity = 1) {
  return [{ type: "SOLID", color, opacity }];
}

function makeFrame(name, w, h, fill, layout = "NONE") {
  const f = figma.createFrame();
  f.name = name;
  f.resize(w, h);
  f.fills = fill ? solid(fill) : [];
  if (layout !== "NONE") {
    f.layoutMode = layout;
    f.itemSpacing = 12;
    f.paddingTop = 24;
    f.paddingBottom = 24;
    f.paddingLeft = 24;
    f.paddingRight = 24;
  }
  return f;
}

async function makeText(text, opts = {}) {
  const t = figma.createText();
  const font = opts.bold ? FONT_BOLD : (opts.mono ? FONT_MONO : FONT);
  await figma.loadFontAsync(font);
  t.fontName = font;
  t.characters = text;
  t.fontSize = opts.size || 14;
  t.fills = solid(opts.color || C.text);
  if (opts.align) t.textAlignHorizontal = opts.align;
  return t;
}

function makeRect(w, h, fill, radius = 0) {
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = solid(fill);
  if (radius) r.cornerRadius = radius;
  return r;
}

async function makeButton(label, fill, textColor = C.textWhite) {
  const btn = makeFrame(label, 120, 36, fill, "HORIZONTAL");
  btn.primaryAxisSizingMode = "AUTO";
  btn.counterAxisSizingMode = "FIXED";
  btn.itemSpacing = 0;
  btn.paddingTop = 8; btn.paddingBottom = 8;
  btn.paddingLeft = 16; btn.paddingRight = 16;
  btn.primaryAxisAlignItems = "CENTER";
  btn.counterAxisAlignItems = "CENTER";
  btn.cornerRadius = 6;
  const t = await makeText(label, { size: 13, color: textColor, bold: true });
  btn.appendChild(t);
  return btn;
}

async function makeStatusDot(color) {
  const dot = figma.createEllipse();
  dot.resize(10, 10);
  dot.fills = solid(color);
  return dot;
}

async function makeCard(title, body, statusColor) {
  const card = makeFrame("card", 320, 200, C.cardBg, "VERTICAL");
  card.cornerRadius = 8;
  card.strokes = solid(C.border);
  card.strokeWeight = 1;
  card.itemSpacing = 8;
  card.paddingTop = 16; card.paddingBottom = 16;
  card.paddingLeft = 16; card.paddingRight = 16;
  card.effectDropShadow = {
    type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.06 },
    offset: { x: 0, y: 2 }, radius: 8, spread: 0, visible: true, blendMode: "NORMAL"
  };

  // 标题行（含状态点）
  const titleRow = makeFrame("title", 280, 24, null, "HORIZONTAL");
  titleRow.itemSpacing = 8;
  titleRow.counterAxisAlignItems = "CENTER";
  const dot = await makeStatusDot(statusColor);
  const t = await makeText(title, { size: 14, bold: true });
  titleRow.appendChild(dot);
  titleRow.appendChild(t);

  const b = await makeText(body, { size: 12, color: C.textSub });
  card.appendChild(titleRow);
  card.appendChild(b);
  return card;
}

// ---------- 1. Dashboard ----------
async function createDashboard(x, y) {
  const page = makeFrame("01 Dashboard", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 24;

  // 顶栏
  const topbar = makeFrame("topbar", W - 48, 56, C.bg, "HORIZONTAL");
  topbar.itemSpacing = 16;
  topbar.counterAxisAlignItems = "CENTER";
  topbar.paddingTop = 12; topbar.paddingBottom = 12;
  topbar.paddingLeft = 24; topbar.paddingRight = 24;
  topbar.cornerRadius = 8;
  topbar.strokes = solid(C.border); topbar.strokeWeight = 1;
  const logo = await makeText("🧪 Research Auto-Pilot", { size: 16, bold: true, color: C.primary });
  const spacer = makeRect(80, 1, null);
  spacer.layoutGrow = 1;
  const newBtn = await makeButton("+ 新建项目", C.primary);
  topbar.appendChild(logo);
  topbar.appendChild(spacer);
  topbar.appendChild(newBtn);

  // 标题区
  const titleRow = makeFrame("title-row", W - 48, 32, null, "HORIZONTAL");
  titleRow.itemSpacing = 16;
  titleRow.counterAxisAlignItems = "CENTER";
  const h1 = await makeText("Dashboard", { size: 24, bold: true });
  const search = makeFrame("search", 280, 32, C.bg, "HORIZONTAL");
  search.counterAxisAlignItems = "CENTER";
  search.paddingLeft = 12; search.paddingRight = 12;
  search.cornerRadius = 6;
  search.strokes = solid(C.border); search.strokeWeight = 1;
  const st = await makeText("🔍 搜索项目...", { size: 13, color: C.textSub });
  search.appendChild(st);
  const sp2 = makeRect(20, 1, null); sp2.layoutGrow = 1;
  titleRow.appendChild(h1);
  titleRow.appendChild(sp2);
  titleRow.appendChild(search);

  // 项目卡片网格
  const grid = makeFrame("grid", W - 48, 480, null, "HORIZONTAL");
  grid.itemSpacing = 20;
  grid.layoutWrap = "WRAP";

  const cards = [
    { name: "case-001", desc: "NLP / Mamba 对比", status: "运行中", color: C.green, node: "EVALUATE", ver: "v3 / 60%" },
    { name: "case-002", desc: "材料 / 钙钛矿稳定性", status: "HIL 待审", color: C.yellow, node: "HIL-DESIGN", ver: "v1 / 25%" },
    { name: "case-003", desc: "生物 / GEO 差异分析", status: "已完成", color: C.gray, node: "已投稿", ver: "v5 / 100%" },
  ];
  for (const c of cards) {
    const card = await makeCard(c.name, `${c.desc}\n节点: ${c.node}\n版本: ${c.ver}\n2分钟前更新`, c.color);
    grid.appendChild(card);
  }

  // 统计条
  const stats = makeFrame("stats", W - 48, 48, C.cardBg, "HORIZONTAL");
  stats.counterAxisAlignItems = "CENTER";
  stats.paddingLeft = 16; stats.paddingRight = 16;
  stats.cornerRadius = 8;
  stats.strokes = solid(C.border); stats.strokeWeight = 1;
  const statText = await makeText("📈 7日活跃: 12 个项目  |  总 token: 4.2M  |  总成本: ¥385", { size: 13, color: C.textSub });
  stats.appendChild(statText);

  page.appendChild(topbar);
  page.appendChild(titleRow);
  page.appendChild(grid);
  page.appendChild(stats);
  return page;
}

// ---------- 2. 项目工作台 ----------
async function createWorkbench(x, y) {
  const page = makeFrame("02 项目工作台", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 20;

  // 标题
  const h1 = await makeText("case-001 / Mamba vs Transformer 长文本对比", { size: 20, bold: true });
  page.appendChild(h1);

  // 状态机进度条
  const sm = makeFrame("state-machine", W - 48, 80, C.cardBg, "HORIZONTAL");
  sm.itemSpacing = 8;
  sm.counterAxisAlignItems = "CENTER";
  sm.paddingLeft = 16; sm.paddingRight = 16;
  sm.cornerRadius = 8;
  sm.strokes = solid(C.border); sm.strokeWeight = 1;
  const nodes = [
    { name: "INIT", done: true }, { name: "LITERATURE", done: true },
    { name: "HIL-1", done: true, hil: true }, { name: "DESIGN", done: true },
    { name: "HIL-2", done: true, hil: true }, { name: "EXPERIMENT", done: true },
    { name: "EVALUATE", done: true, current: true }, { name: "HIL-3", done: false, hil: true },
    { name: "DISCUSS", done: false }, { name: "WRITE", done: false },
    { name: "HIL-4", done: false, hil: true }, { name: "SUBMIT", done: false },
  ];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const color = n.current ? C.primary : (n.done ? C.green : (n.hil ? C.yellow : C.border));
    const box = makeFrame(n.name, 90, 32, color, "HORIZONTAL");
    box.counterAxisAlignItems = "CENTER";
    box.primaryAxisAlignItems = "CENTER";
    box.cornerRadius = 6;
    const t = await makeText(n.name, { size: 11, color: C.textWhite, bold: true });
    box.appendChild(t);
    sm.appendChild(box);
    if (i < nodes.length - 1) {
      const arrow = await makeText("→", { size: 12, color: C.textSub });
      sm.appendChild(arrow);
    }
  }
  page.appendChild(sm);

  // 双栏：左 Agent 状态，右 产物列表
  const cols = makeFrame("cols", W - 48, 280, null, "HORIZONTAL");
  cols.itemSpacing = 20;

  // 左栏
  const left = makeFrame("agent-status", 480, 280, C.cardBg, "VERTICAL");
  left.cornerRadius = 8;
  left.strokes = solid(C.border); left.strokeWeight = 1;
  const leftTitle = await makeText("🤖 当前 Agent: EVALUATE", { size: 14, bold: true });
  const items = [
    "已运行: 2 分 18 秒",
    "Token: 12.4K (强) + 8.2K (廉)",
    "成本: ¥0.18",
    "",
    "[查看日志]  [中断]  [暂停]"
  ];
  left.appendChild(leftTitle);
  for (const it of items) {
    const t = await makeText(it, { size: 12, color: it.startsWith("[") ? C.primary : C.textSub });
    left.appendChild(t);
  }

  // 右栏
  const right = makeFrame("artifacts", W - 48 - 500, 280, C.cardBg, "VERTICAL");
  right.cornerRadius = 8;
  right.strokes = solid(C.border); right.strokeWeight = 1;
  const rightTitle = await makeText("📦 最近产物", { size: 14, bold: true });
  const files = [
    "✅ metrics.csv     2 KB   1分钟前",
    "✅ stats.md        4 KB   1分钟前",
    "🔄 figs_draft/     生成中...",
    "✅ raw/run.py      8 KB   10分钟前",
  ];
  right.appendChild(rightTitle);
  for (const f of files) {
    const t = await makeText(f, { size: 12, color: C.textSub, mono: true });
    right.appendChild(t);
  }
  cols.appendChild(left);
  cols.appendChild(right);
  page.appendChild(cols);

  // 日志面板
  const log = makeFrame("log", W - 48, 280, C.code, "VERTICAL");
  log.cornerRadius = 8;
  log.paddingTop = 16; log.paddingBottom = 16;
  log.paddingLeft = 20; log.paddingRight = 20;
  log.itemSpacing = 4;
  const logTitle = await makeText("📋 实时日志（最后 20 行）", { size: 13, bold: true, color: C.codeText });
  log.appendChild(logTitle);
  const lines = [
    "14:23:01  [EVAL] loading raw/ from 03_experiment/",
    "14:23:03  [EVAL] computing metrics: accuracy, f1, latency",
    "14:23:15  [EVAL] running paired t-test (n=10)",
    "14:23:42  [EVAL] p=0.003, effect_size=0.82",
    "14:23:50  [EVAL] generating boxplot → figs_draft/boxplot.pdf",
    "14:24:01  [EVAL] writing stats.md ...",
    "14:24:08  [EVAL] ✅ done, artifacts: a6, a7",
    "14:24:10  [ORCH] entering HIL_RESULT, awaiting user decision",
  ];
  for (const l of lines) {
    const t = await makeText(l, { size: 11, color: C.codeText, mono: true });
    log.appendChild(t);
  }
  page.appendChild(log);
  return page;
}

// ---------- 3. HIL 审阅页 ----------
async function createHILReview(x, y) {
  const page = makeFrame("03 HIL 审阅页", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 20;

  // 标题（警告色）
  const h1 = await makeText("🔴 HIL-3: 结果评价审阅 — case-001", { size: 20, bold: true, color: C.red });
  const hint = await makeText("⚠️ 系统已暂停，等待你的决策", { size: 13, color: C.textSub });
  page.appendChild(h1);
  page.appendChild(hint);

  // Tab 区
  const tabs = makeFrame("tabs", W - 48, 40, null, "HORIZONTAL");
  tabs.itemSpacing = 4;
  const tabNames = ["metrics.csv", "stats.md", "图表", "实验代码"];
  for (let i = 0; i < tabNames.length; i++) {
    const isActive = i === 0;
    const tab = makeFrame(tabNames[i], 120, 36, isActive ? C.primary : C.bg, "HORIZONTAL");
    tab.counterAxisAlignItems = "CENTER";
    tab.primaryAxisAlignItems = "CENTER";
    tab.cornerRadius = 6;
    const t = await makeText(tabNames[i], { size: 12, color: isActive ? C.textWhite : C.textSub, bold: isActive });
    tab.appendChild(t);
    tabs.appendChild(tab);
  }
  page.appendChild(tabs);

  // 内容区：数据表
  const table = makeFrame("metrics-table", W - 48, 180, C.cardBg, "VERTICAL");
  table.cornerRadius = 8;
  table.strokes = solid(C.border); table.strokeWeight = 1;
  table.itemSpacing = 0;
  table.paddingTop = 0; table.paddingBottom = 0;
  const headers = ["method", "accuracy", "f1", "latency_ms", "params"];
  const rows = [
    ["Transformer", "0.823", "0.819", "45.2", "110M"],
    ["Mamba", "0.847 ← best", "0.843", "28.6", "95M"],
    ["Mamba-small", "0.812", "0.808", "18.3", "45M"],
  ];
  const headerRow = makeFrame("header", W - 50, 32, C.bgGray, "HORIZONTAL");
  headerRow.paddingLeft = 12; headerRow.paddingRight = 12;
  headerRow.counterAxisAlignItems = "CENTER";
  headerRow.itemSpacing = 24;
  for (const h of headers) {
    const t = await makeText(h, { size: 12, bold: true, color: C.textSub });
    headerRow.appendChild(t);
  }
  table.appendChild(headerRow);
  for (const row of rows) {
    const r = makeFrame("row", W - 50, 32, C.bg, "HORIZONTAL");
    r.paddingLeft = 12; r.paddingRight = 12;
    r.counterAxisAlignItems = "CENTER";
    r.itemSpacing = 24;
    r.strokes = solid(C.border); r.strokeWeight = 1;
    for (const cell of row) {
      const t = await makeText(cell, { size: 12, mono: true });
      r.appendChild(t);
    }
    table.appendChild(r);
  }
  page.appendChild(table);

  // 统计结论
  const stat = makeFrame("stat", W - 48, 60, C.primaryLight, "VERTICAL");
  stat.cornerRadius = 8;
  stat.paddingTop = 12; stat.paddingBottom = 12;
  stat.paddingLeft = 16; stat.paddingRight = 16;
  const s1 = await makeText("Paired t-test (Transformer vs Mamba):", { size: 12, bold: true, color: C.primary });
  const s2 = await makeText("t = -4.21, p = 0.003, Cohen's d = 0.82 (large effect)   95% CI: [0.018, 0.036]", { size: 12, color: C.text, mono: true });
  stat.appendChild(s1);
  stat.appendChild(s2);
  page.appendChild(stat);

  // Agent 备注
  const note = makeFrame("note", W - 48, 80, C.bg, "VERTICAL");
  note.cornerRadius = 8;
  note.strokes = solid(C.border); note.strokeWeight = 1;
  note.paddingTop = 12; note.paddingBottom = 12;
  note.paddingLeft = 16; note.paddingRight = 16;
  const n1 = await makeText("💬 Agent 备注", { size: 12, bold: true, color: C.primary });
  const n2 = await makeText("Mamba 在长文本上显著优于 Transformer (p<0.01)，效应量大。建议进入讨论阶段。是否还需要补充消融实验？", { size: 12, color: C.text });
  note.appendChild(n1);
  note.appendChild(n2);
  page.appendChild(note);

  // 决策按钮
  const actions = makeFrame("actions", W - 48, 48, null, "HORIZONTAL");
  actions.itemSpacing = 12;
  const b1 = await makeButton("✅ 确认，继续讨论", C.green);
  const b2 = await makeButton("✏️ 修改方案重跑", C.primary);
  const b3 = await makeButton("⏪ 回退到实验设计", C.yellow, C.text);
  const b4 = await makeButton("🛑 中止", C.red);
  actions.appendChild(b1);
  actions.appendChild(b2);
  actions.appendChild(b3);
  actions.appendChild(b4);
  page.appendChild(actions);
  return page;
}

// ---------- 4. 文献库浏览 ----------
async function createLiterature(x, y) {
  const page = makeFrame("04 文献库", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 16;

  const h1 = await makeText("📚 文献库 — case-001   [共 87 篇 | 1.2K 段落]", { size: 20, bold: true });
  page.appendChild(h1);

  const search = makeFrame("search", W - 48, 40, C.bg, "HORIZONTAL");
  search.counterAxisAlignItems = "CENTER";
  search.paddingLeft = 16; search.paddingRight = 16;
  search.cornerRadius = 8;
  search.strokes = solid(C.border); search.strokeWeight = 1;
  const st = await makeText("🔍 语义检索...                              [筛选▾] [年份▾] [学科▾]", { size: 13, color: C.textSub });
  search.appendChild(st);
  page.appendChild(search);

  // 双栏
  const cols = makeFrame("cols", W - 48, 540, null, "HORIZONTAL");
  cols.itemSpacing = 16;

  // 左栏：文献列表
  const list = makeFrame("list", 480, 540, C.cardBg, "VERTICAL");
  list.cornerRadius = 8;
  list.strokes = solid(C.border); list.strokeWeight = 1;
  list.itemSpacing = 8;
  const listTitle = await makeText("文献列表 (87)", { size: 13, bold: true });
  list.appendChild(listTitle);
  const papers = [
    "★ Gu & Dao 2024\n  Mamba: Linear-Time...\n  arXiv:2312.00752  引用 423\n  🏷 NLP, SSM",
    "  Vaswani 2017\n  Attention Is All You Need\n  arXiv:1706.03762  引用 95K\n  🏷 NLP",
    "  Dao & Gu 2024\n  Transformers are SSMs\n  arXiv:2406.07587  引用 78\n  🏷 NLP",
    "  Wang 2024\n  Mamba-2: Transformers...\n  引用 156",
  ];
  for (const p of papers) {
    const item = makeFrame("paper", 440, 88, C.bg, "VERTICAL");
    item.paddingLeft = 12; item.paddingRight = 12;
    item.paddingTop = 10; item.paddingBottom = 10;
    item.cornerRadius = 6;
    item.strokes = solid(C.border); item.strokeWeight = 1;
    item.itemSpacing = 2;
    const t = await makeText(p, { size: 11, mono: true });
    item.appendChild(t);
    list.appendChild(item);
  }
  cols.appendChild(list);

  // 右栏：详情
  const detail = makeFrame("detail", W - 48 - 496, 540, C.cardBg, "VERTICAL");
  detail.cornerRadius = 8;
  detail.strokes = solid(C.border); detail.strokeWeight = 1;
  detail.itemSpacing = 8;
  const dt = await makeText("详情：Mamba: Linear-Time Sequence Modeling...", { size: 13, bold: true });
  const meta = await makeText("📄 PDF   🌐 arXiv   📊 引用 423", { size: 12, color: C.textSub });
  const abs = await makeText("摘要\nWe introduce Mamba, a new state space model architecture showing promise in long-context modeling...", { size: 12 });
  const sections = await makeText("📑 章节切片（已嵌入向量库）\n  • Abstract\n  • 1. Introduction\n  • 2. State Space Models\n  • 3. Selective SSM\n  • 4. Experiments\n  • 5. Discussion", { size: 12, mono: true });
  detail.appendChild(dt);
  detail.appendChild(meta);
  detail.appendChild(abs);
  detail.appendChild(sections);
  cols.appendChild(detail);
  page.appendChild(cols);
  return page;
}

// ---------- 5. 实验监控 ----------
async function createExperiment(x, y) {
  const page = makeFrame("05 实验监控", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 16;

  const h1 = await makeText("🧪 实验监控 — case-001 / v3", { size: 20, bold: true });
  page.appendChild(h1);

  // 上半：控制 + 资源
  const top = makeFrame("top", W - 48, 160, null, "HORIZONTAL");
  top.itemSpacing = 16;

  // 运行控制
  const ctrl = makeFrame("ctrl", 480, 160, C.cardBg, "VERTICAL");
  ctrl.cornerRadius = 8;
  ctrl.strokes = solid(C.border); ctrl.strokeWeight = 1;
  const ctrlTitle = await makeText("运行控制", { size: 13, bold: true });
  const ctrlItems = [
    "状态: 🟢 运行中",
    "已运行: 12 分 45 秒",
    "进度: 3/5 实验配置",
    "[⏸ 暂停]  [⏹ 停止]"
  ];
  ctrl.appendChild(ctrlTitle);
  for (const it of ctrlItems) {
    const t = await makeText(it, { size: 12, color: it.startsWith("[") ? C.primary : C.text });
    ctrl.appendChild(t);
  }
  top.appendChild(ctrl);

  // 资源监控
  const res = makeFrame("res", W - 48 - 496, 160, C.cardBg, "VERTICAL");
  res.cornerRadius = 8;
  res.strokes = solid(C.border); res.strokeWeight = 1;
  const resTitle = await makeText("资源监控", { size: 13, bold: true });
  res.appendChild(resTitle);
  const resources = [
    { name: "CPU", val: 68, suffix: "  68%   16核" },
    { name: "内存", val: 52, suffix: "  52%   24GB" },
    { name: "GPU", val: 92, suffix: "  92%   RTX 4090" },
    { name: "磁盘", val: 18, suffix: "  18%   4.2GB used" },
  ];
  for (const r of resources) {
    const row = makeFrame(r.name, 600, 24, null, "HORIZONTAL");
    row.itemSpacing = 12;
    row.counterAxisAlignItems = "CENTER";
    const label = await makeText(r.name, { size: 12, bold: true });
    const barBg = makeRect(200, 8, C.border, 4);
    const barFg = makeRect(200 * r.val / 100, 8, C.primary, 4);
    barFg.x = 0; barFg.y = 0;
    barBg.appendChild(barFg);
    const val = await makeText(r.suffix, { size: 11, color: C.textSub, mono: true });
    row.appendChild(label);
    row.appendChild(barBg);
    row.appendChild(val);
    res.appendChild(row);
  }
  top.appendChild(res);
  page.appendChild(top);

  // 实验配置列表
  const expList = makeFrame("exp-list", W - 48, 160, C.cardBg, "VERTICAL");
  expList.cornerRadius = 8;
  expList.strokes = solid(C.border); expList.strokeWeight = 1;
  const expTitle = await makeText("实验配置列表", { size: 13, bold: true });
  expList.appendChild(expTitle);
  const exps = [
    ["1", "baseline-trans", "✅ done", "2m 12s", "acc=0.823"],
    ["2", "baseline-mamba", "✅ done", "1m 48s", "acc=0.847"],
    ["3", "mamba-small", "🟢 run", "0m 35s", "-"],
    ["4", "mamba-ablation", "⏳ pending", "-", "-"],
  ];
  for (const e of exps) {
    const row = makeFrame("exp-row", W - 50, 24, null, "HORIZONTAL");
    row.itemSpacing = 24;
    row.counterAxisAlignItems = "CENTER";
    row.paddingLeft = 12; row.paddingRight = 12;
    for (let i = 0; i < e.length; i++) {
      const color = i === 2 ? (e[2].includes("run") ? C.green : (e[2].includes("done") ? C.gray : C.textSub)) : C.text;
      const t = await makeText(e[i], { size: 11, mono: true, color });
      row.appendChild(t);
    }
    expList.appendChild(row);
  }
  page.appendChild(expList);

  // 实时日志
  const log = makeFrame("log", W - 48, 280, C.code, "VERTICAL");
  log.cornerRadius = 8;
  log.paddingTop = 12; log.paddingBottom = 12;
  log.paddingLeft = 16; log.paddingRight = 16;
  log.itemSpacing = 3;
  const logTitle = await makeText("实时日志", { size: 13, bold: true, color: C.codeText });
  log.appendChild(logTitle);
  const lines = [
    "[run.py] 2026-06-28 14:23:01 INFO loading dataset longbench...",
    "[run.py] 2026-06-28 14:23:15 INFO model=mamba-small, batch=32",
    "[run.py] 2026-06-28 14:23:42 INFO eval pass 1/5, acc=0.781",
    "[run.py] 2026-06-28 14:24:01 INFO eval pass 2/5, acc=0.795",
    "[run.py] 2026-06-28 14:24:20 INFO eval pass 3/5, acc=0.790",
    "[run.py] 2026-06-28 14:24:35 INFO eval pass 4/5, acc=0.788",
    "[run.py] 2026-06-28 14:24:50 INFO eval pass 5/5, acc=0.792",
    "[run.py] 2026-06-28 14:25:02 INFO ✅ done, final acc=0.790±0.006",
  ];
  for (const l of lines) {
    const t = await makeText(l, { size: 11, color: C.codeText, mono: true });
    log.appendChild(t);
  }
  page.appendChild(log);
  return page;
}

// ---------- 6. 论文编辑器 ----------
async function createPaperEditor(x, y) {
  const page = makeFrame("06 论文编辑器", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 16;

  // 顶栏
  const top = makeFrame("top", W - 48, 48, C.bg, "HORIZONTAL");
  top.counterAxisAlignItems = "CENTER";
  top.paddingLeft = 16; top.paddingRight = 16;
  top.cornerRadius = 8;
  top.strokes = solid(C.border); top.strokeWeight = 1;
  const h1 = await makeText("📝 论文编辑器 — case-001", { size: 16, bold: true });
  const sp = makeRect(20, 1, null); sp.layoutGrow = 1;
  const lang = await makeText("语言: 中文 ▾", { size: 12, color: C.textSub });
  const tpl = await makeText("模板: CTeX ▾", { size: 12, color: C.textSub });
  top.appendChild(h1);
  top.appendChild(sp);
  top.appendChild(lang);
  top.appendChild(tpl);
  page.appendChild(top);

  // 三栏
  const cols = makeFrame("cols", W - 48, 720, null, "HORIZONTAL");
  cols.itemSpacing = 12;

  // 文件树
  const tree = makeFrame("tree", 240, 720, C.cardBg, "VERTICAL");
  tree.cornerRadius = 8;
  tree.strokes = solid(C.border); tree.strokeWeight = 1;
  tree.itemSpacing = 2;
  tree.paddingTop = 12; tree.paddingBottom = 12;
  tree.paddingLeft = 12; tree.paddingRight = 12;
  const treeTitle = await makeText("📂 06_paper/", { size: 12, bold: true });
  tree.appendChild(treeTitle);
  const files = [
    "├ main.tex",
    "├ sections/",
    "│ ├ abstract.tex",
    "│ ├ intro.tex",
    "│ ├ related.tex",
    "│ ├ method.tex",
    "│ ├ exp.tex ◀",
    "│ ├ discussion.tex",
    "│ └ conclusion.tex",
    "├ figures/",
    "│ ├ boxplot.pdf",
    "│ └ roc.pdf",
    "└ refs.bib",
    "",
    "[+ 新章节]"
  ];
  for (const f of files) {
    const isCurrent = f.includes("◀");
    const t = await makeText(f, { size: 11, mono: true, color: isCurrent ? C.primary : C.text, bold: isCurrent });
    tree.appendChild(t);
  }
  cols.appendChild(tree);

  // 编辑器
  const editor = makeFrame("editor", 600, 720, C.code, "VERTICAL");
  editor.cornerRadius = 8;
  editor.paddingTop = 16; editor.paddingBottom = 16;
  editor.paddingLeft = 20; editor.paddingRight = 20;
  editor.itemSpacing = 3;
  const code = [
    "\\section{实验结果}",
    "\\label{sec:exp}",
    "",
    "我们在 LongBench 上对比了 Mamba 与",
    "Transformer 的性能（表~\\ref{tab:1}）。",
    "",
    "\\begin{table}",
    "  \\centering",
    "  \\begin{tabular}{lcc}",
    "  方法 & 准确率 & 延迟 \\\\",
    "  Transformer & 0.823 & 45.2 \\\\",
    "  Mamba & 0.847 & 28.6 \\\\",
    "  \\end{tabular}",
    "\\end{table}",
  ];
  for (let i = 0; i < code.length; i++) {
    const t = await makeText(code[i] || " ", { size: 12, mono: true, color: C.codeText });
    editor.appendChild(t);
  }
  // AI 辅助按钮
  const aiBtns = makeFrame("ai", 600, 36, null, "HORIZONTAL");
  aiBtns.itemSpacing = 8;
  const ai1 = await makeButton("💡 AI 续写", C.primary);
  const ai2 = await makeButton("🔍 查文献", C.primary);
  editor.appendChild(aiBtns);
  cols.appendChild(editor);

  // PDF 预览
  const preview = makeFrame("preview", W - 48 - 240 - 612, 720, C.cardBg, "VERTICAL");
  preview.cornerRadius = 8;
  preview.strokes = solid(C.border); preview.strokeWeight = 1;
  preview.paddingTop = 16; preview.paddingBottom = 16;
  preview.paddingLeft = 16; preview.paddingRight = 16;
  const pvTitle = await makeText("PDF 预览", { size: 13, bold: true });
  const pvPage = makeFrame("pdf-page", 380, 540, C.bg, "VERTICAL");
  pvPage.cornerRadius = 4;
  pvPage.strokes = solid(C.border); pvPage.strokeWeight = 1;
  pvPage.paddingTop = 24; pvPage.paddingBottom = 24;
  pvPage.paddingLeft = 24; pvPage.paddingRight = 24;
  pvPage.itemSpacing = 8;
  const pvContent = [
    { t: "4. 实验结果", s: 16, b: true },
    { t: "我们在 LongBench 上对比了 Mamba 与 Transformer...", s: 11 },
    { t: "表 1: 性能对比", s: 10, sub: true },
    { t: "[图 1: boxplot]", s: 10, sub: true },
  ];
  for (const c of pvContent) {
    const t = await makeText(c.t, { size: c.s, bold: c.b, color: c.sub ? C.textSub : C.text });
    pvPage.appendChild(t);
  }
  preview.appendChild(pvTitle);
  preview.appendChild(pvPage);
  cols.appendChild(preview);
  page.appendChild(cols);
  return page;
}

// ---------- 7. 版本管理 ----------
async function createVersion(x, y) {
  const page = makeFrame("07 版本管理", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 16;

  const h1 = await makeText("🗂 版本管理 — case-001", { size: 20, bold: true });
  page.appendChild(h1);

  // 版本树（横向）
  const tree = makeFrame("version-tree", W - 48, 80, C.cardBg, "HORIZONTAL");
  tree.cornerRadius = 8;
  tree.strokes = solid(C.border); tree.strokeWeight = 1;
  tree.counterAxisAlignItems = "CENTER";
  tree.paddingTop = 20; tree.paddingBottom = 20;
  tree.paddingLeft = 20; tree.paddingRight = 20;
  tree.itemSpacing = 12;
  const vNodes = [
    { name: "v1 baseline", color: C.gray },
    { name: "v2 add-ablation", color: C.gray },
    { name: "v3 current", color: C.green, current: true },
  ];
  for (let i = 0; i < vNodes.length; i++) {
    const v = vNodes[i];
    const box = makeFrame(v.name, 140, 40, v.color, "HORIZONTAL");
    box.counterAxisAlignItems = "CENTER";
    box.primaryAxisAlignItems = "CENTER";
    box.cornerRadius = 6;
    const t = await makeText(v.name, { size: 12, bold: true, color: C.textWhite });
    box.appendChild(t);
    tree.appendChild(box);
    if (i < vNodes.length - 1) {
      const arrow = await makeText("───", { size: 14, color: C.textSub });
      tree.appendChild(arrow);
    }
  }
  page.appendChild(tree);

  // 双栏
  const cols = makeFrame("cols", W - 48, 560, null, "HORIZONTAL");
  cols.itemSpacing = 16;

  // 左：版本列表
  const list = makeFrame("v-list", 480, 560, C.cardBg, "VERTICAL");
  list.cornerRadius = 8;
  list.strokes = solid(C.border); list.strokeWeight = 1;
  list.itemSpacing = 8;
  const lt = await makeText("版本列表", { size: 13, bold: true });
  list.appendChild(lt);
  const versions = [
    { v: "🟢 v3 current", t: "2小时前", desc: "parent: v2, artifacts: 5" },
    { v: "v2 add-ablation", t: "昨天", desc: "parent: v1, artifacts: 5" },
    { v: "v1 baseline", t: "3天前", desc: "parent: -, artifacts: 5" },
  ];
  for (const ver of versions) {
    const item = makeFrame("v-item", 440, 100, C.bg, "VERTICAL");
    item.paddingTop = 12; item.paddingBottom = 12;
    item.paddingLeft = 16; item.paddingRight = 16;
    item.cornerRadius = 6;
    item.strokes = solid(C.border); item.strokeWeight = 1;
    item.itemSpacing = 4;
    const n = await makeText(ver.v, { size: 13, bold: true });
    const d = await makeText(`${ver.t}\n${ver.desc}`, { size: 11, color: C.textSub, mono: true });
    item.appendChild(n);
    item.appendChild(d);
    list.appendChild(item);
  }
  cols.appendChild(list);

  // 右：diff
  const diff = makeFrame("diff", W - 48 - 496, 560, C.cardBg, "VERTICAL");
  diff.cornerRadius = 8;
  diff.strokes = solid(C.border); diff.strokeWeight = 1;
  diff.itemSpacing = 6;
  const dt = await makeText("v3 vs v2 diff", { size: 13, bold: true });
  diff.appendChild(dt);
  const diffItems = [
    "变更文件:",
    "  📝 04_results/metrics.csv    改",
    "  📝 04_results/stats.md       改",
    "  📊 04_results/boxplot.pdf    改",
    "  📝 05_discussion.md          改",
    "",
    "metrics 对比:",
    "  Mamba acc: 0.832 → 0.847 (+0.015)",
    "  p-value:   0.012 → 0.003",
    "  Cohen's d: 0.71  → 0.82",
    "",
    "[切到此版本]  [diff v3 v1]  [导出]",
  ];
  for (const d of diffItems) {
    const isAdded = d.startsWith("  📝") || d.startsWith("  📊");
    const t = await makeText(d, { size: 12, mono: true, color: isAdded ? C.primary : C.text });
    diff.appendChild(t);
  }
  cols.appendChild(diff);
  page.appendChild(cols);
  return page;
}

// ---------- 8. 配置页 ----------
async function createConfig(x, y) {
  const page = makeFrame("08 配置页", W, H, C.bgGray, "VERTICAL");
  page.x = x; page.y = y;
  page.itemSpacing = 16;

  const h1 = await makeText("⚙ 配置 — case-001", { size: 20, bold: true });
  page.appendChild(h1);

  const sections = [
    {
      title: "▸ 项目基本信息",
      items: [
        "名称:    [case-001                  ]",
        "学科:    [NLP                  ▾]",
        "语言:    [中文（CTeX）         ▾]",
      ]
    },
    {
      title: "▸ LLM 配置",
      items: [
        "模式:    ( ) API   ( ) 本地   (●) Hybrid  推荐",
        "强模型:  [deepseek-reasoner    ▾]   ¥4/¥16 per M token",
        "廉模型:  [deepseek-chat        ▾]   ¥2/¥8  per M token",
        "长文:    [moonshot-v1-200k     ▾]",
        "嵌入:    [bge-m3 (本地)        ▾]",
        "本地模型:[qwen2.5-14b          ▾]   仅 mode=local/hybrid 显示",
      ]
    },
    {
      title: "▸ RAG 配置",
      items: [
        "模式:    [online          ▾]   online|web_only|offline",
        "全局库复用: [✓] 启用跨项目共享",
        "数据源:   [✓] arXiv  [✓] Semantic Scholar  [✓] OpenAlex",
        "          [✓] PubMed  [ ] DBLP  [ ] Papers with Code",
      ]
    },
    {
      title: "▸ HIL 配置",
      items: [
        "[✓] 启用 Human-in-the-loop",
        "中断点:  [✓] 综述审阅   [✓] 实验方案   [✓] 结果评价   [✓] 终稿",
      ]
    },
    {
      title: "▸ 版本管理",
      items: [
        "[✓] 启用版本快照",
        "策略:    (●) snapshot   ( ) git",
        "保留最近: [5 ▾] 个版本",
      ]
    },
    {
      title: "▸ 运行时",
      items: [
        "环境:    [local          ▾]   local|cloud",
        "沙箱:    [docker         ▾]   docker|conda|none",
      ]
    },
  ];

  for (const sec of sections) {
    const card = makeFrame(sec.title, W - 48, 24 + sec.items.length * 28, C.cardBg, "VERTICAL");
    card.cornerRadius = 8;
    card.strokes = solid(C.border); card.strokeWeight = 1;
    card.paddingTop = 16; card.paddingBottom = 16;
    card.paddingLeft = 20; card.paddingRight = 20;
    card.itemSpacing = 8;
    const t = await makeText(sec.title, { size: 14, bold: true, color: C.primary });
    card.appendChild(t);
    for (const it of sec.items) {
      const i = await makeText(it, { size: 12, mono: true });
      card.appendChild(i);
    }
    page.appendChild(card);
  }

  // 底部按钮
  const actions = makeFrame("actions", W - 48, 40, null, "HORIZONTAL");
  actions.itemSpacing = 12;
  const b1 = await makeButton("保存", C.primary);
  const b2 = await makeButton("重置", C.gray, C.text);
  const b3 = await makeButton("导出 config.yaml", C.green);
  actions.appendChild(b1);
  actions.appendChild(b2);
  actions.appendChild(b3);
  page.appendChild(actions);
  return page;
}

// ---------- 主入口 ----------
async function main() {
  // 加载默认字体（Inter 通常已预加载，但保险起见）
  try {
    await figma.loadFontAsync(FONT);
    await figma.loadFontAsync(FONT_BOLD);
  } catch (e) {
    figma.notify("字体加载失败，使用默认字体: " + e.message, { error: true });
  }

  figma.notify("开始生成 Research Auto-Pilot UI...");

  // 创建一个 Page 容器
  const uiPage = figma.createPage();
  uiPage.name = "Research Auto-Pilot UI";

  // 横向排列 8 个页面，每行 4 个
  const pages = [
    createDashboard,
    createWorkbench,
    createHILReview,
    createLiterature,
    createExperiment,
    createPaperEditor,
    createVersion,
    createConfig,
  ];

  for (let i = 0; i < pages.length; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = col * (W + GAP);
    const y = row * (H + GAP);
    figma.notify(`生成第 ${i + 1}/${pages.length} 页...`);
    await pages[i](x, y);
  }

  // 切换到生成页
  figma.currentPage = uiPage;
  figma.viewport.scrollAndZoomIntoView(uiPage.children);

  figma.notify(`✅ 已生成 ${pages.length} 个 UI 页面`, { timeout: 3000 });
  figma.closePlugin();
}

main().catch(err => {
  figma.notify("生成失败: " + err.message, { error: true, timeout: 5000 });
  console.error(err);
  figma.closePlugin();
});
