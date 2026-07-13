import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card,
  Form,
  Input,
  Button,
  Select,
  Radio,
  Typography,
  Space,
  Divider,
  Tag,
  message,
  Skeleton,
  Empty,
  Modal,
} from 'antd'
import {
  ProjectOutlined,
  SaveOutlined,
  RollbackOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import { useProjectStore } from '@/store/projectStore'
import { DISCIPLINES, DRAFT_TEMPLATES, getStage, PROJECT_STATUS_MAP } from '@/constants'
import type { DraftTemplate, PipelineMode } from '@/types'

const { Text, Paragraph } = Typography

interface SettingsFormValues {
  name: string
  discipline: string
  question: string
  description?: string
  mode: PipelineMode
  template: DraftTemplate
}

const ProjectSettings: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const {
    projects,
    currentProject,
    fetchProjects,
    selectProjectById,
    updateProject,
  } = useProjectStore()

  const [form] = Form.useForm<SettingsFormValues>()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const projectId = id ?? currentProject?.id
  const project = useMemo(() => {
    if (!projectId) return null
    return projects.find((p) => p.id === projectId) ?? currentProject
  }, [projectId, projects, currentProject])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      if (projects.length === 0) {
        await fetchProjects()
      }
      if (projectId && currentProject?.id !== projectId) {
        await selectProjectById(projectId)
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (project) {
      form.setFieldsValue({
        name: project.name,
        discipline: project.discipline,
        question: project.question,
        description: project.description ?? '',
        mode: (project.mode ?? 'auto') as PipelineMode,
        template: (project.template ?? 'markdown') as DraftTemplate,
      })
    }
  }, [project, form])

  const handleSave = async (values: SettingsFormValues) => {
    if (!projectId) {
      message.error('未找到项目 ID')
      return
    }
    setSaving(true)
    try {
      const updated = await updateProject(projectId, {
        name: values.name,
        discipline: values.discipline,
        question: values.question,
        description: values.description ?? '',
        mode: values.mode,
        template: values.template,
      })
      if (updated) {
        message.success('项目设置已保存')
      } else {
        message.error('保存失败，请检查后端服务')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (project) {
      form.setFieldsValue({
        name: project.name,
        discipline: project.discipline,
        question: project.question,
        description: project.description ?? '',
        mode: (project.mode ?? 'auto') as PipelineMode,
        template: (project.template ?? 'markdown') as DraftTemplate,
      })
      message.info('已重置为最近一次保存的值')
    }
  }

  const handleBack = () => {
    navigate(-1)
  }

  if (loading) {
    return (
      <PageContainer
        title="项目设置"
        breadcrumb={[{ title: '首页' }, { title: '项目设置' }]}
      >
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </PageContainer>
    )
  }

  if (!project) {
    return (
      <PageContainer
        title="项目设置"
        breadcrumb={[{ title: '首页' }, { title: '项目设置' }]}
      >
        <Card>
          <Empty description="未找到项目，可能已被删除或无权访问">
            <Button type="primary" onClick={() => navigate('/')}>
              返回首页
            </Button>
          </Empty>
        </Card>
      </PageContainer>
    )
  }

  const stageInfo = getStage(project.stage)
  const statusInfo = PROJECT_STATUS_MAP[project.status] ?? {
    label: project.status,
    color: '#64748b',
  }

  return (
    <PageContainer
      title="项目设置"
      breadcrumb={[{ title: '首页' }, { title: '项目设置' }]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          variant="borderless"
          className="rap-card-shadow"
          styles={{ body: { padding: 16 } }}
        >
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
              返回
            </Button>
            <Text strong style={{ fontSize: 16 }}>
              <ProjectOutlined /> {project.name}
            </Text>
            <Tag color={stageInfo.color}>{stageInfo.label}</Tag>
            <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              创建时间：{dayjs(project.createdAt).format('YYYY-MM-DD HH:mm')}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              更新时间：{dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </Space>
        </Card>

        <Card
          title={<span><ProjectOutlined /> 基本信息</span>}
          className="rap-card-shadow"
          variant="borderless"
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            style={{ maxWidth: 720 }}
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

            <Divider style={{ margin: '8px 0' }} />

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
              extra="影响最终论文初稿的渲染格式（Markdown / LaTeX）"
            >
              <Select
                options={DRAFT_TEMPLATES.map((t) => ({
                  value: t.key,
                  label: `${t.label}（${t.ext}）`,
                }))}
              />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saving}
                >
                  保存设置
                </Button>
                <Button icon={<RollbackOutlined />} onClick={handleReset}>
                  重置
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>

        <Card
          title={<span><ExperimentOutlined /> 流水线状态（只读）</span>}
          className="rap-card-shadow"
          variant="borderless"
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Text type="secondary">当前阶段：</Text>
              <Tag color={stageInfo.color}>{stageInfo.label}</Tag>
              <Text type="secondary">流水线状态：</Text>
              <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
              <Text type="secondary">推进模式：</Text>
              <Tag color={project.mode === 'auto' ? 'blue' : 'orange'}>
                {project.mode === 'auto' ? '全自动' : '人工审阅'}
              </Tag>
              <Text type="secondary">初稿模板：</Text>
              <Tag>{project.template}</Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              提示：阶段切换、模式切换也可以在「项目工作台」页面通过相应按钮操作。本页面仅用于修改项目元信息。
            </Text>
          </Space>
        </Card>

        <Card
          title={<span><FileTextOutlined /> 危险操作</span>}
          className="rap-card-shadow"
          variant="borderless"
          styles={{ body: { padding: 16 } }}
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
            删除项目将移除其所有版本、HIL 记录与产物，且不可恢复。
          </Paragraph>
          <Button
            danger
            type="dashed"
            onClick={() => {
              Modal.confirm({
                title: '确认删除该项目？',
                content: `将永久删除「${project.name}」，操作不可撤销。`,
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: async () => {
                  message.info('删除接口请通过项目列表触发；本页不直接提供删除按钮。')
                  navigate('/')
                },
              })
            }}
          >
            删除项目（引导至列表操作）
          </Button>
        </Card>
      </Space>
    </PageContainer>
  )
}

export default ProjectSettings
