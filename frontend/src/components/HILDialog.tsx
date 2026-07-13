import React, { useEffect, useState } from 'react'
import { Modal, Typography, Tag, Space, Input, Button, Divider, Alert } from 'antd'
import {
  CheckOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { getStage } from '@/constants'
import type { StageKey, ExperimentFormData } from '@/types'
import ExperimentInputForm from './ExperimentInputForm'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface HILDialogProps {
  open: boolean
  stage: StageKey | null
  message: string
  agentProposal: string
  /** experiment 阶段附带的实验设计方案（来自 design 阶段），供表单预填 */
  experimentDesign?: Record<string, unknown>
  /** HIL 标题（来自 LLM 服务） */
  title?: string
  onConfirm: (text: string) => void
  onEdit: (text: string) => void
  /** experiment 阶段：用户填表单提交实验结果 */
  onEditExperiment?: (data: ExperimentFormData) => void
  onRollback: () => void
  onAbort: () => void
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
  title,
  onConfirm,
  onEdit,
  onEditExperiment,
  onRollback,
  onAbort,
  submitting = false,
}) => {
  const [editText, setEditText] = useState(agentProposal)
  const [dirty, setDirty] = useState(false)

  // 每次打开时重置编辑内容
  useEffect(() => {
    if (open) {
      setEditText(agentProposal)
      setDirty(false)
    }
  }, [open, agentProposal])

  const stageMeta = stage ? getStage(stage) : null
  const isExperiment = stage === 'experiment'
  const dialogTitle = title || (stageMeta ? `HIL 审阅：${stageMeta.label}` : 'HIL 审阅')

  // experiment 阶段：渲染结构化表单
  if (isExperiment) {
    return (
      <Modal
        open={open}
        title={dialogTitle}
        width={880}
        maskClosable={false}
        footer={null}
        onCancel={(e) => e.stopPropagation()}
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

  // 其他阶段：保持通用 TextArea UI
  return (
    <Modal
      open={open}
      title={dialogTitle}
      width={720}
      maskClosable={false}
      footer={null}
      onCancel={(e) => {
        e.stopPropagation()
      }}
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
          <Button icon={<StopOutlined />} danger onClick={onAbort}>
            中止
          </Button>
          <Button
            icon={<RollbackOutlined />}
            style={{ borderColor: '#d97706', color: '#d97706' }}
            onClick={onRollback}
          >
            回滚
          </Button>
          <Button
            icon={<EditOutlined />}
            style={{ borderColor: '#16a34a', color: '#16a34a' }}
            onClick={() => onEdit(editText)}
          >
            编辑确认
          </Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => onConfirm(editText)}>
            通过
          </Button>
        </div>
      </Space>
    </Modal>
  )
}

export default HILDialog
