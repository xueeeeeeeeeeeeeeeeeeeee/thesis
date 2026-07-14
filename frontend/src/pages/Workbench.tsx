import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Layout,
  Card,
  Steps,
  Timeline,
  Typography,
  Space,
  Button,
  Tag,
  Row,
  Col,
  Empty,
  Spin,
  Switch,
  Select,
  List,
  Alert,
  Tooltip,
  Popconfirm,
  Collapse,
  message,
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  RollbackOutlined,
  RobotOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  DownloadOutlined,
  EyeOutlined,
  StopOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  PictureOutlined,
  BookOutlined,
  ExperimentOutlined,
  MessageOutlined,
  SendOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import StatusDot from '@/components/StatusDot'
import HILDialog from '@/components/HILDialog'
import { useProjectStore } from '@/store/projectStore'
import { usePipelineStore, type LogEntry } from '@/store/pipelineStore'
import { downloadDraftApi } from '@/services/pipeline'
import {
  STAGES,
  DRAFT_TEMPLATES,
  HIL_STAGES,
  getStage,
  getStageIndex,
} from '@/constants'
import type {
  DraftTemplate,
  PipelineMode,
  PipelineStatus,
  Project,
  StageKey,
} from '@/types'

const { Text, Paragraph, Title } = Typography
const { Content } = Layout

// 状态点颜色
const STATUS_COLOR_MAP: Record<PipelineStatus, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  idle: 'gray',
  running: 'green',
  interrupted: 'yellow',
  completed: 'blue',
  aborted: 'gray',
  error: 'red',
}

const STATUS_LABEL_MAP: Record<PipelineStatus, string> = {
  idle: '空闲',
  running: '运行中',
  interrupted: '已中断',
  completed: '已完成',
  aborted: '已中止',
  error: '异常',
}

// 各阶段 Agent 输出（仅作占位，真正的数据来自 artifacts / logs）
const STAGE_DESCRIPTION: Record<StageKey, string> = STAGES.reduce(
  (acc, s) => {
    acc[s.key] = s.description
    return acc
  },
  {} as Record<StageKey, string>,
)

