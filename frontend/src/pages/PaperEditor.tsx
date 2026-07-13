import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Menu,
  Input,
  Button,
  List,
  Tag,
  Typography,
  Space,
  Row,
  Col,
  Tooltip,
  Badge,
  Divider,
  message,
} from 'antd'
import {
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BuildOutlined,
  BoldOutlined,
  ItalicOutlined,
  UnorderedListOutlined,
  EyeOutlined,
  EditOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import StatusDot from '@/components/StatusDot'
import { useProjectStore } from '@/store/projectStore'
import type { PaperSection, PaperCitation } from '@/types'

const { Text, Paragraph } = Typography
const { TextArea } = Input

// 论文章节 mock
const initialSections: PaperSection[] = [
  {
    id: 's1',
    type: 'Abstract',
    title: 'Abstract',
    content:
      '在低资源场景下构建高质量医疗问答系统是一个重要挑战。本文提出一种结合检索增强生成（RAG）与低秩微调（LoRA）的方法，在 Qwen2-7B 基座上仅训练 0.27% 参数即可显著提升中文医疗问答质量。我们在 CMB 与 CMExam 基准上进行了系统评估，BLEU 提升达 3.4，ROUGE-L 提升 3.7，临床有效性提升 4.8 个百分点。实验表明，bge-m3 嵌入配合 bge-reranker 重排在医疗垂直域检索中表现优异。',
    citations: ['c1', 'c2', 'c3'],
  },
  {
    id: 's2',
    type: 'Introduction',
    title: '1. Introduction',
    content:
      '近年来，大语言模型（LLM）在自然语言处理领域取得突破性进展。然而，在医疗等垂直领域，模型常面临知识更新滞后与幻觉问题。检索增强生成（RAG）通过引入外部知识库缓解上述问题，但如何高效适配基座模型仍是研究热点。\n\n本文的主要贡献如下：\n1. 系统对比了不同嵌入模型在医疗文献检索中的表现\n2. 提出 LoRA + RAG 的组合方案，在低资源下达到 SOTA\n3. 构建了完整的临床有效性评估流程',
    citations: ['c1', 'c4'],
  },
  {
    id: 's3',
    type: 'Method',
    title: '2. Method',
    content:
      '## 2.1 整体架构\n系统由检索模块、重排模块与生成模块组成。\n\n## 2.2 检索增强\n使用 bge-m3 对医疗文献库进行向量化，查询时检索 top-K 文档，经 bge-reranker 重排后取 top-N 作为生成上下文。\n\n## 2.3 低秩微调\n采用 LoRA（rank=16, alpha=32）在 Qwen2-7B 的 q_proj 与 v_proj 上注入适配器，训练 3 个 epoch，学习率 2e-4。',
    citations: ['c2', 'c5'],
  },
  {
    id: 's4',
    type: 'Results',
    title: '3. Results',
    content:
      '## 3.1 主实验结果\n| 方法 | BLEU | ROUGE-L | 临床有效性 |\n|------|------|---------|----------|\n| 全参微调 | 38.7 | 35.2 | 71.5% |\n| LoRA | 40.3 | 36.8 | 73.2% |\n| LoRA + RAG | **42.1** | **38.9** | **76.3%** |\n\n## 3.2 消融实验\n去除 reranker 后 BLEU 下降 1.8，验证重排模块的必要性。',
    citations: ['c3', 'c6'],
  },
  {
    id: 's5',
    type: 'Discussion',
    title: '4. Discussion',
    content:
      '实验结果表明，RAG 增强在低资源医疗问答中具有显著优势。与全参微调相比，LoRA 在保留泛化能力的同时大幅降低训练成本。\n\n然而，本研究仍存在局限：\n1. 未覆盖罕见病问题\n2. 多轮对话能力不足\n3. 评估指标以文本相似度为主，临床实用性需进一步验证',
    citations: ['c4'],
  },
  {
    id: 's6',
    type: 'Conclusion',
    title: '5. Conclusion',
    content:
      '本文提出 LoRA + RAG 组合方案，在中文医疗问答任务上达到 SOTA。未来工作将探索多模态医疗 RAG 与多轮问诊场景。',
    citations: [],
  },
]

// 引用列表 mock
const mockCitations: PaperCitation[] = [
  { id: 'c1', key: '[1]', text: 'Lewis et al. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. NeurIPS 2020.', valid: true },
  { id: 'c2', key: '[2]', text: 'Hu et al. LoRA: Low-Rank Adaptation of Large Language Models. ICLR 2021.', valid: true },
  { id: 'c3', key: '[3]', text: 'Wang et al. CMB: A Comprehensive Medical Benchmark in Chinese. ACL 2023.', valid: true },
  { id: 'c4', key: '[4]', text: 'Gao et al. A Survey on Retrieval-Augmented Text Generation. arXiv 2023.', valid: true },
  { id: 'c5', key: '[5]', text: 'Chen et al. BGE M3: Multi-Lingual Embeddings. arXiv 2024.', valid: true },
  { id: 'c6', key: '[6]', text: '[失效引用] Smith et al. XXX Conference 2019.', valid: false },
]

const PaperEditor: React.FC = () => {
  const currentProject = useProjectStore((s) => s.currentProject)
  // 草稿 key 按项目隔离，无项目时用 default
  const draftKey = useMemo(
    () => `rap_paper_draft_${currentProject?.id ?? 'default'}`,
    [currentProject?.id],
  )

  // 从 localStorage 加载草稿（按项目），无则用 initialSections
  const [sections, setSections] = useState<PaperSection[]>(() => {
    try {
      const raw = localStorage.getItem(`rap_paper_draft_${currentProject?.id ?? 'default'}`)
      if (raw) {
        const parsed = JSON.parse(raw) as PaperSection[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // 忽略解析失败
    }
    return initialSections
  })
  const [activeId, setActiveId] = useState(sections[0]?.id ?? 's1')
  const [preview, setPreview] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // 切换项目时重新加载对应草稿
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      const next = raw ? (JSON.parse(raw) as PaperSection[]) : initialSections
      setSections(Array.isArray(next) && next.length > 0 ? next : initialSections)
      setActiveId(next[0]?.id ?? 's1')
    } catch {
      setSections(initialSections)
      setActiveId('s1')
    }
  }, [draftKey])

  // 草稿自动保存（防抖 800ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(sections))
        setSavedAt(new Date().toISOString())
      } catch {
        // 忽略写入失败（如配额超限）
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [sections, draftKey])

  const active = sections.find((s) => s.id === activeId) ?? sections[0]

  const updateContent = (content: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, content } : s)),
    )
  }

  // 手动保存（立即落盘）
  const handleManualSave = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(sections))
      setSavedAt(new Date().toISOString())
      message.success('草稿已保存')
    } catch {
      message.error('保存失败，请检查浏览器存储')
    }
  }

  // 重置为初始 mock（清空当前项目草稿）
  const handleReset = () => {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      // 忽略
    }
    setSections(initialSections)
    setActiveId(initialSections[0].id)
    setSavedAt(null)
    message.success('已重置为初始内容')
  }

  const validCount = mockCitations.filter((c) => c.valid).length
  const totalCount = mockCitations.length

  // 简易 Markdown 预览渲染
  const renderMarkdown = (text: string) => {
    return text
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('# ')) {
          return <h3 key={i} style={{ margin: '8px 0' }}>{line.slice(2)}</h3>
        }
        if (line.startsWith('## ')) {
          return <h4 key={i} style={{ margin: '8px 0 4px' }}>{line.slice(3)}</h4>
        }
        if (line.startsWith('|')) {
          return (
            <div key={i} className="rap-mono" style={{ fontSize: 12, padding: '2px 0', color: '#475569' }}>
              {line}
            </div>
          )
        }
        return (
          <Paragraph key={i} style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.8 }}>
            {line || '\u00A0'}
          </Paragraph>
        )
      })
  }

  return (
    <PageContainer
      title="论文编辑器"
      breadcrumb={[{ title: '首页' }, { title: '论文编辑器' }]}
      extra={
        <Space>
          {currentProject && (
            <Tag color="blue">{currentProject.name}</Tag>
          )}
          {savedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <SaveOutlined /> 已保存 {dayjs(savedAt).format('HH:mm:ss')}
            </Text>
          )}
          <Button
            icon={preview ? <EditOutlined /> : <EyeOutlined />}
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? '编辑' : '预览'}
          </Button>
          <Button icon={<SaveOutlined />} onClick={handleManualSave}>
            保存草稿
          </Button>
          <Button type="primary" icon={<BuildOutlined />} onClick={() => message.success('已触发一键编译，生成 PDF 中...')}>
            一键编译
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        {/* 左侧：章节大纲 */}
        <Col xs={24} lg={5}>
          <Card
            title={<span><FileTextOutlined /> 章节大纲</span>}
            className="rap-card-shadow"
            variant="borderless"
          >
            <Menu
              mode="inline"
              selectedKeys={[activeId]}
              style={{ border: 'none' }}
              items={sections.map((s) => ({
                key: s.id,
                label: (
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{s.title}</span>
                    {s.citations.length > 0 && (
                      <Tag color="blue" style={{ fontSize: 10 }}>{s.citations.length}</Tag>
                    )}
                  </span>
                ),
              }))}
              onClick={(e) => setActiveId(e.key)}
            />
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ padding: '0 12px' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>字数统计</Text>
              <div style={{ fontSize: 13 }}>
                <Text strong>{sections.reduce((sum, s) => sum + s.content.length, 0)}</Text> 字
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>章节数</Text>
              <div style={{ fontSize: 13 }}>
                <Text strong>{sections.length}</Text> 节
              </div>
              <Divider style={{ margin: '12px 0' }} />
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                草稿自动保存到本地，刷新不丢失
              </Text>
              <Button size="small" block onClick={handleReset}>
                重置为初始内容
              </Button>
            </div>
          </Card>
        </Col>

        {/* 中间：编辑器 / 预览 */}
        <Col xs={24} lg={13}>
          <Card
            title={<span>{active.title}</span>}
            className="rap-card-shadow"
            variant="borderless"
            extra={
              <Space size="small">
                <Tooltip title="加粗">
                  <Button size="small" type="text" icon={<BoldOutlined />} />
                </Tooltip>
                <Tooltip title="斜体">
                  <Button size="small" type="text" icon={<ItalicOutlined />} />
                </Tooltip>
                <Tooltip title="列表">
                  <Button size="small" type="text" icon={<UnorderedListOutlined />} />
                </Tooltip>
              </Space>
            }
          >
            {preview ? (
              <div
                style={{
                  minHeight: 400,
                  padding: 16,
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                }}
              >
                {renderMarkdown(active.content)}
              </div>
            ) : (
              <TextArea
                value={active.content}
                onChange={(e) => updateContent(e.target.value)}
                autoSize={{ minRows: 18 }}
                style={{
                  fontSize: 13,
                  fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                  lineHeight: 1.8,
                }}
              />
            )}
          </Card>
        </Col>

        {/* 右侧：引用列表 + 校验状态 */}
        <Col xs={24} lg={6}>
          <Card
            title={<span>引用列表</span>}
            className="rap-card-shadow"
            variant="borderless"
            style={{ marginBottom: 16 }}
            extra={
              <Badge
                status={validCount === totalCount ? 'success' : 'warning'}
                text={`${validCount}/${totalCount} 通过`}
              />
            }
          >
            <List
              dataSource={mockCitations}
              renderItem={(item: PaperCitation) => (
                <List.Item style={{ padding: '8px 0', borderBottom: '1px dashed #e2e8f0' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 12 }}>{item.key}</Text>
                      {item.valid ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>有效</Tag>
                      ) : (
                        <Tag color="error" icon={<CloseCircleOutlined />}>失效</Tag>
                      )}
                    </div>
                    <Text style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 2 }}>
                      {item.text}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>

          <Card
            title="引用校验状态"
            className="rap-card-shadow"
            variant="borderless"
          >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>总引用数</Text>
                <Text strong>{totalCount}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>有效引用</Text>
                <Text strong style={{ color: '#16a34a' }}>{validCount}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>失效引用</Text>
                <Text strong style={{ color: '#dc2626' }}>{totalCount - validCount}</Text>
              </div>
              <Divider style={{ margin: '8px 0' }} />
              {validCount === totalCount ? (
                <StatusDot color="green" text="所有引用校验通过" />
              ) : (
                <StatusDot color="red" text={`${totalCount - validCount} 个引用需要修复`} pulse />
              )}
              <Button size="small" block style={{ marginTop: 8 }} onClick={() => message.info('已启动引用自动修复')}>
                自动修复失效引用
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </PageContainer>
  )
}

export default PaperEditor
