import React, { useState } from 'react'
import {
  Card,
  List,
  Tag,
  Typography,
  Space,
  Button,
  Input,
  Empty,
  Row,
  Col,
  Tooltip,
  Badge,
  Divider,
} from 'antd'
import {
  CheckOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
  RobotOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import StatusDot from '@/components/StatusDot'
import { useProjectStore } from '@/store/projectStore'
import { usePipelineStore } from '@/store/pipelineStore'
import { getStage, HIL_STATUS_MAP } from '@/constants'
import type { HILItem } from '@/types'

const { Text, Paragraph, Title } = Typography
const { TextArea } = Input

const HILReview: React.FC = () => {
  // 队列数据来自 pipelineStore（与 Workbench 弹窗是同一份），决策也走 resumePipeline
  const { currentProject } = useProjectStore()
  const { hilPending, resumePipeline, loading, setHilPending } = usePipelineStore()
  const [editText, setEditText] = useState(hilPending?.agentProposal ?? '')

  // 同步编辑区文本
  React.useEffect(() => {
    if (hilPending) setEditText(hilPending.agentProposal)
  }, [hilPending?.stage, hilPending?.agentProposal])

  // 演示用：手动塞入一个 HIL（不依赖流水线启动，方便用户先看到完整 UI 与按钮交互）
  const injectDemoHIL = (stage: 'literature' | 'design' | 'experiment' | 'evaluate'): void => {
    const stageDef = getStage(stage)
    setHilPending({
      stage,
      title: `${stageDef.label}阶段需您审阅`,
      message: `Agent 已完成${stageDef.label}阶段的工作，请审阅下方内容并决策。`,
      agentProposal: `【${stageDef.label}·演示数据】\n\n这是 Agent 在 ${stageDef.label} 阶段生成的提议内容示例。\n\n您可以：\n1. 直接点击「通过」采纳本提议\n2. 编辑后点击「编辑后通过」\n3. 点击「回滚重做」让 Agent 重新执行本阶段\n4. 点击「中止」结束流水线`,
    })
  }

  // 包装成 HILItem 形状以复用渲染逻辑
  const hilItems: HILItem[] = hilPending
    ? [
        {
          id: 'current',
          projectId: currentProject?.id ?? '',
          projectName: currentProject?.name ?? '当前项目',
          title: hilPending.title ?? `${getStage(hilPending.stage).label} 阶段需审阅`,
          stage: hilPending.stage,
          status: 'pending',
          reason: hilPending.message,
          agentProposal: hilPending.agentProposal,
          userEdit: editText,
          createdAt: new Date().toISOString(),
        },
      ]
    : []

  const handleAction = async (
    action: 'confirm' | 'edit' | 'rollback' | 'abort',
  ): Promise<void> => {
    if (!hilPending) return
    try {
      if (action === 'confirm') {
        await resumePipeline('confirm', { text: editText })
      } else if (action === 'edit') {
        await resumePipeline('edit', { text: editText })
      } else if (action === 'rollback') {
        await resumePipeline('rollback')
      } else {
        await resumePipeline('abort')
      }
    } catch {
      // 后端失败也继续清掉本地 HIL，让用户可以再决策或重新演示
    }
    // 决策完成：清掉当前 HIL，列表回到空状态
    setHilPending(null)
  }

  return (
    <PageContainer
      title="人审中断点审阅"
      breadcrumb={[{ title: '首页' }, { title: '人审中断点' }]}
      extra={
        <Space wrap>
          <Badge count={hilItems.length} offset={[-4, 4]}>
            <Text type="secondary">待审阅中断点</Text>
          </Badge>
          <Tooltip title="不启动真实流水线，直接塞入一个演示 HIL（方便先体验按钮交互）">
            <Space.Compact>
              <Button size="small" onClick={() => injectDemoHIL('literature')}>
                演示·文献
              </Button>
              <Button size="small" onClick={() => injectDemoHIL('design')}>
                演示·设计
              </Button>
              <Button size="small" onClick={() => injectDemoHIL('experiment')}>
                演示·实验
              </Button>
              <Button size="small" onClick={() => injectDemoHIL('evaluate')}>
                演示·评价
              </Button>
            </Space.Compact>
          </Tooltip>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        {/* 左侧：待审阅中断点列表 */}
        <Col xs={24} lg={9}>
          <Card
            title={<span><WarningOutlined style={{ color: '#ca8a04' }} /> 待审阅列表</span>}
            className="rap-card-shadow"
            variant="borderless"
            style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}
          >
            {hilItems.length === 0 ? (
              <Empty description="暂无待审阅中断点" />
            ) : (
              <List
                dataSource={hilItems}
                renderItem={(item: HILItem) => {
                  const stage = getStage(item.stage)
                  return (
                    <List.Item
                      style={{
                        padding: '12px 14px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 14 }}>{item.title}</Text>
                          <Tag color={HIL_STATUS_MAP[item.status]?.color ?? 'default'}>
                            {HIL_STATUS_MAP[item.status]?.label ?? item.status}
                          </Tag>
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <Tag color={stage.color}>{stage.label}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{item.projectName}</Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                        </Text>
                      </div>
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

        {/* 右侧：详情 + 编辑器 + 决策按钮 */}
        <Col xs={24} lg={15}>
          {hilItems.length === 0 ? (
            <Card className="rap-card-shadow" variant="borderless">
              <Empty description="当前没有待审阅的中断点。当流水线在某阶段停下来需要您审阅时，会出现在这里。" />
            </Card>
          ) : (
            <>
              {(() => {
                const item = hilItems[0]
                return (
                  <>
                    <Card
                      className="rap-card-shadow"
                      variant="borderless"
                      style={{ marginBottom: 16 }}
                    >
                      <Title level={5} style={{ marginTop: 0 }}>
                        {item.title}
                      </Title>
                      <Space wrap style={{ marginBottom: 12 }}>
                        <Tag color={getStage(item.stage).color}>
                          {getStage(item.stage).label} 阶段
                        </Tag>
                        <Tag color="blue">{item.projectName}</Tag>
                        <Tag>触发时间：{dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}</Tag>
                      </Space>
                      <Divider style={{ margin: '8px 0' }} />
                      <Text type="secondary">触发原因：</Text>
                      <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>
                        {item.reason}
                      </Paragraph>
                    </Card>

                    {/* Agent 提议 */}
                    <Card
                      title={<span><RobotOutlined style={{ color: '#2563eb' }} /> Agent 提议</span>}
                      className="rap-card-shadow"
                      variant="borderless"
                      style={{ marginBottom: 16 }}
                    >
                      <pre
                        style={{
                          background: '#f8fafc',
                          padding: 12,
                          borderRadius: 6,
                          fontSize: 13,
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                          margin: 0,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {item.agentProposal || '（暂无 Agent 提议）'}
                      </pre>
                    </Card>

                    {/* 用户编辑器 */}
                    <Card
                      title={<span><UserOutlined style={{ color: '#16a34a' }} /> 用户审阅 / 编辑</span>}
                      className="rap-card-shadow"
                      variant="borderless"
                      style={{ marginBottom: 16 }}
                      extra={
                        <Space>
                          <StatusDot color="yellow" text="待决策" pulse />
                        </Space>
                      }
                    >
                      <TextArea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={6}
                        placeholder="可在此编辑修改 Agent 的提议内容"
                        style={{ fontSize: 13 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                        提示：直接编辑后点击"编辑后通过"将使用您的修改版本
                      </Text>
                    </Card>

                    {/* 决策按钮 */}
                    <Card className="rap-card-shadow" variant="borderless">
                      <Text strong style={{ marginRight: 12 }}>决策操作：</Text>
                      <Space wrap>
                        <Tooltip title="完全采纳 Agent 提议，继续执行">
                          <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            loading={loading}
                            onClick={() => void handleAction('confirm')}
                          >
                            通过
                          </Button>
                        </Tooltip>
                        <Tooltip title="使用编辑后的内容继续">
                          <Button
                            icon={<EditOutlined />}
                            style={{ borderColor: '#16a34a', color: '#16a34a' }}
                            loading={loading}
                            onClick={() => void handleAction('edit')}
                          >
                            编辑后通过
                          </Button>
                        </Tooltip>
                        <Tooltip title="回滚到本阶段起点重新执行">
                          <Button
                            icon={<RollbackOutlined />}
                            style={{ borderColor: '#d97706', color: '#d97706' }}
                            loading={loading}
                            onClick={() => void handleAction('rollback')}
                          >
                            回滚重做
                          </Button>
                        </Tooltip>
                        <Tooltip title="中止当前项目执行">
                          <Button
                            danger
                            icon={<StopOutlined />}
                            loading={loading}
                            onClick={() => void handleAction('abort')}
                          >
                            中止
                          </Button>
                        </Tooltip>
                      </Space>
                    </Card>
                  </>
                )
              })()}
            </>
          )}
        </Col>
      </Row>
    </PageContainer>
  )
}

export default HILReview
