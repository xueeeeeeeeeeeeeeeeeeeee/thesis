import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  List,
  Tag,
  Typography,
  Space,
  Button,
  Empty,
  Row,
  Col,
  Tabs,
  Progress,
  Statistic,
  Tooltip,
  Badge,
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CodeOutlined,
  LineChartOutlined,
  AlertOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import StatusDot from '@/components/StatusDot'
import { useProjectStore } from '@/store/projectStore'
import { wsClient } from '@/services/ws'
import { EXPERIMENT_STATUS_MAP } from '@/constants'
import type { Experiment } from '@/types'

const { Text, Paragraph } = Typography

// 实验 mock 数据
const mockExperiments: Experiment[] = [
  {
    id: 'exp-023',
    projectId: 'p1',
    name: 'LoRA 微调 Qwen2-7B (rank=16)',
    status: 'running',
    startedAt: '2026-06-28T08:00:00Z',
    code: `import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, TrainingArguments

model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2-7B-Instruct")
lora_config = LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.05,
    target_modules=["q_proj", "v_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora_config)
trainer.train()  # epoch=3, lr=2e-4, batch=16`,
    logs: [
      '[2026-06-28 08:00:12] INFO 加载基座模型 Qwen2-7B-Instruct',
      '[2026-06-28 08:00:45] INFO 应用 LoRA 适配器，可训练参数: 19,884,032 (0.27%)',
      '[2026-06-28 08:01:20] INFO 数据集加载完成，训练集 8192 条',
      '[2026-06-28 08:02:00] INFO Epoch 1/3 开始',
      '[2026-06-28 08:35:11] INFO step=500, loss=0.612, lr=1.95e-4',
      '[2026-06-28 09:10:33] WARN step=1000, loss=0.481, 显存占用 78%',
      '[2026-06-28 09:45:01] INFO Epoch 1/3 完成，验证集 BLEU=38.9',
      '[2026-06-28 09:46:00] INFO Epoch 2/3 开始',
      '[2026-06-28 10:18:22] INFO step=1500, loss=0.342',
      '[2026-06-28 10:24:00] WARN 检测到评估请求，暂停训练',
    ],
    metrics: [
      { name: 'loss', value: 0.342, history: [0.91, 0.72, 0.61, 0.48, 0.41, 0.34] },
      { name: 'BLEU', value: 42.1, history: [30.2, 33.5, 35.8, 38.9, 40.2, 42.1] },
      { name: 'ROUGE-L', value: 38.9, history: [25.1, 28.4, 31.2, 35.2, 37.1, 38.9] },
    ],
    resources: { cpu: 64, memory: 32768, gpu: 78 },
  },
  {
    id: 'exp-022',
    projectId: 'p1',
    name: '基线：全参数微调 Qwen2-7B',
    status: 'completed',
    startedAt: '2026-06-27T14:00:00Z',
    finishedAt: '2026-06-27T17:30:00Z',
    code: '# 全参数微调基线实验\ntrainer = Trainer(model=model, args=TrainingArguments(...))\ntrainer.train()',
    logs: [
      '[2026-06-27 14:00:00] INFO 启动基线实验',
      '[2026-06-27 17:25:00] INFO 训练完成',
      '[2026-06-27 17:30:00] INFO 验证集 BLEU=38.7',
    ],
    metrics: [
      { name: 'loss', value: 0.31, history: [0.95, 0.7, 0.55, 0.42, 0.35, 0.31] },
      { name: 'BLEU', value: 38.7, history: [28.1, 31.2, 34.1, 36.5, 37.8, 38.7] },
    ],
    resources: { cpu: 80, memory: 40960, gpu: 95 },
  },
  {
    id: 'exp-024',
    projectId: 'p1',
    name: 'RAG 消融实验（无 reranker）',
    status: 'queued',
    startedAt: '',
    code: '# 消融：关闭 reranker\nretriever = Retriever(use_reranker=False)',
    logs: ['[2026-06-28 10:00:00] INFO 实验已加入队列，等待 GPU 资源'],
    metrics: [],
    resources: { cpu: 0, memory: 0, gpu: 0 },
  },
  {
    id: 'exp-019',
    projectId: 'p1',
    name: '嵌入模型对比：bge-m3 vs e5',
    status: 'failed',
    startedAt: '2026-06-26T09:00:00Z',
    finishedAt: '2026-06-26T09:12:00Z',
    code: '# 对比嵌入模型',
    logs: [
      '[2026-06-26 09:00:00] INFO 启动嵌入对比',
      '[2026-06-26 09:12:00] ERROR CUDA out of memory',
    ],
    metrics: [],
    resources: { cpu: 0, memory: 0, gpu: 0 },
  },
]