const Workbench: React.FC = () => {
  const { currentProject, selectProjectById, fetchProjects, loading } = useProjectStore()
  const [searchParams] = useSearchParams()
  const urlProjectId = searchParams.get('projectId')
  const navigate = useNavigate()

  const {
    status,
    mode,
    template,
    currentStep,
    artifacts,
    hilPending,
    triggeredHILs,
    logs,
    draftText,
    startPipeline,
    resumePipeline,
    abortPipeline,
    setMode,
    setTemplate,
    renderDraft,
    projectId: pipelineProjectId,
    stopPolling,
    setHilPending,
  } = usePipelineStore()

  const [downloading, setDownloading] = useState(false)
  // HIL 弹窗的"已收起"标记。点 X / 遮罩 / ESC 时收起，hilPending 保留在 store 里待后续处理。
  // 当 hilPending 切换到新对象时（同一项目再来一次 HIL）自动重新弹出。
  const [hilDialogDismissed, setHilDialogDismissed] = useState(false)
  useEffect(() => {
    if (hilPending) setHilDialogDismissed(false)
  }, [hilPending])

  // 用户点击查看的历史步骤（null=跟随当前流水线阶段）
  const [selectedStep, setSelectedStep] = useState<StageKey | null>(null)
  // 流水线推进到新阶段时自动回到当前步骤
  useEffect(() => {
    setSelectedStep(null)
  }, [currentStep])

  // URL 参数恢复项目
  useEffect(() => {
    if (urlProjectId && urlProjectId !== currentProject?.id) {
      void selectProjectById(urlProjectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId])

  useEffect(() => {
    if (!urlProjectId && !currentProject && !loading) {
      void fetchProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, loading, urlProjectId])

  // 当项目变化时启动流水线
  useEffect(() => {
    if (currentProject?.id && currentProject.id !== pipelineProjectId) {
      void startPipeline(currentProject.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id])

  // 卸载时停止轮询
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  // 旧版"本地模拟日志"已移除：日志只来自后端真实事件 / WS 推送 / 用户操作。
  // 真实流水线进度通过 pollStatus 轮询 /projects/:id/pipeline 获取。

  const stageKey = (
    (pipelineProjectId === currentProject?.id ? currentStep : null) ??
    currentProject?.currentStep ??
    currentProject?.stage ??
    currentStep ??
    null
  ) as StageKey | null
  const currentStageDef = useMemo(() => (stageKey ? getStage(stageKey) : null), [stageKey])
  const currentStageIdx = getStageIndex(stageKey)

  // 展示用步骤：用户点击查看历史时用 selectedStep，否则跟随当前流水线阶段
  const displayStep = selectedStep ?? stageKey
  const displayStageDef = useMemo(
    () => (displayStep ? getStage(displayStep) : null),
    [displayStep],
  )
  const isReviewingHistory = selectedStep !== null && selectedStep !== stageKey

  // HIL 队列（从 store 派生）
  const hilQueue = useMemo(
    () =>
      hilPending
        ? [
            {
              stage: hilPending.stage,
              message: hilPending.message,
              agentProposal: hilPending.agentProposal,
              pending: true,
            },
          ]
        : [],
    [hilPending],
  )

  const handleStart = async (): Promise<void> => {
    if (!currentProject) return
    await startPipeline(currentProject.id)
    message.success('流水线已启动')
  }

  const handlePause = (): void => {
    message.info('已发送暂停指令（后端将切到 interrupted）')
  }

  const handleRollback = async (): Promise<void> => {
    if (!currentProject) return
    await resumePipeline('rollback')
  }

  const handleAbort = async (): Promise<void> => {
    await abortPipeline()
  }

  const handleGenerateDraft = async (): Promise<void> => {
    if (!currentProject) return
    await renderDraft(template)
    message.success('初稿已生成，可预览或下载')
  }

  const handleDownload = async (): Promise<void> => {
    if (!currentProject) return
    setDownloading(true)
    try {
      const url = await downloadDraftApi(currentProject.id)
      const tpl = DRAFT_TEMPLATES.find((d) => d.key === template)
      const a = document.createElement('a')
      a.href = url
      a.download = `draft-${currentProject.id.slice(0, 8)}${tpl?.ext ?? '.md'}`
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

  const handleModeChange = async (checked: boolean): Promise<void> => {
    const next: PipelineMode = checked ? 'auto' : 'manual'
    await setMode(next)
  }

  const handleTemplateChange = async (val: DraftTemplate): Promise<void> => {
    await setTemplate(val)
  }

  // HIL 弹窗操作 — 关键：点完按钮立即关闭弹窗，后端请求后台异步执行，
  // 进度通过实时日志 + 下一次 HIL 自动弹窗反馈，避免卡死感。
  const closeHilNow = (): void => {
    setHilDialogDismissed(true)
    setHilPending(null)
  }
  const hilConfirm = (text: string): void => {
    closeHilNow()
    message.success({ content: '已通过，流水线继续运行…', key: 'hil-submit' })
    void resumePipeline('confirm', { text })
  }
  const hilEdit = (text: string): void => {
    closeHilNow()
    message.success({ content: '已编辑确认，流水线继续运行…', key: 'hil-submit' })
    void resumePipeline('edit', { text })
  }
  // experiment 阶段：用户填表单提交实验结果
  const hilEditExperiment = (data: import('@/types').ExperimentFormData): void => {
    closeHilNow()
    message.success({ content: '实验结果已提交，正在进入评估阶段…', key: 'hil-submit' })
    void resumePipeline('edit', { experiment_results: data })
  }
  // design 阶段：用户选择文献来源（自动检索 / 上传文献）
  const hilEditLiterature = (
    mode: 'auto' | 'upload',
    uploadedLits?: { title?: string; authors?: string[]; year?: number; doi?: string | null; source?: string }[],
  ): void => {
    closeHilNow()
    if (mode === 'upload' && uploadedLits && uploadedLits.length > 0) {
      message.success({ content: `已采用用户上传的 ${uploadedLits.length} 篇文献，继续运行…`, key: 'hil-submit' })
      void resumePipeline('edit', { literature: uploadedLits })
    } else {
      message.success({ content: '已确认使用系统检索的文献，继续运行…', key: 'hil-submit' })
      void resumePipeline('confirm', {})
    }
  }
  const hilRollback = (): void => {
    closeHilNow()
    void resumePipeline('rollback')
  }
  const hilAbort = (): void => {
    closeHilNow()
    void resumePipeline('abort')
  }

  if (!currentProject) {
    return (
      <PageContainer title="项目工作台" breadcrumb={[{ title: '项目工作台' }]}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#64748b' }}>正在加载项目…</div>
          </div>
        ) : (
          <Empty description="请先在仪表盘选择一个项目">
            <Button type="primary" onClick={() => void fetchProjects()}>
              重新加载项目列表
            </Button>
          </Empty>
        )}
      </PageContainer>
    )
  }

  return (
    <Layout style={{ background: 'transparent' }}>
      <Content>
        <PageContainer
          title={currentProject.name}
          breadcrumb={[
            { title: '首页' },
            { title: '项目工作台' },
            { title: currentProject.name },
          ]}
          extra={
            <Space wrap>
              {currentStageDef && (
                <Tag color={currentStageDef.color} style={{ fontSize: 13 }}>
                  当前步骤：{currentStageDef.label}
                </Tag>
              )}
              <StatusDot
                color={STATUS_COLOR_MAP[status]}
                text={STATUS_LABEL_MAP[status]}
                pulse={status === 'running'}
              />
              {hilPending && hilDialogDismissed && (
                <Button
                  type="primary"
                  size="small"
                  icon={<WarningOutlined />}
                  onClick={() => setHilDialogDismissed(false)}
                >
                  恢复 HIL 审阅（{hilPending.stage}）
                </Button>
              )}
            </Space>
          }
        >
          {/* 顶部控制卡片：模式 + 模板 */}
          <Card
            className="rap-card-shadow"
            variant="borderless"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={16} align="middle">
              <Col xs={24} md={8}>
                <Space>
                  <Text type="secondary">学科：</Text>
                  <Tag color="blue">{currentProject.discipline}</Tag>
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Space>
                  <Text type="secondary">推进模式：</Text>
                  <Switch
                    checked={mode === 'auto'}
                    onChange={(v) => void handleModeChange(v)}
                    checkedChildren="auto"
                    unCheckedChildren="manual"
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {mode === 'auto' ? '全自动推进' : '人工审阅'}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Space>
                  <Text type="secondary">初稿模板：</Text>
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
            </Row>
          </Card>

          <Row gutter={[16, 16]}>
            {/* 左：8 步 Steps + 4 个 HIL 点 */}
            <Col xs={24} xl={8}>
              <Card
                className="rap-card-shadow"
                variant="borderless"
                title={
                  <span>
                    <ThunderboltOutlined /> 流水线步骤
                  </span>
                }
                style={{ marginBottom: 16 }}
              >
                <Steps
                  direction="vertical"
                  current={currentStageIdx}
                  size="small"
                  items={STAGES.map((s) => {
                    const sIdx = getStageIndex(s.key)
                    const isFinished = sIdx < currentStageIdx
                    const isCurrent = sIdx === currentStageIdx
                    const isClickable = isFinished || isCurrent
                    const isSelected = selectedStep === s.key
                    return {
                      title: (
                        <span
                          style={{
                            cursor: isClickable ? 'pointer' : 'default',
                            color: isSelected ? '#2563eb' : undefined,
                            fontWeight: isSelected ? 600 : undefined,
                          }}
                          onClick={() => {
                            if (isClickable) setSelectedStep(isSelected ? null : s.key)
                          }}
                        >
                          {s.label}
                          {isSelected && (
                            <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>
                              查看中
                            </Tag>
                          )}
                        </span>
                      ),
                      description: s.description,
                      status: isSelected
                        ? ('process' as const)
                        : isFinished
                          ? ('finish' as const)
                          : isCurrent
                            ? ('process' as const)
                            : ('wait' as const),
                      icon: isFinished ? (
                        <CheckCircleOutlined
                          style={{
                            color: isSelected ? '#2563eb' : '#16a34a',
                            cursor: isClickable ? 'pointer' : 'default',
                          }}
                          onClick={() => {
                            if (isClickable) setSelectedStep(isSelected ? null : s.key)
                          }}
                        />
                      ) : isCurrent ? (
                        <ClockCircleOutlined
                          style={{ color: s.color, cursor: isClickable ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (isClickable) setSelectedStep(isSelected ? null : s.key)
                          }}
                        />
                      ) : undefined,
                    }
                  })}
                />
                {/* HIL 中断点徽标 */}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {HIL_STAGES.map((h) => {
                    // 三态：未触发（还没到这步）/ 待审阅（当前 hilPending）/ 已审阅（曾经触发过 hilPending 已被清掉）
                    const isActive = hilPending?.stage === h.key
                    const isTriggered = triggeredHILs.includes(h.key)
                    const state: 'pending' | 'done' | 'idle' = isActive
                      ? 'pending'
                      : isTriggered
                        ? 'done'
                        : 'idle'
                    const bg = state === 'pending' ? '#fef3c7' : state === 'done' ? '#ecfdf5' : '#f8fafc'
                    const borderColor =
                      state === 'pending' ? '#fcd34d' : state === 'done' ? '#86efac' : '#e2e8f0'
                    return (
                      <div
                        key={h.key}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: bg,
                          border: `1px solid ${borderColor}`,
                        }}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text strong style={{ fontSize: 13 }}>
                            HIL · {h.label}
                          </Text>
                          {state === 'pending' ? (
                            <Tag color="warning" style={{ marginRight: 0 }}>
                              待审阅
                            </Tag>
                          ) : state === 'done' ? (
                            <Tag color="success" style={{ marginRight: 0 }}>
                              已审阅
                            </Tag>
                          ) : (
                            <Tag style={{ marginRight: 0 }}>未触发</Tag>
                          )}
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {h.reason}
                        </Text>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </Col>

            {/* 中：当前/选中步骤的 Agent 输出区 */}
            <Col xs={24} xl={10}>
              <Card
                className="rap-card-shadow"
                variant="borderless"
                title={
                  <span>
                    <RobotOutlined style={{ color: displayStageDef?.color ?? '#2563eb' }} />
                    {isReviewingHistory ? '历史回看' : 'Agent 输出'} · {displayStageDef?.label ?? '尚未启动'}
                  </span>
                }
                extra={
                  <Space>
                    {isReviewingHistory && (
                      <Button
                        size="small"
                        type="link"
                        icon={<RollbackOutlined />}
                        onClick={() => setSelectedStep(null)}
                      >
                        返回当前步骤
                      </Button>
                    )}
                    <Tag color={isReviewingHistory ? 'blue' : status === 'running' ? 'processing' : 'default'}>
                      {isReviewingHistory
                        ? '查看历史'
                        : status === 'running'
                          ? '实时'
                          : STATUS_LABEL_MAP[status]}
                    </Tag>
                  </Space>
                }
                style={{ marginBottom: 16 }}
              >
                {/* 查看历史时的提示条 */}
                {isReviewingHistory && (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={`正在查看「${displayStageDef?.label}」阶段的已保存产物（当前流水线仍在 ${currentStageDef?.label ?? '—'} 阶段）`}
                  />
                )}
                {/* 关键节点高亮：用 displayStep 决定渲染哪个阶段产物 */}
                {displayStep === 'literature' && <LiteratureHighlight artifacts={artifacts} />}
                {displayStep === 'design' && <DesignHighlight artifacts={artifacts} />}
                {displayStep === 'experiment' && <ExperimentHighlight artifacts={artifacts} />}
                {displayStep === 'evaluate' && <EvaluationHighlight artifacts={artifacts} />}
                {displayStep === 'discuss' && <DiscussionHighlight artifacts={artifacts} />}
                {displayStep === 'write' && <WritingHighlight artifacts={artifacts} />}
                {displayStep === 'figure' && <FigureHighlight artifacts={artifacts} />}
                {displayStep === 'submit' && <SubmissionHighlight artifacts={artifacts} />}

                {/* 该阶段暂无产物时的空状态 */}
                {displayStep && !hasArtifact(artifacts, displayStep) && (
                  status === 'running' && !isReviewingHistory && !hilPending ? (
                    <div
                      style={{
                        margin: '16px 0',
                        padding: '24px 16px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: 8,
                      }}
                    >
                      <Spin
                        size="large"
                        tip={
                          displayStep === 'literature'
                            ? '正在检索文献，请稍候…'
                            : `正在执行「${displayStageDef?.label ?? displayStep}」阶段，请稍候…`
                        }
                      >
                        <div style={{ padding: '12px 0', color: '#64748b' }}>
                          {displayStep === 'literature'
                            ? 'RAG 向量检索 + arXiv/S2 补充中…'
                            : 'Agent 正在生成阶段产物…'}
                        </div>
                      </Spin>
                    </div>
                  ) : (
                    <Empty
                      description={`「${displayStageDef?.label}」阶段暂无保存的产物`}
                      style={{ margin: '12px 0' }}
                    />
                  )
                )}

                {/* 阶段说明 */}
                {displayStageDef && (
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 8 }}>
                    {STAGE_DESCRIPTION[displayStageDef.key] ?? displayStageDef.description}
                  </Paragraph>
                )}

                {/* 实时日志 */}
                <Title level={5} style={{ marginTop: 4, marginBottom: 8 }}>
                  <ClockCircleOutlined /> 实时日志
                </Title>
                {logs.length === 0 ? (
                  <Empty description="暂无日志，点击底部『开始』启动流水线" />
                ) : (
                  <Timeline
                    style={{ marginTop: 4, maxHeight: 360, overflow: 'auto', paddingRight: 4 }}
                    items={logs.slice(-30).map((l: LogEntry) => ({
                      color:
                        l.level === 'success'
                          ? 'green'
                          : l.level === 'warning'
                            ? 'orange'
                            : l.level === 'error'
                              ? 'red'
                              : 'blue',
                      children: (
                        <div>
                          <Text style={{ fontSize: 12 }}>{l.text}</Text>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {dayjs(l.time).format('HH:mm:ss')}
                              {l.stage ? ` · ${getStage(l.stage).label}` : ''}
                            </Text>
                          </div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            </Col>

            {/* 右：HIL 队列面板 */}
            <Col xs={24} xl={6}>
              <Card
                className="rap-card-shadow"
                variant="borderless"
                title={
                  <span>
                    <WarningOutlined style={{ color: '#ca8a04' }} /> HIL 队列
                  </span>
                }
                extra={<Tag color={hilQueue.length > 0 ? 'warning' : 'default'}>{hilQueue.length}</Tag>}
              >
                {hilQueue.length === 0 ? (
                  <Empty description="当前无待审阅中断点" />
                ) : (
                  <List
                    dataSource={hilQueue}
                    renderItem={(item) => {
                      const stageDef = getStage(item.stage)
                      return (
                        <List.Item style={{ padding: '8px 4px' }}>
                          <Space direction="vertical" style={{ width: '100%' }} size={4}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Tag color={stageDef.color}>{stageDef.label}</Tag>
                              <Tag color="warning">待审阅</Tag>
                            </Space>
                            <Text style={{ fontSize: 12 }}>{item.message}</Text>
                            <Button
                              size="small"
                              type="primary"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                // 取消"已收起"标记，弹窗立即重新弹出
                                setHilDialogDismissed(false)
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                              }}
                            >
                              审阅
                            </Button>
                          </Space>
                        </List.Item>
                      )
                    }}
                  />
                )}
                {hilQueue.length > 0 && (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginTop: 8 }}
                    message="检测到 HIL 中断点，弹窗已自动弹出"
                  />
                )}
              </Card>
            </Col>
          </Row>

          {/* 底部操作条：sticky 固定在底部，避免被长内容挤出视口；aborted 状态高亮重新启动按钮 */}
          <Card
            className="rap-card-shadow rap-workbench-actionbar"
            variant="borderless"
            style={{ marginTop: 16, position: 'sticky', bottom: 16, zIndex: 5 }}
            styles={{ body: { padding: 12 } }}
          >
            <Space wrap>
              <Tooltip title="启动 / 恢复流水线（aborted 状态下也会重新启动）">
                <Button
                  type={status === 'aborted' ? 'primary' : 'primary'}
                  icon={<PlayCircleOutlined />}
                  onClick={() => void handleStart()}
                  loading={status === 'running' && loading}
                  danger={status === 'aborted'}
                  ghost={status === 'aborted'}
                >
                  {status === 'running'
                    ? '运行中'
                    : status === 'aborted'
                    ? '重新启动'
                    : status === 'completed'
                    ? '再次运行'
                    : '开始'}
                </Button>
              </Tooltip>
              <Tooltip title="暂停当前阶段">
                <Button icon={<PauseCircleOutlined />} onClick={handlePause}>
                  暂停
                </Button>
              </Tooltip>
              <Tooltip title="回滚到上一阶段">
                <Button
                  icon={<RollbackOutlined />}
                  onClick={() => void handleRollback()}
                >
                  回滚
                </Button>
              </Tooltip>
              <Popconfirm
                title="确认中止当前流水线？"
                okText="中止"
                okType="danger"
                cancelText="取消"
                onConfirm={() => void handleAbort()}
              >
                <Button danger icon={<StopOutlined />}>
                  中止
                </Button>
              </Popconfirm>
              <Button
                icon={<FileTextOutlined />}
                onClick={() => void handleGenerateDraft()}
              >
                生成初稿
              </Button>
              <Button
                type="primary"
                ghost
                icon={<DownloadOutlined />}
                loading={downloading}
                onClick={() => void handleDownload()}
              >
                下载初稿
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={() =>
                  navigate(`/draft?projectId=${currentProject.id}`)
                }
              >
                查看初稿预览
              </Button>
              {!draftText && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  （尚未生成草稿，请先点击"生成初稿"）
                </Text>
              )}
            </Space>
          </Card>

          {/* HIL 弹窗：hilPending 非空且未被收起时自动弹出；点 X / 遮罩 / ESC 只是收起（不清理 hilPending），可重新打开 */}
          <HILDialog
            open={hilPending !== null && !hilDialogDismissed}
            stage={hilPending?.stage ?? null}
            message={hilPending?.message ?? ''}
            agentProposal={hilPending?.agentProposal ?? ''}
            experimentDesign={hilPending?.experimentDesign}
            literature={(artifacts?.literature ?? []) as { title?: string; authors?: string[]; year?: number; doi?: string | null; url?: string | null; source?: string; abstract?: string }[]}
            title={hilPending?.title}
            submitting={loading}
            onConfirm={(t) => void hilConfirm(t)}
            onEdit={(t) => void hilEdit(t)}
            onEditExperiment={(d) => void hilEditExperiment(d)}
            onEditLiterature={(mode, lits) => hilEditLiterature(mode, lits)}
            onRollback={() => void hilRollback()}
            onAbort={() => void hilAbort()}
            onCancel={() => {
              // 暂缓处理：仅收起弹窗，hilPending 保留在 store 里，可在下方"待处理 HIL"区域重新打开
              setHilDialogDismissed(true)
            }}
          />
        </PageContainer>
      </Content>
    </Layout>
  )
}

// 判断某阶段是否已有保存的产物（用于历史回看的空状态提示）
const hasArtifact = (artifacts: Project['artifacts'], stage: StageKey): boolean => {
  if (!artifacts) return false
  switch (stage) {
    case 'literature':
      return Array.isArray(artifacts.literature) && artifacts.literature.length > 0
    case 'design':
      return !!artifacts.design
    case 'experiment':
      return !!artifacts.experiment
    case 'evaluate':
      return !!artifacts.evaluation
    case 'discuss':
      return !!artifacts.discussion
    case 'write':
      return !!artifacts.paperSections || !!artifacts.thinking
    case 'figure':
      return Array.isArray(artifacts.figures) && artifacts.figures.length > 0
    case 'submit':
      return !!(artifacts as Record<string, unknown>).submission
    default:
      return false
  }
}

// 关键节点高亮组件
const LiteratureHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  const list = (artifacts?.literature ?? []) as { title?: string; authors?: string[]; year?: number }[]
  if (list.length === 0) return null
  return (
    <Alert
      style={{ marginBottom: 8 }}
      type="success"
      showIcon
      icon={<BookOutlined />}
      message={`已检索到 ${list.length} 篇候选文献`}
      description={
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {list.slice(0, 5).map((l, i) => (
            <li key={i} style={{ fontSize: 12 }}>
              {l.title ?? '(无标题)'} · {l.year ?? '-'} · {(l.authors ?? []).slice(0, 2).join(', ')}
            </li>
          ))}
        </ul>
      }
    />
  )
}

const DesignHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  const d = artifacts?.design
  if (!d) return null
  return (
    <Card size="small" type="inner" title="研究方案" style={{ marginBottom: 8 }}>
      {d.hypothesis && (
        <Paragraph style={{ marginBottom: 4 }}>
          <Text strong>假设：</Text>
          {d.hypothesis}
        </Paragraph>
      )}
      {d.method && (
        <Paragraph style={{ marginBottom: 4 }}>
          <Text strong>方法：</Text>
          {d.method}
        </Paragraph>
      )}
      {d.plan && (
        <Paragraph style={{ marginBottom: 0 }}>
          <Text strong>计划：</Text>
          {d.plan}
        </Paragraph>
      )}
    </Card>
  )
}

const EvaluationHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  const e = artifacts?.evaluation
  const metrics = e?.metrics ?? []
  if (metrics.length === 0 && !e?.conclusion) return null
  return (
    <Card
      size="small"
      type="inner"
      title={
        <span>
          <BarChartOutlined /> 评估指标
        </span>
      }
      style={{ marginBottom: 8 }}
    >
      <Row gutter={8}>
        {metrics.map((m, i) => (
          <Col key={i} xs={12} sm={8}>
            <Card size="small" style={{ textAlign: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {m.name}
              </Text>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#2563eb' }}>
                {m.value}
                {m.baseline !== undefined && (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                    基线 {m.baseline}
                  </Text>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      {e?.conclusion && (
        <Paragraph style={{ marginBottom: 0 }}>
          <Text strong>结论：</Text>
          {e.conclusion}
        </Paragraph>
      )}
    </Card>
  )
}

const WritingHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  const thinking = artifacts?.thinking
  const rawSections = artifacts?.paperSections
  const sections = Array.isArray(rawSections)
    ? rawSections
    : rawSections && typeof rawSections === 'object'
      ? Object.entries(rawSections).map(([type, content]) => ({
          type,
          title: sectionTitle(type),
          content,
        }))
      : []

  if (sections.length === 0 && !thinking) return null

  return (
    <>
      {/* DeepSeek 思考过程 */}
      {thinking && (thinking.guide || thinking.reasoning) && (
        <Card
          size="small"
          type="inner"
          style={{ marginBottom: 8, borderColor: '#d4a017', borderWidth: 1 }}
          title={
            <Space>
              <BulbOutlined style={{ color: '#d4a017' }} />
              <span>DeepSeek 深度思考</span>
              {thinking.hasReasoning && (
                <Tag color="orange" style={{ fontSize: 11 }}>
                  reasoning
                </Tag>
              )}
            </Space>
          }
        >
          <Collapse
            ghost
            defaultActiveKey={['guide']}
            items={[
              // 结构化写作指导
              ...(thinking.guide
                ? [
                    {
                      key: 'guide',
                      label: (
                        <Space>
                          <ThunderboltOutlined style={{ color: '#2563eb' }} />
                          <Text strong>写作架构师指导</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ({thinking.guide.length} 字符)
                          </Text>
                        </Space>
                      ),
                      children: (
                        <div
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 400,
                            overflowY: 'auto',
                            padding: '8px 12px',
                            background: '#fafafa',
                            borderRadius: 6,
                            fontSize: 13,
                            lineHeight: 1.8,
                          }}
                        >
                          {thinking.guide}
                        </div>
                      ),
                    },
                  ]
                : []),
              // 原始思考链（reasoning_content）
              ...(thinking.reasoning
                ? [
                    {
                      key: 'reasoning',
                      label: (
                        <Space>
                          <RobotOutlined style={{ color: '#7c3aed' }} />
                          <Text strong>思考链（Chain-of-Thought）</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ({thinking.reasoning.length} 字符)
                          </Text>
                        </Space>
                      ),
                      children: (
                        <div
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 500,
                            overflowY: 'auto',
                            padding: '8px 12px',
                            background: '#f5f3ff',
                            borderRadius: 6,
                            fontSize: 13,
                            lineHeight: 1.8,
                            borderLeft: '3px solid #7c3aed',
                          }}
                        >
                          {thinking.reasoning}
                        </div>
                      ),
                    },
                  ]
                : []),
            ].filter(Boolean)}
          />
        </Card>
      )}

      {/* 论文章节列表 */}
      {sections.length > 0 && (
        <Card
          size="small"
          type="inner"
          title={
            <span>
              <FileTextOutlined /> 论文章节
            </span>
          }
          style={{ marginBottom: 8 }}
        >
          <List
            size="small"
            dataSource={sections}
            renderItem={(s) => (
              <List.Item>
                <Space>
                  <Tag color="blue">{s.type}</Tag>
                  <Text>{s.title}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}
    </>
  )
}

const sectionTitle = (type: string): string => {
  const map: Record<string, string> = {
    abstract: '摘要',
    introduction: '引言',
    method: '方法',
    results: '结果',
    discussion: '讨论',
    conclusion: '结论',
  }
  return map[type] ?? type
}

const FigureHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  const figs = artifacts?.figures ?? []
  if (figs.length === 0) return null
  return (
    <Card
      size="small"
      type="inner"
      title={
        <span>
          <PictureOutlined /> 图表
        </span>
      }
      style={{ marginBottom: 8 }}
    >
      <List
        size="small"
        dataSource={figs}
        renderItem={(f) => (
          <List.Item>
            <Space direction="vertical" size={0}>
              <Text strong>{f.name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {f.caption}
              </Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  )
}

// experiment 阶段高亮：展示用户输入的实验内容与结果
const ExperimentHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  const exp = artifacts?.experiment as
    | {
        source?: string
        methodology?: string
        materials?: string
        procedure?: string
        metrics?: { name: string; value: string; unit?: string; note?: string }[]
        resultsDescription?: string
        notes?: string
      }
    | undefined
  if (!exp || (!exp.methodology && !exp.resultsDescription)) return null
  const isUser = exp.source === 'user'
  return (
    <Card
      size="small"
      type="inner"
      title={
        <span>
          <ExperimentOutlined /> 实验内容与结果
          <Tag color={isUser ? 'green' : 'blue'} style={{ marginLeft: 8 }}>
            {isUser ? '用户输入' : 'LLM 模拟'}
          </Tag>
        </span>
      }
      style={{ marginBottom: 8 }}
    >
      {exp.methodology && (
        <Paragraph style={{ marginBottom: 4 }}>
          <Text strong>方法：</Text>
          {exp.methodology}
        </Paragraph>
      )}
      {exp.materials && (
        <Paragraph style={{ marginBottom: 4 }}>
          <Text strong>材料：</Text>
          {exp.materials}
        </Paragraph>
      )}
      {exp.procedure && (
        <Paragraph style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}>
          <Text strong>步骤：</Text>
          {exp.procedure}
        </Paragraph>
      )}
      {Array.isArray(exp.metrics) && exp.metrics.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Text strong>指标：</Text>
          <Row gutter={8} style={{ marginTop: 4 }}>
            {exp.metrics.map((m, i) => (
              <Col key={i} xs={12} sm={8}>
                <Card size="small" style={{ textAlign: 'center', marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {m.name}
                  </Text>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#16a34a' }}>
                    {m.value}
                    {m.unit && <span style={{ fontSize: 12, marginLeft: 4 }}>{m.unit}</span>}
                  </div>
                  {m.note && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {m.note}
                    </Text>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}
      {exp.resultsDescription && (
        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          <Text strong>结果描述：</Text>
          {exp.resultsDescription}
        </Paragraph>
      )}
    </Card>
  )
}

// discuss 阶段高亮：展示讨论文本
const DiscussionHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  // 兼容 discussion 是 string 或 { points, limitations } 两种格式
  const dis = artifacts?.discussion as unknown
  let text = ''
  if (typeof dis === 'string') {
    text = dis
  } else if (dis && typeof dis === 'object') {
    const d = dis as { points?: string[]; limitations?: string[]; summary?: string }
    const parts: string[] = []
    if (d.summary) parts.push(d.summary)
    if (Array.isArray(d.points) && d.points.length) parts.push('要点：' + d.points.join('；'))
    if (Array.isArray(d.limitations) && d.limitations.length)
      parts.push('局限：' + d.limitations.join('；'))
    text = parts.join('\n')
  }
  if (!text) return null
  return (
    <Card
      size="small"
      type="inner"
      title={
        <span>
          <MessageOutlined /> 讨论与分析
        </span>
      }
      style={{ marginBottom: 8 }}
    >
      <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{text}</Paragraph>
    </Card>
  )
}

// submit 阶段高亮：展示投稿信息
const SubmissionHighlight: React.FC<{ artifacts: Project['artifacts'] }> = ({ artifacts }) => {
  // submission 可能在 artifacts.submission 或 artifacts.submission（snake_case）
  const sub = (artifacts as { submission?: Record<string, unknown> }).submission
  if (!sub || typeof sub !== 'object') return null
  const targetVenue = sub.target_venue as Array<{ name?: string; tier?: string; reason?: string }> | undefined
  const coverLetter = sub.cover_letter as string | undefined
  const checklist = sub.checklist as string[] | undefined
  const suggestion = sub.suggestion as string | undefined
  if (!targetVenue && !coverLetter && !checklist && !suggestion) return null
  return (
    <Card
      size="small"
      type="inner"
      title={
        <span>
          <SendOutlined /> 投稿信息
        </span>
      }
      style={{ marginBottom: 8 }}
    >
      {Array.isArray(targetVenue) && targetVenue.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Text strong>推荐目标：</Text>
          <List
            size="small"
            dataSource={targetVenue}
            renderItem={(v, i) => (
              <List.Item>
                <Space>
                  <Tag color="purple">{v.tier ?? '?'}</Tag>
                  <Text>{v.name ?? '?'}</Text>
                  {v.reason && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {v.reason}
                    </Text>
                  )}
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}
      {coverLetter && (
        <Paragraph style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}>
          <Text strong>Cover Letter：</Text>
          {coverLetter}
        </Paragraph>
      )}
      {Array.isArray(checklist) && checklist.length > 0 && (
        <Paragraph style={{ marginBottom: 4 }}>
          <Text strong>投稿清单：</Text>
          {checklist.join('；')}
        </Paragraph>
      )}
      {suggestion && (
        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          <Text strong>建议：</Text>
          {suggestion}
        </Paragraph>
      )}
    </Card>
  )
}

export default Workbench
