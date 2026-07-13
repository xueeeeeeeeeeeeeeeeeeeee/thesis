import React, { useState } from 'react'
import {
  Card,
  Input,
  Select,
  Checkbox,
  Table,
  Tag,
  Button,
  Drawer,
  Space,
  Typography,
  Row,
  Col,
  Tabs,
  Rate,
  Tooltip,
  message,
} from 'antd'
import {
  SearchOutlined,
  BookOutlined,
  LinkOutlined,
  PlusOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'
import { DISCIPLINES } from '@/constants'
import type { Literature, LiteratureSource } from '@/types'

const { Text, Paragraph, Title } = Typography

// 文献 mock 数据
const mockLiterature: Literature[] = [
  {
    id: 'l1',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    authors: ['Lewis, P.', 'Perez, E.', 'Piktus, A.'],
    year: 2020,
    venue: 'NeurIPS',
    citations: 8421,
    relevance: 96,
    source: 'arXiv',
    abstract:
      'We introduce RAG models where the parametric memory is a pre-trained seq2seq model and the non-parametric memory is access to a dense vector index of Wikipedia...',
    sections: [
      { type: 'Abstract', content: '人类知识总量远超模型参数容量。我们提出 RAG 模型，将预训练 seq2seq 模型与维基百科的稠密向量索引结合，在知识密集型任务上取得 SOTA。' },
      { type: 'Intro', content: '大型预训练语言模型将知识隐式存储在参数中。本文探索一种混合方案：结合参数化记忆与非参数化记忆。' },
      { type: 'Method', content: '使用 DPR 检索 top-k 文档，将其作为 BART 生成器的上下文输入。提出 RAG-Sequence 与 RAG-Token 两种变体。' },
      { type: 'Results', content: '在 TriviaQA、WebQuestions、NQ 等开放域 QA 任务上，RAG 显著优于 T5、BART 等纯参数化模型。' },
      { type: 'Discussion', content: 'RAG 提供可解释的知识来源，且可动态更新知识库而无需重新训练。' },
    ],
    doi: '10.48550/arXiv.2005.11401',
    url: 'https://arxiv.org/abs/2005.11401',
  },
  {
    id: 'l2',
    title: 'LoRA: Low-Rank Adaptation of Large Language Models',
    authors: ['Hu, E.', 'Shen, Y.', 'Wallis, P.'],
    year: 2021,
    venue: 'ICLR',
    citations: 5632,
    relevance: 92,
    source: 'arXiv',
    abstract:
      'We propose Low-Rank Adaptation (LoRA), which freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer...',
    sections: [
      { type: 'Abstract', content: '提出 LoRA，冻结预训练权重，在每个注意力层注入可训练的低秩矩阵，大幅降低微调参数量。' },
      { type: 'Intro', content: '全量微调大模型成本高昂，且每个下游任务需独立存储权重。' },
      { type: 'Method', content: '将权重更新 ΔW 分解为两个低秩矩阵 BA 的乘积，秩 r 远小于维度。' },
      { type: 'Results', content: '在 GPT-3 175B 上仅训练 0.01% 参数即可达到全量微调效果。' },
      { type: 'Discussion', content: 'LoRA 无推理延迟，且多个任务适配器可热切换。' },
    ],
    doi: '10.48550/arXiv.2106.09685',
    url: 'https://arxiv.org/abs/2106.09685',
  },
  {
    id: 'l3',
    title: 'A Survey on Retrieval-Augmented Text Generation',
    authors: ['Gao, Y.', 'Xiong, Y.', 'Gao, X.'],
    year: 2023,
    venue: 'arXiv',
    citations: 1240,
    relevance: 88,
    source: 'S2',
    abstract:
      'This paper provides a comprehensive survey of RAG methods, covering retrieval sources, retrieval granularity, and generation strategies...',
    sections: [
      { type: 'Abstract', content: '系统综述 RAG 方法，覆盖检索源、检索粒度、生成策略与下游应用。' },
      { type: 'Intro', content: 'RAG 已成为缓解 LLM 幻觉的主流方案，但缺乏统一综述。' },
      { type: 'Method', content: '从 pre-retrieval、retrieval、post-retrieval、generation 四阶段梳理现有工作。' },
      { type: 'Results', content: '对比了 50+ RAG 变体在 QA、对话、摘要任务上的表现。' },
      { type: 'Discussion', content: '未来方向：多模态 RAG、自适应检索、知识冲突解决。' },
    ],
  },
  {
    id: 'l4',
    title: 'BGE M3: Multi-Lingual, Multi-Functionality, Multi-Granularity Embeddings',
    authors: ['Chen, J.', 'Xiao, S.', 'Zhang, P.'],
    year: 2024,
    venue: 'arXiv',
    citations: 312,
    relevance: 85,
    source: 'arXiv',
    abstract:
      'BGE-M3 supports multi-linguality, multi-granularity, and multi-functionality in a single embedder...',
    sections: [
      { type: 'Abstract', content: 'BGE-M3 在单一嵌入模型中支持多语言、多粒度（8192 tokens）、多功能（稠密/稀疏/多向量）。' },
      { type: 'Intro', content: '现有嵌入模型在长文本和多语言上表现受限。' },
      { type: 'Method', content: '基于 XLM-RoBERTa，采用对比学习与协同微调。' },
      { type: 'Results', content: '在 MIRACL、MLDR、NQ 等基准上达到 SOTA。' },
      { type: 'Discussion', content: '多功能嵌入可同时服务于稠密检索与稀疏检索。' },
    ],
  },
  {
    id: 'l5',
    title: 'CMB: A Comprehensive Medical Benchmark in Chinese',
    authors: ['Wang, R.', 'Wang, X.', 'Chen, S.'],
    year: 2023,
    venue: 'ACL',
    citations: 156,
    relevance: 82,
    source: 'OpenAlex',
    abstract:
      'We present CMB, a comprehensive Chinese medical benchmark covering multiple clinical specialties and question types...',
    sections: [
      { type: 'Abstract', content: '构建覆盖多个临床科室、多种题型的中文医疗综合评测基准 CMB。' },
      { type: 'Intro', content: '中文医疗 LLM 评测基准稀缺，制约模型发展。' },
      { type: 'Method', content: '数据来自三甲医院真实病例与执业医师考试题。' },
      { type: 'Results', content: '评测了 GPT-4、ChatGLM、Baichuan 等模型在医疗问答上的能力。' },
      { type: 'Discussion', content: '现有模型在复杂临床推理上仍有较大差距。' },
    ],
  },
  {
    id: 'l6',
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability via Reinforcement Learning',
    authors: ['DeepSeek-AI'],
    year: 2025,
    venue: 'arXiv',
    citations: 890,
    relevance: 79,
    source: 'PubMed',
    abstract:
      'DeepSeek-R1 achieves performance comparable to OpenAI-o1 in math, code, and reasoning tasks through reinforcement learning...',
    sections: [
      { type: 'Abstract', content: 'DeepSeek-R1 通过强化学习激发推理能力，在数学、代码任务上对标 OpenAI-o1。' },
      { type: 'Intro', content: '纯 RL（不依赖 SFT）能否激发推理能力是开放问题。' },
      { type: 'Method', content: '采用 GRPO 算法，以规则奖励 + 准确率奖励训练。' },
      { type: 'Results', content: 'AIME 2024 准确率 79.8%，MATH-500 97.3%。' },
      { type: 'Discussion', content: 'R1-Zero 展示纯 RL 的潜力，R1 通过冷启动数据进一步提升稳定性。' },
    ],
  },
]

const sources: { label: string; value: LiteratureSource }[] = [
  { label: 'arXiv', value: 'arXiv' },
  { label: 'Semantic Scholar', value: 'S2' },
  { label: 'OpenAlex', value: 'OpenAlex' },
  { label: 'PubMed', value: 'PubMed' },
]

const sourceColor: Record<LiteratureSource, string> = {
  arXiv: 'red',
  S2: 'orange',
  OpenAlex: 'cyan',
  PubMed: 'green',
}

const Literature: React.FC = () => {
  const [keyword, setKeyword] = useState('')
  const [discipline, setDiscipline] = useState<string>()
  const [selectedSources, setSelectedSources] = useState<LiteratureSource[]>([
    'arXiv',
    'S2',
    'OpenAlex',
    'PubMed',
  ])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [current, setCurrent] = useState<Literature | null>(null)

  // 过滤
  const filtered = mockLiterature.filter((l) => {
    if (keyword && !l.title.toLowerCase().includes(keyword.toLowerCase())) return false
    if (selectedSources.length && !selectedSources.includes(l.source)) return false
    return true
  })

  const openDetail = (rec: Literature) => {
    setCurrent(rec)
    setDrawerOpen(true)
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Literature) => (
        <a onClick={() => openDetail(record)}>{text}</a>
      ),
    },
    {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      width: 180,
      render: (a: string[]) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {a.slice(0, 2).join(', ') + (a.length > 2 ? ' 等' : '')}
        </Text>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    { title: '会议/期刊', dataIndex: 'venue', key: 'venue', width: 110 },
    {
      title: '引用数',
      dataIndex: 'citations',
      key: 'citations',
      width: 90,
      sorter: (a: Literature, b: Literature) => a.citations - b.citations,
    },
    {
      title: '相关性',
      dataIndex: 'relevance',
      key: 'relevance',
      width: 130,
      render: (r: number) => <Rate disabled count={5} value={Math.round(r / 20)} style={{ fontSize: 12 }} />,
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (s: LiteratureSource) => <Tag color={sourceColor[s]}>{s}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: Literature) => (
        <Space size="small">
          <Button size="small" type="link" icon={<FileTextOutlined />} onClick={() => openDetail(record)}>
            查看
          </Button>
          <Button
            size="small"
            type="link"
            icon={<PlusOutlined />}
            onClick={() => message.success(`已将「${record.title.slice(0, 16)}...」加入项目文献集`)}
          >
            加入项目
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="文献库"
      breadcrumb={[{ title: '首页' }, { title: '文献库' }]}
    >
      {/* 搜索栏 */}
      <Card className="rap-card-shadow" variant="borderless" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input
              placeholder="关键词搜索（标题）"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} md={6}>
            <Select
              placeholder="学科过滤"
              allowClear
              style={{ width: '100%' }}
              value={discipline}
              onChange={setDiscipline}
              options={DISCIPLINES.map((d) => ({
                value: d.key,
                label: `${d.key} · ${d.label}`,
              }))}
            />
          </Col>
          <Col xs={24} md={10}>
            <Space>
              <Text type="secondary" style={{ fontSize: 13 }}>来源：</Text>
              <Checkbox.Group
                value={selectedSources}
                onChange={(v) => setSelectedSources(v as LiteratureSource[])}
                options={sources.map((s) => ({ label: s.label, value: s.value }))}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 文献表格 */}
      <Card
        title={<span><BookOutlined /> 文献列表</span>}
        className="rap-card-shadow"
        variant="borderless"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {filtered.length} 篇</Text>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title={current?.title}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        extra={
          current?.url && (
            <Tooltip title="打开原文链接">
              <Button type="link" icon={<LinkOutlined />} href={current.url} target="_blank">
                原文
              </Button>
            </Tooltip>
          )
        }
      >
        {current && (
          <div>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color={sourceColor[current.source]}>{current.source}</Tag>
              <Tag>{current.venue} {current.year}</Tag>
              {current.doi && <Tag color="blue">DOI: {current.doi}</Tag>}
            </Space>
            <Paragraph type="secondary">
              作者：{current.authors.join(', ')}
            </Paragraph>
            <Paragraph>
              <Text strong>引用数：</Text>{current.citations}　
              <Text strong>相关性：</Text>{current.relevance}/100
            </Paragraph>

            <Tabs
              defaultActiveKey="Abstract"
              items={current.sections.map((sec) => ({
                key: sec.type,
                label: sec.type,
                children: (
                  <Paragraph style={{ fontSize: 13, lineHeight: 1.8 }}>
                    {sec.content}
                  </Paragraph>
                ),
              }))}
            />

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => message.success('已加入当前项目文献集')}>
                  加入项目文献集
                </Button>
                <Button>标记为核心文献</Button>
              </Space>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  )
}

export default Literature
