import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Progress,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Radio,
  Timeline,
  Space,
  Typography,
  message,
} from 'antd'
import {
  ProjectOutlined,
  ExperimentOutlined,
  BookOutlined,
  FileTextOutlined,
  PlusOutlined,
  RocketOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import StatusDot from '@/components/StatusDot'
import { useProjectStore } from '@/store/projectStore'
import { DISCIPLINES, DRAFT_TEMPLATES, getStage, PROJECT_STATUS_MAP } from '@/constants'
import type { DraftTemplate, PipelineMode, Project, ActivityItem } from '@/types'

const { Text } = Typography

// 最近活动 mock 数据（后端活动流未实现，暂用占位）
const mockActivities: ActivityItem[] = [
  {
    id: 'a1',
    time: '2026-06-28T09:32:00Z',
    content: '项目「面向低资源的中文医疗问答」进入实验阶段',
    type: 'info',
  },
  {
    id: 'a2',
    time: '2026-06-28T08:50:00Z',
    content: '文献库新增 12 篇 arXiv 论文（医疗问答方向）',
    type: 'success',
  },
  {
    id: 'a3',
    time: '2026-06-27T18:10:00Z',
    content: '项目「扩散模型在材料微结构生成中的应用」已暂停',
    type: 'warning',
  },
  {
    id: 'a4',
    time: '2026-06-27T16:00:00Z',
    content: '人审中断点：论文初稿定稿审阅待处理',
    type: 'warning',
  },
  {
    id: 'a5',
    time: '2026-06-27T11:24:00Z',
    content: '实验 exp-023 完成，BLEU=42.1，超过基线 +3.4',
    type: 'success',
  },
  {
    id: 'a6',
    time: '2026-06-26T20:00:00Z',
    content: '项目「高光谱图像语义分割研究」已投稿',
    type: 'success',
  },
]

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { projects, selectProject, fetchProjects, createProject, loading } =
    useProjectStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  // 进入页面拉取真实项目数据
  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  // 暂用占位统计（后端实验/文献/论文统计接口未实现）
  const runningExp = 0
  const literatureCount = 0
  const donePapers = 0

  const handleOpenProject = (record: Project) => {
    selectProject(record)
    // 跳转时带上 projectId，刷新后可通过 URL 参数恢复
    navigate(`/workbench?projectId=${record.id}`)
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      const created = await createProject({
        name: values.name,
        discipline: values.discipline,
        question: values.question,
        description: values.description,
        mode: values.mode as PipelineMode,
        template: values.template as DraftTemplate,
      })
      if (created) {
        message.success('项目已创建')
        form.resetFields()
        setModalOpen(false)
        navigate(`/workbench?projectId=${created.id}`)
      }
    } catch {
      // 校验失败或创建失败
    } finally {
      setCreating(false)
    }
  }

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Project) => (
        <a onClick={() => handleOpenProject(record)}>{text}</a>
      ),
    },
    {
      title: '学科',
      dataIndex: 'discipline',
      key: 'discipline',
      render: (d: string) => {
        const disc = DISCIPLINES.find((x) => x.key === d)
        return <Tag color="blue">{disc?.label ?? d}</Tag>
      },
    },
    {
      title: '当前阶段',
      dataIndex: 'stage',
      key: 'stage',
      render: (stage: Project['stage']) => {
        const s = getStage(stage)
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 180,
      render: (p: number | undefined) => (
        <Progress percent={p ?? 0} size="small" strokeColor="#2563eb" />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: Project['status']) => {
        const m = PROJECT_STATUS_MAP[status] ?? { label: status, color: '#64748b' }
        return <StatusDot color={statusColor(status)} text={m.label} />
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: Project) => (
        <Space>
          <Button size="small" type="link" onClick={() => handleOpenProject(record)}>
            进入工作台
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="仪表盘"
      breadcrumb={[{ title: '首页' }, { title: '仪表盘' }]}
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void fetchProjects()}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            新建项目
          </Button>
        </Space>
      }
    >
      {/* 顶部统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card className="rap-card-shadow" variant="borderless">
            <Statistic
              title="项目数"
              value={projects.length}
              prefix={<ProjectOutlined style={{ color: '#2563eb' }} />}
              valueStyle={{ color: '#2563eb' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              本周新增 2 个
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="rap-card-shadow" variant="borderless">
            <Statistic
              title="进行中实验"
              value={runningExp}
              prefix={<ExperimentOutlined style={{ color: '#16a34a' }} />}
              valueStyle={{ color: '#16a34a' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              平均耗时 1.8h
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="rap-card-shadow" variant="borderless">
            <Statistic
              title="文献数"
              value={literatureCount}
              prefix={<BookOutlined style={{ color: '#0891b2' }} />}
              valueStyle={{ color: '#0891b2' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              覆盖 4 个数据源
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="rap-card-shadow" variant="borderless">
            <Statistic
              title="已完成论文"
              value={donePapers}
              prefix={<FileTextOutlined style={{ color: '#9333ea' }} />}
              valueStyle={{ color: '#9333ea' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              已投稿 1 篇
            </Text>
          </Card>
        </Col>
      </Row>

      {/* 项目列表 */}
      <Card
        title={<span><RocketOutlined /> 项目列表</span>}
        className="rap-card-shadow"
        variant="borderless"
        style={{ marginTop: 16 }}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {projects.length} 个项目</Text>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={projects}
          pagination={{ pageSize: 5, showSizeChanger: false }}
        />
      </Card>

      {/* 最近活动时间线 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            title="最近活动"
            className="rap-card-shadow"
            variant="borderless"
          >
            <Timeline
              items={mockActivities.map((a) => ({
                color:
                  a.type === 'success'
                    ? 'green'
                    : a.type === 'warning'
                      ? 'orange'
                      : a.type === 'error'
                        ? 'red'
                        : 'blue',
                children: (
                  <div>
                    <div style={{ fontSize: 13 }}>{a.content}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(a.time).format('YYYY-MM-DD HH:mm')}
                    </Text>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="系统状态" className="rap-card-shadow" variant="borderless">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>LLM 服务</Text>
                <StatusDot color="green" text="在线 · DeepSeek-R1" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>RAG 知识库</Text>
                <StatusDot color="green" text="就绪 · 248 篇" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>实验调度器</Text>
                <StatusDot color="yellow" text="1 个队列待执行" pulse />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>WebSocket 推送</Text>
                <StatusDot color="gray" text="未连接" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>GPU 资源</Text>
                <Text type="secondary">A100 × 2 · 68% 占用</Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 新建项目弹窗 */}
      <Modal
        title="新建研究项目"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ discipline: 'NLP', mode: 'auto', template: 'markdown' }}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：面向低资源的医疗问答系统" />
          </Form.Item>
          <Form.Item
            name="discipline"
            label="学科方向"
            rules={[{ required: true, message: '请选择学科' }]}
          >
            <Select
              options={DISCIPLINES.map((d) => ({
                value: d.key,
                label: `${d.key} · ${d.label}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="question"
            label="研究问题"
            rules={[
              { required: true, message: '请输入研究问题' },
              { max: 500, message: '研究问题不能超过 500 字' },
            ]}
            extra="一段话描述你要解决的核心科学问题，例如：如何用扩散模型高效生成多孔材料微结构？"
          >
            <Input.TextArea
              rows={3}
              placeholder="例如：如何在小样本场景下提升中文医疗问答的准确率？"
              showCount
              maxLength={500}
            />
          </Form.Item>
          <Form.Item name="description" label="研究描述">
            <Input.TextArea
              rows={2}
              placeholder="简要描述研究目标与核心方法"
            />
          </Form.Item>
          <Form.Item
            name="mode"
            label="推进模式"
            extra="auto：全自动推进；manual：每个 HIL 中断点都需人工审阅"
            rules={[{ required: true, message: '请选择推进模式' }]}
          >
            <Radio.Group>
              <Space>
                <Radio value="auto">全自动（auto）</Radio>
                <Radio value="manual">人工审阅（manual）</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="template"
            label="初稿模板"
            rules={[{ required: true, message: '请选择初稿模板' }]}
          >
            <Select
              options={DRAFT_TEMPLATES.map((t) => ({
                value: t.key,
                label: `${t.label}（${t.ext}）`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}

// 状态映射到 StatusDot 颜色
function statusColor(status: Project['status']): 'green' | 'yellow' | 'red' | 'gray' | 'blue' {
  switch (status) {
    case 'running':
      return 'green'
    case 'paused':
      return 'yellow'
    case 'error':
      return 'red'
    case 'done':
    case 'completed':
      return 'blue'
    case 'draft':
    case 'archived':
    case 'idle':
    default:
      return 'gray'
  }
}

export default Dashboard
