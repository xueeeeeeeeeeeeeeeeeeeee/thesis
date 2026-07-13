import React, { useEffect, useState } from 'react'
import {
  Card,
  Tabs,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Button,
  Typography,
  Space,
  Divider,
  Tag,
  Row,
  Col,
  Slider,
  message,
} from 'antd'
import {
  ApiOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  SettingOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'
import StatusDot from '@/components/StatusDot'
import { useAuthStore } from '@/store/authStore'
import { useUserStore } from '@/store/userStore'
import { updateMeApi } from '@/services/auth'
import { DISCIPLINES } from '@/constants'
import type { LLMTier, RAGConfig, SafeUser } from '@/types'

const { Text, Paragraph, Title } = Typography

// LLM 档位说明
const TIER_INFO: Record<
  LLMTier,
  { label: string; desc: string; recommend: string; color: string; keyField?: keyof SafeUser['apiKeys'] }
> = {
  strong: {
    label: '强推理',
    desc: '用于复杂推理、方案设计、论文撰写等高质量场景',
    recommend: 'DeepSeek-R1',
    color: '#2563eb',
    keyField: 'deepseek',
  },
  cheap: {
    label: '廉价快速',
    desc: '用于文献摘要、批量分类、简单问答等高频场景',
    recommend: 'DeepSeek-V3',
    color: '#16a34a',
    keyField: 'deepseek',
  },
  long: {
    label: '长上下文',
    desc: '用于长文献阅读、多轮对话、长文档处理',
    recommend: 'Kimi-K2',
    color: '#ca8a04',
    keyField: 'kimi',
  },
  embedding: {
    label: '嵌入模型',
    desc: '用于 RAG 向量检索、文档向量化（本地模型，无需 Key）',
    recommend: 'bge-m3',
    color: '#9333ea',
  },
}

// 各档位可选模型
const MODEL_OPTIONS: Record<LLMTier, { provider: string; model: string }[]> = {
  strong: [
    { provider: 'DeepSeek', model: 'DeepSeek-R1' },
    { provider: 'OpenAI', model: 'gpt-4o' },
    { provider: 'Anthropic', model: 'claude-3.7-sonnet' },
    { provider: '阿里', model: 'qwen-max' },
  ],
  cheap: [
    { provider: 'DeepSeek', model: 'DeepSeek-V3' },
    { provider: 'OpenAI', model: 'gpt-4o-mini' },
    { provider: '阿里', model: 'qwen-turbo' },
  ],
  long: [
    { provider: 'Moonshot', model: 'Kimi-K2' },
    { provider: 'Google', model: 'gemini-1.5-pro' },
    { provider: '阿里', model: 'qwen-long' },
  ],
  embedding: [
    { provider: 'BAAI', model: 'bge-m3' },
    { provider: 'BAAI', model: 'bge-large-zh' },
    { provider: 'OpenAI', model: 'text-embedding-3-large' },
  ],
}

const Config: React.FC = () => {
  const { user, updateUser } = useAuthStore()
  const { rag, setRAGConfig, reset } = useUserStore()

  // 本地编辑态：API Key 输入框（初始为后端掩码值）
  const [apiKeyInputs, setApiKeyInputs] = useState<{
    deepseek: string
    kimi: string
    qwen: string
  }>({
    deepseek: '',
    kimi: '',
    qwen: '',
  })
  const [discipline, setDiscipline] = useState<string>('NLP')
  const [savingKeys, setSavingKeys] = useState(false)
  const [savingDiscipline, setSavingDiscipline] = useState(false)

  // 从 authStore.user 同步初始值
  useEffect(() => {
    if (user) {
      setApiKeyInputs({
        deepseek: user.apiKeys?.deepseek ?? '',
        kimi: user.apiKeys?.kimi ?? '',
        qwen: user.apiKeys?.qwen ?? '',
      })
      setDiscipline(user.discipline)
    }
  }, [user])

  const handleSaveApiKeys = async () => {
    setSavingKeys(true)
    try {
      // 只提交有变化的字段
      const payload: Partial<SafeUser> = { apiKeys: {} }
      const current = user?.apiKeys ?? {}
      ;(Object.keys(apiKeyInputs) as Array<keyof typeof apiKeyInputs>).forEach((k) => {
        const v = apiKeyInputs[k]
        if (v && v !== current[k]) {
          payload.apiKeys![k] = v
        }
      })
      const res = await updateMeApi(payload)
      if (res?.code === 0 && res.data?.user) {
        updateUser(res.data.user)
        message.success('API Key 已保存')
      }
    } catch {
      // ignore
    } finally {
      setSavingKeys(false)
    }
  }

  const handleSaveDiscipline = async () => {
    setSavingDiscipline(true)
    try {
      const res = await updateMeApi({ discipline })
      if (res?.code === 0 && res.data?.user) {
        updateUser(res.data.user)
        message.success('学科已更新')
      }
    } catch {
      // ignore
    } finally {
      setSavingDiscipline(false)
    }
  }

  // LLM 配置 Tab
  const LLMTab = (
    <div>
      <Paragraph type="secondary">
        配置四档 LLM 模型，系统将根据任务复杂度自动路由到对应档位。
        API Key 从账号信息读取（掩码显示），修改后点击"保存 API Key"同步到后端。
      </Paragraph>
      <Row gutter={[16, 16]}>
        {(['strong', 'cheap', 'long', 'embedding'] as LLMTier[]).map((tier) => {
          const info = TIER_INFO[tier]
          return (
            <Col xs={24} lg={12} key={tier}>
              <Card
                size="small"
                className="rap-card-shadow"
                variant="outlined"
                title={
                  <Space>
                    <Tag color={info.color} style={{ margin: 0 }}>{info.label}</Tag>
                    <Text strong style={{ fontSize: 14 }}>{info.recommend}</Text>
                  </Space>
                }
              >
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  {info.desc}
                </Text>
                <Form layout="vertical" size="small">
                  <Form.Item label="推荐模型">
                    <Select
                      defaultValue={`${MODEL_OPTIONS[tier][0].provider}/${MODEL_OPTIONS[tier][0].model}`}
                      options={MODEL_OPTIONS[tier].map((m) => ({
                        value: `${m.provider}/${m.model}`,
                        label: `${m.provider} · ${m.model}`,
                      }))}
                    />
                  </Form.Item>
                  {info.keyField ? (
                    <Form.Item label="API Key（账号中心已配置）">
                      <Input.Password
                        value={apiKeyInputs[info.keyField]}
                        onChange={(e) =>
                          setApiKeyInputs((prev) => ({
                            ...prev,
                            [info.keyField!]: e.target.value,
                          }))
                        }
                        placeholder={`输入 ${info.keyField} 的完整 API Key`}
                        visibilityToggle
                      />
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                        后端返回的 Key 已掩码；输入完整 Key 后点击下方"保存 API Key"
                      </Text>
                    </Form.Item>
                  ) : (
                    <Form.Item label="API Key">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        本地嵌入模型，无需 API Key
                      </Text>
                    </Form.Item>
                  )}
                  <Form.Item label="调用状态">
                    {info.keyField && apiKeyInputs[info.keyField] ? (
                      <StatusDot color="green" text="已配置 Key" />
                    ) : info.keyField ? (
                      <StatusDot color="red" text="未配置 Key" />
                    ) : (
                      <StatusDot color="green" text="本地就绪" />
                    )}
                  </Form.Item>
                </Form>
              </Card>
            </Col>
          )
        })}
      </Row>
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSaveApiKeys}
          loading={savingKeys}
        >
          保存 API Key
        </Button>
      </div>
    </div>
  )

  // RAG 配置 Tab
  const RAGTab = (
    <div>
      <Paragraph type="secondary">
        配置检索增强生成（RAG）的数据源、分块策略与重排模型。
      </Paragraph>
      <Card className="rap-card-shadow" variant="borderless" title="数据源">
        <Row gutter={[16, 12]}>
          {(
            [
              { key: 'arXiv', label: 'arXiv', desc: '预印本论文库' },
              { key: 's2', label: 'Semantic Scholar', desc: '学术搜索引文库' },
              { key: 'openAlex', label: 'OpenAlex', desc: '开放学术知识图谱' },
              { key: 'pubMed', label: 'PubMed', desc: '生物医学文献库' },
            ] as const
          ).map((src) => (
            <Col xs={24} sm={12} key={src.key}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                }}
              >
                <div>
                  <Text strong>{src.label}</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{src.desc}</Text>
                  </div>
                </div>
                <Switch
                  checked={rag.sources[src.key]}
                  onChange={(checked) =>
                    setRAGConfig({
                      sources: { ...rag.sources, [src.key]: checked },
                    } as Partial<RAGConfig>)
                  }
                />
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      <Card className="rap-card-shadow" variant="borderless" title="分块策略" style={{ marginTop: 16 }}>
        <Form layout="vertical">
          <Form.Item label="分块方式">
            <Select
              value={rag.chunkStrategy}
              onChange={(v) => setRAGConfig({ chunkStrategy: v })}
              options={[
                { value: 'fixed', label: '固定长度（按 token 切分）' },
                { value: 'semantic', label: '语义分块（按段落/章节）' },
                { value: 'sentence', label: '句子级分块' },
              ]}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={`分块大小：${rag.chunkSize} tokens`}>
                <Slider
                  min={128}
                  max={2048}
                  step={64}
                  value={rag.chunkSize}
                  onChange={(v) => setRAGConfig({ chunkSize: v })}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={`重叠：${rag.overlap} tokens`}>
                <Slider
                  min={0}
                  max={256}
                  step={16}
                  value={rag.overlap}
                  onChange={(v) => setRAGConfig({ overlap: v })}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card className="rap-card-shadow" variant="borderless" title="重排与检索" style={{ marginTop: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={12}>
            <Space>
              <Switch
                checked={rag.reranker}
                onChange={(v) => setRAGConfig({ reranker: v })}
              />
              <div>
                <Text strong>启用 Reranker</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>使用 bge-reranker 重排候选文档</Text>
                </div>
              </div>
            </Space>
          </Col>
          <Col span={12}>
            <Text>Top-K 检索数：</Text>
            <InputNumber
              min={1}
              max={50}
              value={rag.topK}
              onChange={(v) => setRAGConfig({ topK: v ?? 10 })}
              style={{ width: 100, marginLeft: 8 }}
            />
          </Col>
        </Row>
      </Card>
    </div>
  )

  // 学科适配器 Tab（从 authStore.user.discipline 读取，保存调用 updateMeApi）
  const DisciplineTab = (
    <div>
      <Paragraph type="secondary">
        选择学科适配器，系统将根据学科特点调整 prompt 模板、评估指标与文献检索策略。
        学科信息保存在您的账号中。
      </Paragraph>
      <Card className="rap-card-shadow" variant="borderless">
        <Form layout="vertical">
          <Form.Item label="当前学科">
            <Select
              value={discipline}
              onChange={setDiscipline}
              options={DISCIPLINES.map((d) => ({
                value: d.key,
                label: `${d.key} · ${d.label}（${d.desc}）`,
              }))}
            />
          </Form.Item>
        </Form>
        <div style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveDiscipline}
            loading={savingDiscipline}
          >
            保存学科
          </Button>
        </div>
        <Divider />
        <Title level={5}>学科适配器说明</Title>
        <Row gutter={[12, 12]}>
          {DISCIPLINES.map((d) => (
            <Col xs={24} sm={12} lg={8} key={d.key}>
              <Card
                size="small"
                style={{
                  border: discipline === d.key ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: discipline === d.key ? '#eff6ff' : '#fff',
                }}
              >
                <Space direction="vertical" size={2}>
                  <Space>
                    <Tag color="blue">{d.key}</Tag>
                    <Text strong>{d.label}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>{d.desc}</Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )

  // 通用配置 Tab
  const GeneralTab = (
    <Card className="rap-card-shadow" variant="borderless">
      <Form layout="vertical" style={{ maxWidth: 560 }}>
        <Form.Item label="系统名称">
          <Input defaultValue="Research Auto-Pilot (RAP)" />
        </Form.Item>
        <Form.Item label="后端 API 地址">
          <Input defaultValue="http://localhost:3001" />
        </Form.Item>
        <Form.Item label="WebSocket 地址">
          <Input defaultValue="ws://localhost:5173/ws" />
        </Form.Item>
        <Form.Item label="默认 GPU 设备">
          <Select
            defaultValue="cuda:0"
            options={[
              { value: 'cuda:0', label: 'cuda:0 (A100-80G)' },
              { value: 'cuda:1', label: 'cuda:1 (A100-80G)' },
              { value: 'cpu', label: 'CPU（仅调试）' },
            ]}
          />
        </Form.Item>
        <Form.Item label="自动保存间隔（秒）">
          <InputNumber min={10} max={600} defaultValue={60} style={{ width: 200 }} />
        </Form.Item>
        <Divider />
        <Space>
          <Switch defaultChecked />
          <Text>启用实验性功能（多智能体协作）</Text>
        </Space>
      </Form>
    </Card>
  )

  return (
    <PageContainer
      title="系统配置"
      breadcrumb={[{ title: '首页' }, { title: '系统配置' }]}
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { reset(); message.info('已恢复默认 RAG 配置') }}
          >
            重置 RAG
          </Button>
        </Space>
      }
    >
      <Card className="rap-card-shadow" variant="borderless">
        <Tabs
          defaultActiveKey="llm"
          items={[
            {
              key: 'llm',
              label: <span><ApiOutlined /> LLM 配置</span>,
              children: LLMTab,
            },
            {
              key: 'rag',
              label: <span><DatabaseOutlined /> RAG 配置</span>,
              children: RAGTab,
            },
            {
              key: 'discipline',
              label: <span><ExperimentOutlined /> 学科适配器</span>,
              children: DisciplineTab,
            },
            {
              key: 'general',
              label: <span><SettingOutlined /> 通用</span>,
              children: GeneralTab,
            },
          ]}
        />
      </Card>
    </PageContainer>
  )
}

export default Config
