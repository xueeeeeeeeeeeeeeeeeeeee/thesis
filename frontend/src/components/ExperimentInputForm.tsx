import React, { useEffect, useMemo, useState } from 'react'
import {
  Input,
  Button,
  Space,
  Typography,
  Divider,
  Alert,
  Collapse,
  InputNumber,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import type { ExperimentFormData, ExperimentFormMetric } from '@/types'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface ExperimentInputFormProps {
  /** design 阶段产出的实验设计方案，作为预填参考（只读展示 + 预填 methodology） */
  experimentDesign?: Record<string, unknown>
  /** 已有数据回显（如用户之前填过） */
  initialData?: Partial<ExperimentFormData>
  /** 提交回调 */
  onSubmit: (data: ExperimentFormData) => void
  /** 取消回调（可选） */
  onCancel?: () => void
  /** 提交中状态 */
  submitting?: boolean
}

/** 空指标行 */
const emptyMetric = (): ExperimentFormMetric => ({ name: '', value: '', unit: '', note: '' })

/**
 * 实验内容与结果输入表单（跨学科通用）。
 *
 * 字段：方法 / 材料 / 步骤 / 指标表(动态) / 结果描述 / 原始日志 / 备注。
 * 适配 CS（accuracy/F1）、化学（产率/%）、生物（表达量/倍）、社科（相关系数）等。
 */
const ExperimentInputForm: React.FC<ExperimentInputFormProps> = ({
  experimentDesign,
  initialData,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  // 把 design 阶段产出预填到 methodology（method/plan/hypothesis 拼接）
  const designPrefill = useMemo(() => {
    if (!experimentDesign || typeof experimentDesign !== 'object') return ''
    const d = experimentDesign as Record<string, unknown>
    const parts: string[] = []
    if (typeof d.method === 'string' && d.method.trim()) parts.push(`方法：${d.method.trim()}`)
    if (typeof d.hypothesis === 'string' && d.hypothesis.trim()) parts.push(`假设：${d.hypothesis.trim()}`)
    if (typeof d.plan === 'string' && d.plan.trim()) parts.push(`方案：${d.plan.trim()}`)
    if (typeof d.dataset === 'string' && d.dataset.trim()) parts.push(`数据/材料：${d.dataset.trim()}`)
    return parts.join('\n')
  }, [experimentDesign])

  const [methodology, setMethodology] = useState('')
  const [materials, setMaterials] = useState('')
  const [procedure, setProcedure] = useState('')
  const [metrics, setMetrics] = useState<ExperimentFormMetric[]>([emptyMetric()])
  const [resultsDescription, setResultsDescription] = useState('')
  const [rawLogs, setRawLogs] = useState('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState(false)

  // 初始化：优先用 initialData，否则用 designPrefill 预填 methodology
  useEffect(() => {
    if (initialData && (initialData.methodology || initialData.resultsDescription)) {
      setMethodology(initialData.methodology ?? '')
      setMaterials(initialData.materials ?? '')
      setProcedure(initialData.procedure ?? '')
      const initMetrics = Array.isArray(initialData.metrics) && initialData.metrics.length > 0
        ? initialData.metrics.map((m) => ({ name: m.name ?? '', value: String(m.value ?? ''), unit: m.unit ?? '', note: m.note ?? '' }))
        : [emptyMetric()]
      setMetrics(initMetrics)
      setResultsDescription(initialData.resultsDescription ?? '')
      setRawLogs(initialData.rawLogs ?? '')
      setNotes(initialData.notes ?? '')
    } else if (designPrefill) {
      setMethodology(designPrefill)
    }
  }, [initialData, designPrefill])

  // 校验：方法与结果描述必填
  const methodologyErr = touched && !methodology.trim() ? '请填写实验方法' : ''
  const resultsErr = touched && !resultsDescription.trim() ? '请填写结果描述' : ''

  const updateMetric = (idx: number, field: keyof ExperimentFormMetric, val: string) => {
    setMetrics((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m)))
  }
  const addMetric = () => setMetrics((prev) => [...prev, emptyMetric()])
  const removeMetric = (idx: number) => setMetrics((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = () => {
    setTouched(true)
    if (!methodology.trim() || !resultsDescription.trim()) return
    const data: ExperimentFormData = {
      source: 'user',
      methodology: methodology.trim(),
      materials: materials.trim(),
      procedure: procedure.trim(),
      metrics: metrics
        .filter((m) => m.name.trim() || m.value.trim())
        .map((m) => ({
          name: m.name.trim(),
          value: m.value.trim(),
          unit: m.unit?.trim() || undefined,
          note: m.note?.trim() || undefined,
        })),
      resultsDescription: resultsDescription.trim(),
      rawLogs: rawLogs.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    onSubmit(data)
  }

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 13 }
  const requiredMark = <Text type="danger">*</Text>

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {designPrefill && (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message='实验设计方案（来自 design 阶段，已预填到「实验方法」，可修改）'
          description={
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {designPrefill}
            </Paragraph>
          }
        />
      )}

      <div>
        <Text strong style={labelStyle}>
          实验方法 / 设计 {requiredMark}
        </Text>
        <TextArea
          value={methodology}
          onChange={(e) => setMethodology(e.target.value)}
          rows={3}
          placeholder='描述实验采用的方法论。例如：CS 填「基于 ResNet 的图像分类训练」；生物填「CRISPR-Cas9 基因敲除实验」；社科填「500 人问卷调查 + 多元回归分析」'
          style={{ fontSize: 13 }}
          status={methodologyErr ? 'error' : undefined}
        />
        {methodologyErr && <Text type="danger" style={{ fontSize: 12 }}>{methodologyErr}</Text>}
      </div>

      <div>
        <Text strong style={labelStyle}>实验材料 / 数据来源</Text>
        <TextArea
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          rows={2}
          placeholder="数据集 / 试剂 / 样本 / 被试 / 文献语料等。例如：ImageNet 1.2k 类；HEK293 细胞 3 组重复；500 份有效问卷"
          style={{ fontSize: 13 }}
        />
      </div>

      <div>
        <Text strong style={labelStyle}>实验步骤 / 过程</Text>
        <TextArea
          value={procedure}
          onChange={(e) => setProcedure(e.target.value)}
          rows={3}
          placeholder="可有序号或自由文本描述实验流程。例如：1. 数据预处理  2. 模型训练（epoch=50, lr=1e-3）  3. 在测试集评估"
          style={{ fontSize: 13 }}
        />
      </div>

      <div>
        <Text strong style={labelStyle}>
          <ExperimentOutlined style={{ marginRight: 6 }} />
          实验指标（通用，适配各学科）
        </Text>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          点击"+"添加指标行。CS 填 accuracy=95/%；化学填产率=82/%；生物填表达量=2.3/倍；社科填相关系数=0.65/无
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {metrics.map((m, idx) => (
            <div
              key={idx}
              style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 1.4fr auto', gap: 8, alignItems: 'center' }}
            >
              <Input
                value={m.name}
                onChange={(e) => updateMetric(idx, 'name', e.target.value)}
                placeholder="指标名 (accuracy/产率/相关系数)"
                size="small"
                style={{ fontSize: 13 }}
              />
              <Input
                value={m.value}
                onChange={(e) => updateMetric(idx, 'value', e.target.value)}
                placeholder="值 (95 / 82 / 0.65)"
                size="small"
                style={{ fontSize: 13 }}
              />
              <Input
                value={m.unit ?? ''}
                onChange={(e) => updateMetric(idx, 'unit', e.target.value)}
                placeholder="单位 (%/倍/无)"
                size="small"
                style={{ fontSize: 13 }}
              />
              <Input
                value={m.note ?? ''}
                onChange={(e) => updateMetric(idx, 'note', e.target.value)}
                placeholder="备注 (测试集/置信区间/显著性)"
                size="small"
                style={{ fontSize: 13 }}
              />
              <Tooltip title="删除该指标">
                <Button
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => removeMetric(idx)}
                  disabled={metrics.length === 1}
                />
              </Tooltip>
            </div>
          ))}
        </div>
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addMetric}
          style={{ marginTop: 8 }}
        >
          添加指标
        </Button>
      </div>

      <div>
        <Text strong style={labelStyle}>
          结果描述 {requiredMark}
        </Text>
        <TextArea
          value={resultsDescription}
          onChange={(e) => setResultsDescription(e.target.value)}
          rows={4}
          placeholder='用文字描述实验结果：关键发现、图表说明、现象描述等。例如：模型在测试集达到 95% 准确率，相比 baseline 提升 3.2pp；误差分析显示在类别 X 上表现较差'
          style={{ fontSize: 13 }}
          status={resultsErr ? 'error' : undefined}
        />
        {resultsErr && <Text type="danger" style={{ fontSize: 12 }}>{resultsErr}</Text>}
      </div>

      <Collapse
        size="small"
        items={[
          {
            key: 'optional',
            label: '可选项：原始日志 / 备注',
            children: (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <Text style={labelStyle}>原始日志 / 记录</Text>
                  <TextArea
                    value={rawLogs}
                    onChange={(e) => setRawLogs(e.target.value)}
                    rows={3}
                    placeholder="代码运行日志、实验观测记录等（可选）"
                    style={{ fontSize: 12 }}
                  />
                </div>
                <div>
                  <Text style={labelStyle}>其他备注</Text>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="其他需要说明的信息（可选）"
                    style={{ fontSize: 12 }}
                  />
                </div>
              </Space>
            ),
          },
        ]}
      />

      <Divider style={{ margin: '4px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && (
          <Button onClick={onCancel} disabled={submitting}>
            取消
          </Button>
        )}
        <Button
          type="primary"
          onClick={handleSubmit}
          loading={submitting}
          icon={<ExperimentOutlined />}
        >
          提交实验结果
        </Button>
      </div>
    </Space>
  )
}

export default ExperimentInputForm
