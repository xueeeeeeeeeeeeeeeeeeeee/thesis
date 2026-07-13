import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Space,
  Select,
  Typography,
  Empty,
  Spin,
  Row,
  Col,
  Tag,
  message,
} from 'antd'
import {
  ReloadOutlined,
  DownloadOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
  CodeOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'
import { DRAFT_TEMPLATES, getStage } from '@/constants'
import { usePipelineStore } from '@/store/pipelineStore'
import { downloadDraftApi } from '@/services/pipeline'
import type { DraftTemplate, StageKey } from '@/types'

const { Text, Title, Paragraph } = Typography

// 简易 Markdown 渲染：把 # 标题、** 加粗、- 列表 转 HTML
const renderMarkdown = (md: string): React.ReactNode => {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let listBuffer: string[] = []
  const flushList = (): void => {
    if (listBuffer.length === 0) return
    out.push(
      <ul key={`ul-${out.length}`} style={{ paddingLeft: 22, margin: '6px 0' }}>
        {listBuffer.map((li, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.8 }}>
            {li}
          </li>
        ))}
      </ul>,
    )
    listBuffer = []
  }
  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/\r$/, '')
    if (line.startsWith('# ')) {
      flushList()
      out.push(
        <Title key={idx} level={2} style={{ marginTop: 16, marginBottom: 8 }}>
          {line.slice(2)}
        </Title>,
      )
    } else if (line.startsWith('## ')) {
      flushList()
      out.push(
        <Title key={idx} level={3} style={{ marginTop: 14, marginBottom: 6 }}>
          {line.slice(3)}
        </Title>,
      )
    } else if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2))
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      const inline = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
      out.push(
        <Paragraph
          key={idx}
          style={{ fontSize: 14, lineHeight: 1.8, margin: '6px 0' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: inline }}
        />,
      )
    }
  })
  flushList()
  return out
}

const DraftPreview: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const projectId = searchParams.get('projectId') ?? ''

  const {
    draftText,
    template,
    setTemplate,
    renderDraft,
    loadDraft,
    startPipeline,
    currentStep,
  } = usePipelineStore()

  const [downloading, setDownloading] = useState(false)
  const [mode, setMode] = useState<'preview' | 'source'>('preview')

  useEffect(() => {
    if (!projectId) return
    // 若 store 里没有数据，启动流水线拉取
    if (!draftText) {
      void startPipeline(projectId).then(() => loadDraft(projectId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleTemplateChange = async (val: DraftTemplate): Promise<void> => {
    await setTemplate(val)
    await renderDraft(val)
  }

  const handleDownload = async (): Promise<void> => {
    if (!projectId) {
      message.warning('缺少项目 ID')
      return
    }
    setDownloading(true)
    try {
      const url = await downloadDraftApi(projectId)
      const a = document.createElement('a')
      a.href = url
      const tpl = DRAFT_TEMPLATES.find((d) => d.key === template)
      a.download = `draft-${projectId.slice(0, 8)}${tpl?.ext ?? '.md'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      message.success('初稿已下载')
    } catch {
      // request.ts 拦截器已 toast
    } finally {
      setDownloading(false)
    }
  }

  if (!projectId) {
    return (
      <PageContainer title="初稿预览">
        <Empty description="缺少 projectId 参数">
          <Button type="primary" onClick={() => navigate('/')}>
            返回仪表盘
          </Button>
        </Empty>
      </PageContainer>
    )
  }

  const stepLabel = currentStep ? getStage(currentStep as StageKey).label : '尚未启动'

  return (
    <PageContainer
      title="初稿预览"
      breadcrumb={[
        { title: '首页' },
        { title: '项目工作台', path: `/workbench?projectId=${projectId}` },
        { title: '初稿预览' },
      ]}
      extra={
        <Space wrap>
          <Tag color="blue">当前阶段：{stepLabel}</Tag>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/workbench?projectId=${projectId}`)}
          >
            返回工作台
          </Button>
        </Space>
      }
    >
      <Card className="rap-card-shadow" variant="borderless" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} md={10}>
            <Space>
              <Text strong>模板：</Text>
              <Select
                value={template}
                style={{ minWidth: 200 }}
                onChange={(v) => void handleTemplateChange(v as DraftTemplate)}
                options={DRAFT_TEMPLATES.map((t) => ({
                  value: t.key,
                  label: t.label,
                }))}
              />
            </Space>
          </Col>
          <Col xs={24} md={14} style={{ textAlign: 'right' }}>
            <Space>
              <Select
                value={mode}
                style={{ width: 140 }}
                onChange={(v) => setMode(v as 'preview' | 'source')}
                options={[
                  { value: 'preview', label: '预览视图' },
                  { value: 'source', label: '源码视图' },
                ]}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void renderDraft(template)}
              >
                重新渲染
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={downloading}
                onClick={() => void handleDownload()}
              >
                下载初稿
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        className="rap-card-shadow"
        variant="borderless"
        title={
          <span>
            {mode === 'preview' ? <EyeOutlined /> : <CodeOutlined />}
            {mode === 'preview' ? '预览' : '源码'}
          </span>
        }
      >
        {!draftText ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#64748b' }}>正在加载初稿…</div>
          </div>
        ) : mode === 'preview' ? (
          template === 'markdown' ? (
            <div style={{ padding: 8 }}>{renderMarkdown(draftText)}</div>
          ) : (
            // LaTeX 模板不支持直接渲染，仅展示源码
            <pre
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: 16,
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.7,
                fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                whiteSpace: 'pre-wrap',
                margin: 0,
                minHeight: 320,
                maxHeight: 'calc(100vh - 320px)',
                overflow: 'auto',
              }}
            >
              {draftText}
            </pre>
          )
        ) : (
          <pre
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: 'SF Mono, Menlo, Consolas, monospace',
              whiteSpace: 'pre-wrap',
              margin: 0,
              minHeight: 320,
              maxHeight: 'calc(100vh - 320px)',
              overflow: 'auto',
            }}
          >
            {draftText}
          </pre>
        )}
        {draftText && template !== 'markdown' && mode === 'preview' && (
          <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            <FileTextOutlined /> LaTeX 模板暂不支持浏览器内预览，已切换到源码视图。
          </Text>
        )}
      </Card>
    </PageContainer>
  )
}

export default DraftPreview
