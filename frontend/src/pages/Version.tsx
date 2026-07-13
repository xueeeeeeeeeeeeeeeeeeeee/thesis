import React, { useState } from 'react'
import {
  Card,
  Timeline,
  Table,
  Tag,
  Button,
  Typography,
  Space,
  Row,
  Col,
  Modal,
  Empty,
  Tooltip,
} from 'antd'
import {
  BranchesOutlined,
  RollbackOutlined,
  DiffOutlined,
  HistoryOutlined,
  TagOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import { useProjectStore } from '@/store/projectStore'
import { getStage } from '@/constants'
import type { Version } from '@/types'

const { Text, Paragraph } = Typography

const VersionPage: React.FC = () => {
  const { currentProject } = useProjectStore()
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffVersion, setDiffVersion] = useState<Version | null>(null)

  // 优先从后端返回的项目 versions 字段读取
  const versions: Version[] = currentProject?.versions ?? []

  const openDiff = (v: Version) => {
    setDiffVersion(v)
    setDiffOpen(true)
  }

  const columns = [
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      render: (v: string) => (
        <Space>
          <TagOutlined style={{ color: '#2563eb' }} />
          <Text strong className="rap-mono">{v}</Text>
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '阶段',
      dataIndex: 'stage',
      key: 'stage',
      render: (stage: Version['stage']) => {
        const s = getStage(stage)
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '改动摘要',
      dataIndex: 'summary',
      key: 'summary',
      render: (s: string) => <Text style={{ fontSize: 13 }}>{s}</Text>,
    },
    {
      title: '提交者',
      dataIndex: 'author',
      key: 'author',
      width: 90,
      render: (a: string) => (
        <Tag color={a === '用户' ? 'purple' : 'blue'}>{a}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: Version) => (
        <Space size="small">
          <Button size="small" type="link" icon={<DiffOutlined />} onClick={() => openDiff(record)}>
            查看 diff
          </Button>
          <Tooltip title="回滚到此版本">
            <Button size="small" type="link" danger icon={<RollbackOutlined />}>
              回滚
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="版本管理"
      breadcrumb={[{ title: '首页' }, { title: '版本管理' }]}
      extra={
        currentProject ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前项目：{currentProject.name}
          </Text>
        ) : null
      }
    >
      {/* 顶部：版本时间线 */}
      <Card
        title={<span><HistoryOutlined /> 版本时间线</span>}
        className="rap-card-shadow"
        variant="borderless"
        style={{ marginBottom: 16 }}
      >
        {versions.length === 0 ? (
          <Empty description="当前项目暂无版本记录" />
        ) : (
          <Timeline
            mode="left"
            items={versions.map((v) => {
              const s = getStage(v.stage)
              return {
                color: s.color,
                label: dayjs(v.createdAt).format('MM-DD HH:mm'),
                children: (
                  <div>
                    <Space>
                      <Text strong className="rap-mono">{v.version}</Text>
                      <Tag color={s.color}>{s.label}</Tag>
                      <Tag color={v.author === '用户' ? 'purple' : 'blue'}>{v.author}</Tag>
                    </Space>
                    <div>
                      <Text style={{ fontSize: 13 }}>{v.summary}</Text>
                    </div>
                  </div>
                ),
              }
            })}
          />
        )}
      </Card>

      {/* 版本列表表格 */}
      <Card
        title={<span><BranchesOutlined /> 版本列表</span>}
        className="rap-card-shadow"
        variant="borderless"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {versions.length} 个版本</Text>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={versions}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: <Empty description="暂无版本数据" /> }}
        />
      </Card>

      {/* diff 视图占位 */}
      <Modal
        title={diffVersion ? `版本 diff · ${diffVersion.version}` : '版本 diff'}
        open={diffOpen}
        onCancel={() => setDiffOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDiffOpen(false)}>关闭</Button>,
          <Button key="rollback" danger icon={<RollbackOutlined />}>回滚到此版本</Button>,
        ]}
        width={720}
      >
        {diffVersion && (
          <div>
            <Paragraph>
              <Text strong>改动摘要：</Text>{diffVersion.summary}
            </Paragraph>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>版本</Text>
                <div><Text strong className="rap-mono">{diffVersion.version}</Text></div>
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>阶段</Text>
                <div><Tag color={getStage(diffVersion.stage).color}>{getStage(diffVersion.stage).label}</Tag></div>
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>提交时间</Text>
                <div><Text>{dayjs(diffVersion.createdAt).format('YYYY-MM-DD HH:mm')}</Text></div>
              </Col>
            </Row>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, fontFamily: 'SF Mono, Menlo, Consolas, monospace', fontSize: 12, lineHeight: 1.7 }}>
              <div className="rap-log-line">
                <span className="rap-diff-del">- loss: 0.41 (epoch 1)</span>
              </div>
              <div className="rap-log-line">
                <span className="rap-diff-add">+ loss: 0.34 (epoch 2)</span>
              </div>
              <div className="rap-log-line">
                <span className="rap-diff-del">- BLEU: 40.2</span>
              </div>
              <div className="rap-log-line">
                <span className="rap-diff-add">+ BLEU: 42.1 (+1.9)</span>
              </div>
              <div className="rap-log-line">
                <span className="rap-diff-del">- ROUGE-L: 37.1</span>
              </div>
              <div className="rap-log-line">
                <span className="rap-diff-add">+ ROUGE-L: 38.9 (+1.8)</span>
              </div>
              <div className="rap-log-line" style={{ color: '#94a3b8' }}>
                @@ metrics.json @@ 6 行变更
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>变更文件：</Text>
              <div style={{ marginTop: 4 }}>
                <Tag color="green">+ metrics.json</Tag>
                <Tag color="orange">~ experiment_config.yaml</Tag>
                <Tag color="red">- old_baseline.json</Tag>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}

export default VersionPage
