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
import { getStage, HIL_STATUS_MAP } from '@/constants'
import type { HILItem } from '@/types'

const { Text, Paragraph, Title } = Typography
const { TextArea } = Input

const HILReview: React.FC = () => {
  const { hilQueue, resolveHIL } = useProjectStore()
  const [selectedId, setSelectedId] = useState<string | null>(
    hilQueue[0]?.id ?? null,
  )
  const [editText, setEditText] = useState('')

  const selected = hilQueue.find((h) => h.id === selectedId) ?? null

  React.useEffect(() => {
    if (selected) setEditText(selected.userEdit ?? selected.agentProposal)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = (action: 'approved' | 'edited' | 'rolled_back' | 'aborted') => {
    if (!selected) return
    resolveHIL(selected.id)
    // 切换到下一个
    const remaining = hilQueue.filter((h) => h.id !== selected.id)
    setSelectedId(remaining[0]?.id ?? null)
  }

  return (
    <PageContainer
      title="人审中断点审阅"
      breadcrumb={[{ title: '首页' }, { title: '人审中断点' }]}
      extra={
        <Badge count={hilQueue.length} offset={[-4, 4]}>
          <Text type="secondary">待审阅中断点</Text>
        </Badge>
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
            {hilQueue.length === 0 ? (
              <Empty description="暂无待审阅中断点" />
            ) : (
              <List
                dataSource={hilQueue}
                renderItem={(item: HILItem) => {
                  const stage = getStage(item.stage)
                  const active = item.id === selectedId
                  return (
                    <List.Item
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        cursor: 'pointer',
                        padding: '12px 14px',
                        background: active ? '#eff6ff' : 'transparent',
                        border: `1px solid ${active ? '#bfdbfe' : '#f1f5f9'}`,
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 14 }}>{item.title}</Text>
                          <Tag color={HIL_STATUS_MAP[item.status].color}>
                            {HIL_STATUS_MAP[item.status].label}
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
          {!selected ? (
            <Card className="rap-card-shadow" variant="borderless">
              <Empty description="请从左侧选择一个中断点" />
            </Card>
          ) : (
            <>
              <Card
                className="rap-card-shadow"
                variant="borderless"
                style={{ marginBottom: 16 }}
              >
                <Title level={5} style={{ marginTop: 0 }}>
                  {selected.title}
                </Title>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag color={getStage(selected.stage).color}>
                    {getStage(selected.stage).label} 阶段
                  </Tag>
                  <Tag color="blue">{selected.projectName}</Tag>
                  <Tag>触发时间：{dayjs(selected.createdAt).format('YYYY-MM-DD HH:mm')}</Tag>
                </Space>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary">触发原因：</Text>
                <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>
                  {selected.reason}
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
                  {selected.agentProposal}
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
                      onClick={() => handleAction('approved')}
                    >
                      通过
                    </Button>
                  </Tooltip>
                  <Tooltip title="使用编辑后的内容继续">
                    <Button
                      icon={<EditOutlined />}
                      style={{ borderColor: '#16a34a', color: '#16a34a' }}
                      onClick={() => handleAction('edited')}
                    >
                      编辑后通过
                    </Button>
                  </Tooltip>
                  <Tooltip title="回滚到本阶段起点重新执行">
                    <Button
                      icon={<RollbackOutlined />}
                      style={{ borderColor: '#d97706', color: '#d97706' }}
                      onClick={() => handleAction('rolled_back')}
                    >
                      回滚重做
                    </Button>
                  </Tooltip>
                  <Tooltip title="中止当前项目执行">
                    <Button
                      danger
                      icon={<StopOutlined />}
                      onClick={() => handleAction('aborted')}
                    >
                      中止
                    </Button>
                  </Tooltip>
                </Space>
              </Card>
            </>
          )}
        </Col>
      </Row>
    </PageContainer>
  )
}

export default HILReview