const ExperimentPage: React.FC = () => {
  const { currentProject } = useProjectStore()
  const [selectedId, setSelectedId] = useState<string>(mockExperiments[0].id)
  const [wsConnected, setWsConnected] = useState(false)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const experiments = currentProject
    ? mockExperiments.filter((e) => e.projectId === currentProject.id)
    : mockExperiments
  const selected = experiments.find((e) => e.id === selectedId) ?? experiments[0]

  // WebSocket 实时日志（占位演示，无后端时不报错）
  useEffect(() => {
    if (!selected || selected.status !== 'running') return
    const off = wsClient.on('log', (data) => {
      if (typeof data === 'string') {
        setLiveLog((prev) => [...prev, data])
      }
    })
    return () => {
      off()
    }
  }, [selectedId, selected])

  // 自动滚动到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [selected?.logs.length])

  const renderChart = (history: number[], color: string) => {
    const max = Math.max(...history, 1)
    return (
      <div className="rap-placeholder-chart">
        {history.map((v, i) => (
          <span
            key={i}
            style={{
              height: `${(v / max) * 100}%`,
              background: `linear-gradient(180deg, ${color} 0%, ${color}88 100%)`,
            }}
            title={`step ${i + 1}: ${v}`}
          />
        ))}
      </div>
    )
  }

  return (
    <PageContainer
      title="实验监控"
      breadcrumb={[{ title: '首页' }, { title: '实验监控' }]}
      extra={
        <Space>
          <StatusDot
            color={wsConnected ? 'green' : 'gray'}
            text={wsConnected ? 'WS 已连接' : 'WS 未连接'}
          />
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => {
              try {
                wsClient.connect()
                setWsConnected(true)
              } catch {
                setWsConnected(false)
              }
            }}
          >
            连接实时日志
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        {/* 左侧：实验列表 */}
        <Col xs={24} lg={8}>
          <Card
            title={<span><LineChartOutlined /> 实验列表</span>}
            className="rap-card-shadow"
            variant="borderless"
            style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}
          >
            {experiments.length === 0 ? (
              <Empty description="当前项目暂无实验" />
            ) : (
              <List
                dataSource={experiments}
                renderItem={(item: Experiment) => {
                  const m = EXPERIMENT_STATUS_MAP[item.status]
                  const active = item.id === selectedId
                  return (
                    <List.Item
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        cursor: 'pointer',
                        padding: '10px 12px',
                        background: active ? '#eff6ff' : 'transparent',
                        border: `1px solid ${active ? '#bfdbfe' : '#f1f5f9'}`,
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 13 }}>{item.id}</Text>
                          <StatusDot
                            color={
                              item.status === 'running' ? 'green' :
                              item.status === 'queued' ? 'yellow' :
                              item.status === 'completed' ? 'blue' :
                              item.status === 'failed' ? 'red' : 'gray'
                            }
                            text={m.label}
                            pulse={item.status === 'running'}
                          />
                        </div>
                        <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                          {item.name}
                        </Text>
                        {item.startedAt && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {dayjs(item.startedAt).format('MM-DD HH:mm')}
                          </Text>
                        )}
                      </div>
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

        {/* 右侧：实验详情 */}
        <Col xs={24} lg={16}>
          {!selected ? (
            <Card className="rap-card-shadow" variant="borderless">
              <Empty description="请选择一个实验" />
            </Card>
          ) : (
            <>
              {/* 顶部：实验信息 + 操作 */}
              <Card
                className="rap-card-shadow"
                variant="borderless"
                style={{ marginBottom: 16 }}
                title={`${selected.id} · ${selected.name}`}
                extra={
                  <Space>
                    {selected.status === 'running' && (
                      <>
                        <Tooltip title="暂停">
                          <Button icon={<PauseCircleOutlined />} />
                        </Tooltip>
                        <Tooltip title="终止">
                          <Button danger icon={<StopOutlined />} />
                        </Tooltip>
                      </>
                    )}
                    {(selected.status === 'failed' || selected.status === 'completed') && (
                      <Tooltip title="重新运行">
                        <Button icon={<ReloadOutlined />} />
                      </Tooltip>
                    )}
                  </Space>
                }
              >
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="状态"
                      value={EXPERIMENT_STATUS_MAP[selected.status].label}
                      valueStyle={{ color: EXPERIMENT_STATUS_MAP[selected.status].color, fontSize: 16 }}
                    />
                  </Col>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>开始时间</Text>
                    <div><Text>{selected.startedAt ? dayjs(selected.startedAt).format('YYYY-MM-DD HH:mm') : '—'}</Text></div>
                  </Col>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>结束时间</Text>
                    <div><Text>{selected.finishedAt ? dayjs(selected.finishedAt).format('YYYY-MM-DD HH:mm') : '—'}</Text></div>
                  </Col>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>实验 ID</Text>
                    <div><Text className="rap-mono">{selected.id}</Text></div>
                  </Col>
                </Row>
              </Card>

              {/* 资源占用 */}
              {selected.status !== 'queued' && (
                <Card
                  title="资源占用"
                  className="rap-card-shadow"
                  variant="borderless"
                  style={{ marginBottom: 16 }}
                >
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 12 }}>CPU</Text>
                      <Progress percent={selected.resources.cpu} size="small" strokeColor="#2563eb" />
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 12 }}>显存 (GPU)</Text>
                      <Progress percent={selected.resources.gpu} size="small" strokeColor="#16a34a" />
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 12 }}>内存</Text>
                      <Progress
                        percent={Math.round((selected.resources.memory / 49152) * 100)}
                        size="small"
                        strokeColor="#ca8a04"
                        format={() => `${(selected.resources.memory / 1024).toFixed(1)} GB`}
                      />
                    </Col>
                  </Row>
                </Card>
              )}

              {/* Tab：代码 / 日志 / 指标 */}
              <Card className="rap-card-shadow" variant="borderless">
                <Tabs
                  defaultActiveKey="logs"
                  items={[
                    {
                      key: 'code',
                      label: <span><CodeOutlined /> 代码</span>,
                      children: (
                        <pre className="rap-code-block">{selected.code}</pre>
                      ),
                    },
                    {
                      key: 'logs',
                      label: <span><AlertOutlined /> 实时日志 {selected.status === 'running' && <Badge color="green" />}</span>,
                      children: (
                        <div
                          ref={logRef}
                          style={{
                            background: '#0f172a',
                            padding: 12,
                            borderRadius: 8,
                            maxHeight: 280,
                            overflow: 'auto',
                          }}
                        >
                          {selected.logs.map((log, i) => {
                            const cls = log.includes('ERROR')
                              ? 'error'
                              : log.includes('WARN')
                                ? 'warn'
                                : log.includes('INFO')
                                  ? 'info'
                                  : ''
                            return (
                              <div key={i} className={`rap-log-line ${cls}`}>
                                {log}
                              </div>
                            )
                          })}
                          {liveLog.map((log, i) => (
                            <div key={`live-${i}`} className="rap-log-line info">
                              {log}
                            </div>
                          ))}
                          {selected.status === 'running' && (
                            <div className="rap-log-line info">
                              <span style={{ animation: 'rap-pulse 1s infinite' }}>▌</span> 等待输出...
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'metrics',
                      label: <span><LineChartOutlined /> 指标图表</span>,
                      children:
                        selected.metrics.length === 0 ? (
                          <Empty description="暂无指标数据" />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {selected.metrics.map((m) => (
                              <Col xs={24} sm={12} key={m.name}>
                                <Card
                                  size="small"
                                  title={
                                    <Space>
                                      <Text strong>{m.name}</Text>
                                      <Tag color="blue">当前: {m.value}</Tag>
                                    </Space>
                                  }
                                >
                                  {renderChart(
                                    m.history,
                                    m.name === 'loss' ? '#dc2626' : '#16a34a',
                                  )}
                                  <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                                    共 {m.history.length} 个数据点 · 范围 [{Math.min(...m.history)}, {Math.max(...m.history)}]
                                  </Text>
                                </Card>
                              </Col>
                            ))}
                          </Row>
                        ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </Col>
      </Row>
    </PageContainer>
  )
}

export default ExperimentPage
