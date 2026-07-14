import React, { useEffect, useState } from 'react'
import { Modal, Typography, Tag, Space, Input, Button, Divider, Alert, List, Radio, Upload, message as antdMessage } from 'antd'
import {
  CheckOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
  RobotOutlined,
  BookOutlined,
  UploadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { getStage } from '@/constants'
import type { StageKey, ExperimentFormData } from '@/types'
import ExperimentInputForm from './ExperimentInputForm'

const { Text, Paragraph } = Typography
const { TextArea } = Input

/** 文献条目（来自后端 artifacts.literature） */
interface LitItem {
  title?: string
  authors?: string[]
  year?: number
  doi?: string | null
  url?: string | null
  source?: string
  abstract?: string
}

interface HILDialogProps {
  open: boolean
  stage: StageKey | null
  message: string
  agentProposal: string
  /** experiment 阶段附带的实验设计方案（来自 design 阶段），供表单预填 */
  experimentDesign?: Record<string, unknown>
  /** design 阶段：检索到的文献列表，供用户审阅选择 */
  literature?: LitItem[]
  /** HIL 标题（来自 LLM 服务） */
  title?: string
  onConfirm: (text: string) => void
  onEdit: (text: string) => void
  /** experiment 阶段：用户填表单提交实验结果 */
  onEditExperiment?: (data: ExperimentFormData) => void
  /** design 阶段：用户提交文献选择（auto=使用系统检索的文献，upload=用户上传文献） */
  onEditLiterature?: (mode: 'auto' | 'upload', uploadedLits?: LitItem[]) => void
  onRollback: () => void
  onAbort: () => void
  /** 用户点 X / 关闭 / mask 时触发，默认行为等同 onAbort */
  onCancel?: () => void
  submitting?: boolean
}

// HIL 审阅弹窗：可编辑 Agent 提议，支持通过 / 编辑 / 回滚 / 中止
// experiment 阶段特殊处理：用结构化表单（ExperimentInputForm）替代通用 TextArea
const HILDialog: React.FC<HILDialogProps> = ({
  open,
  stage,
  message,
  agentProposal,
  experimentDesign,
  literature,
  title,
  onConfirm,
  onEdit,
  onEditExperiment,
  onEditLiterature,
  onRollback,
  onAbort,
  onCancel,
  submitting = false,
}) => {
  const [editText, setEditText] = useState(agentProposal)
  const [dirty, setDirty] = useState(false)
  // design 阶段：文献选择模式
  const [litMode, setLitMode] = useState<'auto' | 'upload'>('auto')
  const [uploadedLits, setUploadedLits] = useState<LitItem[]>([])

  // 每次打开时重置编辑内容
  useEffect(() => {
    if (open) {
      setEditText(agentProposal)
      setDirty(false)
      setLitMode('auto')
      setUploadedLits([])
    }
  }, [open, agentProposal])

  const stageMeta = stage ? getStage(stage) : null
  const isExperiment = stage === 'experiment'
  const isDesign = stage === 'design'
  const dialogTitle = title || (stageMeta ? `HIL 审阅：${stageMeta.label}` : 'HIL 审阅')
  // 默认关闭行为 = 中止流水线
  const handleCancel = onCancel ?? onAbort

  // design 阶段：解析用户上传的 .bib / .txt / .docx 文件
  // .docx 用 mammoth 转 text；.bib/.txt 直接 readAsText
  const parseTextToLits = (text: string): LitItem[] => {
    // 1. 优先按 BibTeX 格式解析
    const entries: LitItem[] = []
    const bibRegex = /@\w+\{[^,]+,\s*([\s\S]*?)\}/g
    let match: RegExpExecArray | null
    while ((match = bibRegex.exec(text)) !== null) {
      const body = match[1]
      const getTitle = (s: string) => {
        const m = s.match(/title\s*=\s*[{\"]([^}\"]*)[}\"]/i)
        return m ? m[1] : ''
      }
      const getAuthor = (s: string) => {
        const m = s.match(/author\s*=\s*[{\"]([^}\"]*)[}\"]/i)
        return m ? m[1].split(' and ').map((a) => a.trim()) : []
      }
      const getYear = (s: string) => {
        const m = s.match(/year\s*=\s*[{\"]?(\d{4})[}\"]?/i)
        return m ? parseInt(m[1]) : undefined
      }
      const getDoi = (s: string) => {
        const m = s.match(/doi\s*=\s*[{\"]([^}\"]*)[}\"]/i)
        return m ? m[1] : null
      }
      const getTitleVal = getTitle(body)
      if (getTitleVal) {
        entries.push({
          title: getTitleVal,
          authors: getAuthor(body),
          year: getYear(body),
          doi: getDoi(body),
          source: 'user_upload',
        })
      }
    }
    if (entries.length > 0) return entries
    // 2. 降级为逐行解析（每行一条标题）；Word/纯文本通用
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('%') && !l.startsWith('#'))
    for (const line of lines) {
      entries.push({ title: line, authors: [], source: 'user_upload' })
    }
    return entries
  }

  const handleUploadFile = async (file: File): Promise<boolean> => {
    const name = file.name.toLowerCase()
    try {
      let text = ''
      if (name.endsWith('.docx')) {
        // Word 文档：用 mammoth 转 text
        const arrayBuffer = await file.arrayBuffer()
        const mammoth = (await import('mammoth')).default
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value || ''
      } else {
        // .bib / .txt / .csv：直接读为文本
        text = await file.text()
      }
      const entries = parseTextToLits(text)
      if (entries.length === 0) {
        antdMessage.warning('未从文件中解析到文献条目，请检查文件内容')
        return false
      }
      setUploadedLits(entries)
      setLitMode('upload')
      antdMessage.success(`已解析到 ${entries.length} 条文献`)
    } catch (err) {
      console.error('文献解析失败', err)
      antdMessage.error('文献解析失败，请确认文件格式正确')
    }
    return false // 阻止 antd Upload 自动上传
  }

  // experiment 阶段：渲染结构化表单
  if (isExperiment) {
    return (
      <Modal
        open={open}
        title={dialogTitle}
        width={880}
        maskClosable
        closable
        footer={null}
        onCancel={handleCancel}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={message || '请填写实验内容与结果，提交后将进入评估阶段'}
          />
          <Divider style={{ margin: '4px 0' }} />
          <ExperimentInputForm
            experimentDesign={experimentDesign}
            onSubmit={(data) => onEditExperiment?.(data)}
            onCancel={undefined}
            submitting={submitting}
          />
          <Divider style={{ margin: '4px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Space>
              <Button
                icon={<StopOutlined />}
                danger
                onClick={onAbort}
                disabled={submitting}
              >
                中止
              </Button>
              <Button
                icon={<RollbackOutlined />}
                style={{ borderColor: '#d97706', color: '#d97706' }}
                onClick={onRollback}
                disabled={submitting}
              >
                回滚
              </Button>
            </Space>
            <Button
              type="default"
              icon={<RobotOutlined />}
              onClick={() => onConfirm('')}
              disabled={submitting}
              title="跳过表单，用 LLM 模拟实验结果（auto 模式回退）"
            >
              跳过（用 LLM 模拟）
            </Button>
          </div>
        </Space>
      </Modal>
    )
  }

  // design 阶段：展示文献列表 + 选择模式（自动检索 / 用户上传）
  if (isDesign) {
    const displayLits = litMode === 'upload' ? uploadedLits : (literature ?? [])
    return (
      <Modal
        open={open}
        title={dialogTitle}
        width={880}
        maskClosable
        closable
        footer={null}
        onCancel={handleCancel}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={message || `文献调研完成（${literature?.length ?? 0} 篇），请审阅后确认进入实验设计`}
          />

          {/* 文献来源选择 */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              <BookOutlined style={{ marginRight: 6 }} />
              文献来源选择
            </Text>
            <Radio.Group
              value={litMode}
              onChange={(e) => setLitMode(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="auto">
                系统自动检索（{literature?.length ?? 0} 篇）
              </Radio.Button>
              <Radio.Button value="upload">
                用户上传文献（{uploadedLits.length} 篇）
              </Radio.Button>
            </Radio.Group>
          </div>

          {/* 上传区域 */}
          {litMode === 'upload' && (
            <div>
              <Upload
                accept=".bib,.txt,.csv,.docx"
                maxCount={1}
                showUploadList={true}
                beforeUpload={handleUploadFile}
              >
                <Button icon={<UploadOutlined />}>
                  上传文献文件 (.bib / .txt / .docx)
                </Button>
              </Upload>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                支持 BibTeX (.bib)、每行一条标题的文本 (.txt/.csv) 或 Word 文档 (.docx)。
                上传后将替换系统检索的文献。
              </Text>
            </div>
          )}

          <Divider style={{ margin: '4px 0' }} />

          {/* 文献列表展示 */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {displayLits.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={displayLits}
                renderItem={(lit, idx) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space>
                        <Tag color={lit.source === 'user_upload' ? 'purple' : 'blue'} style={{ fontSize: 11 }}>
                          {lit.source ?? 'unknown'}
                        </Tag>
                        <Text strong style={{ fontSize: 13 }}>
                          [{idx + 1}] {lit.title ?? '(无标题)'}
                        </Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {(lit.authors ?? []).slice(0, 3).join(', ')}
                        {lit.year ? ` (${lit.year})` : ''}
                        {lit.doi ? ` · DOI: ${lit.doi}` : ''}
                      </Text>
                      {lit.abstract && (
                        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
                          {lit.abstract.slice(0, 150)}
                          {lit.abstract.length > 150 ? '...' : ''}
                        </Text>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Alert
                type="warning"
                message={litMode === 'upload' ? '尚未上传文献，请上传 .bib 或 .txt 文件' : '系统未检索到文献'}
                showIcon
              />
            )}
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* 操作按钮 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Space>
              <Button icon={<StopOutlined />} danger onClick={onAbort} disabled={submitting}>
                中止
              </Button>
              <Button
                icon={<RollbackOutlined />}
                style={{ borderColor: '#d97706', color: '#d97706' }}
                onClick={onRollback}
                disabled={submitting}
              >
                回滚
              </Button>
            </Space>
            <Space>
              {litMode === 'upload' && uploadedLits.length > 0 && (
                <Button
                  icon={<FileTextOutlined />}
                  style={{ borderColor: '#16a34a', color: '#16a34a' }}
                  onClick={() => onEditLiterature?.('upload', uploadedLits)}
                  disabled={submitting}
                >
                  使用上传文献（{uploadedLits.length} 篇）
                </Button>
              )}
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => {
                  if (litMode === 'upload' && uploadedLits.length > 0) {
                    onEditLiterature?.('upload', uploadedLits)
                  } else {
                    onConfirm('')
                  }
                }}
                loading={submitting}
              >
                {submitting ? '提交中…' : litMode === 'upload' && uploadedLits.length > 0 ? '确认使用上传文献' : '确认使用系统文献'}
              </Button>
            </Space>
          </div>
        </Space>
      </Modal>
    )
  }

  // 其他阶段：保持通用 TextArea UI
  return (
    <Modal
      open={open}
      title={dialogTitle}
      width={720}
      maskClosable
      closable
      footer={null}
      onCancel={handleCancel}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Space wrap>
            {stageMeta && (
              <Tag color={stageMeta.color} style={{ fontSize: 13 }}>
                {stageMeta.label}
              </Tag>
            )}
            <Text type="secondary">触发原因：</Text>
            <Text>{message}</Text>
          </Space>
        </div>

        <div>
          <Text strong>
            <RobotOutlined style={{ color: '#2563eb', marginRight: 6 }} />
            Agent 提议
          </Text>
          <Paragraph
            style={{
              background: '#f8fafc',
              padding: 12,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              marginTop: 6,
              marginBottom: 0,
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {agentProposal || '（暂无 Agent 提议）'}
          </Paragraph>
        </div>

        <Divider style={{ margin: '4px 0' }} />

        <div>
          <Text strong>您的审阅 / 编辑</Text>
          <TextArea
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value)
              setDirty(e.target.value !== agentProposal)
            }}
            rows={6}
            placeholder="可在此编辑修改 Agent 的提议内容"
            style={{ marginTop: 8, fontSize: 13 }}
          />
          {dirty && (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              检测到修改，点击"编辑确认"将使用您修改后的版本
            </Text>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<StopOutlined />} danger onClick={onAbort} disabled={submitting}>
            中止
          </Button>
          <Button
            icon={<RollbackOutlined />}
            style={{ borderColor: '#d97706', color: '#d97706' }}
            onClick={onRollback}
            disabled={submitting}
          >
            回滚
          </Button>
          <Button
            icon={<EditOutlined />}
            style={{ borderColor: '#16a34a', color: '#16a34a' }}
            onClick={() => onEdit(editText)}
            disabled={submitting}
          >
            编辑确认
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => onConfirm(editText)}
            loading={submitting}
          >
            {submitting ? '提交中…' : '通过'}
          </Button>
        </div>
      </Space>
    </Modal>
  )
}

export default HILDialog
