import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExperimentInputForm from './ExperimentInputForm'

// ExperimentInputForm 测试：字段渲染、预填、必填校验、指标增删、提交 trim、onCancel 可选
// 注意：antd 5 的 Button 会对 2 字符中文自动加空格（"取消" → "取 消"），用 regex 匹配

beforeEach(() => {
  vi.clearAllMocks()
})

describe('components/ExperimentInputForm', () => {
  it('渲染时显示 methodology/materials/procedure/metrics/resultsDescription 字段', () => {
    render(<ExperimentInputForm onSubmit={() => {}} />)
    expect(screen.getByText(/实验方法/)).toBeInTheDocument()
    expect(screen.getByText(/实验材料/)).toBeInTheDocument()
    expect(screen.getByText(/实验步骤/)).toBeInTheDocument()
    expect(screen.getByText(/实验指标/)).toBeInTheDocument()
    expect(screen.getByText(/结果描述/)).toBeInTheDocument()
  })

  it('experimentDesign 拼接后预填到 methodology（designPrefill 逻辑）', async () => {
    const design = {
      method: 'ResNet',
      hypothesis: '深度可提升准确率',
      plan: '50 epoch',
      dataset: 'ImageNet',
    }
    render(<ExperimentInputForm experimentDesign={design} onSubmit={() => {}} />)
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/描述实验采用的方法论/) as HTMLTextAreaElement
      expect(textarea.value).toContain('方法：ResNet')
      expect(textarea.value).toContain('假设：深度可提升准确率')
      expect(textarea.value).toContain('方案：50 epoch')
      expect(textarea.value).toContain('数据/材料：ImageNet')
    })
  })

  it('initialData 优先级高于 designPrefill', async () => {
    const design = { method: 'ResNet', hypothesis: 'h', plan: 'p', dataset: 'd' }
    const initialData = {
      methodology: '已有方法',
      resultsDescription: '已有结果',
    }
    render(
      <ExperimentInputForm
        experimentDesign={design}
        initialData={initialData}
        onSubmit={() => {}}
      />,
    )
    await waitFor(() => {
      const methodTA = screen.getByPlaceholderText(/描述实验采用的方法论/) as HTMLTextAreaElement
      expect(methodTA.value).toBe('已有方法')
      const resultTA = screen.getByPlaceholderText(/用文字描述实验结果/) as HTMLTextAreaElement
      expect(resultTA.value).toBe('已有结果')
    })
  })

  it('必填校验：touched 前不显示错误，touched 后显示 methodology 错误', async () => {
    const user = userEvent.setup()
    render(<ExperimentInputForm onSubmit={() => {}} />)
    expect(screen.queryByText('请填写实验方法')).toBeNull()
    await user.click(screen.getByRole('button', { name: /提交实验结果/ }))
    expect(screen.getByText('请填写实验方法')).toBeInTheDocument()
    expect(screen.getByText('请填写结果描述')).toBeInTheDocument()
  })

  it('必填校验：仅 methodology 为空时只显示 methodology 错误', async () => {
    const user = userEvent.setup()
    render(<ExperimentInputForm onSubmit={() => {}} />)
    const resultTA = screen.getByPlaceholderText(/用文字描述实验结果/)
    await user.type(resultTA, '已填结果')
    await user.click(screen.getByRole('button', { name: /提交实验结果/ }))
    expect(screen.getByText('请填写实验方法')).toBeInTheDocument()
    expect(screen.queryByText('请填写结果描述')).toBeNull()
  })

  it('指标增删：addMetric 增加，removeMetric 删除（metrics.length > 1 时才允许）', async () => {
    const user = userEvent.setup()
    render(<ExperimentInputForm onSubmit={() => {}} />)
    const removeBtns = screen.getAllByRole('button').filter((b) =>
      b.querySelector('.anticon-delete'),
    )
    expect(removeBtns[0]).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /添加指标/ }))
    expect(screen.getAllByPlaceholderText(/指标名/)).toHaveLength(2)
    const removeBtns2 = screen.getAllByRole('button').filter((b) =>
      b.querySelector('.anticon-delete'),
    )
    expect(removeBtns2[0]).not.toBeDisabled()
    await user.click(removeBtns2[0])
    expect(screen.getAllByPlaceholderText(/指标名/)).toHaveLength(1)
  })

  it('提交时 trim 所有字段，过滤空指标行，data.source === "user"', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ExperimentInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByPlaceholderText(/描述实验采用的方法论/), '  ResNet 方法  ')
    await user.type(screen.getByPlaceholderText(/用文字描述实验结果/), '  95% 准确率  ')
    await user.click(screen.getByRole('button', { name: /提交实验结果/ }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    const data = onSubmit.mock.calls[0][0]
    expect(data.source).toBe('user')
    expect(data.methodology).toBe('ResNet 方法')
    expect(data.resultsDescription).toBe('95% 准确率')
    expect(data.metrics).toEqual([])
  })

  it('提交时保留非空指标行并 trim', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ExperimentInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByPlaceholderText(/描述实验采用的方法论/), '方法')
    await user.type(screen.getByPlaceholderText(/用文字描述实验结果/), '结果')
    const nameInput = screen.getAllByPlaceholderText(/指标名/)[0]
    const valueInput = screen.getAllByPlaceholderText(/值/)[0]
    await user.type(nameInput, '  acc  ')
    await user.type(valueInput, '  95  ')
    await user.click(screen.getByRole('button', { name: /提交实验结果/ }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
    const data = onSubmit.mock.calls[0][0]
    expect(data.metrics).toHaveLength(1)
    expect(data.metrics[0].name).toBe('acc')
    expect(data.metrics[0].value).toBe('95')
  })

  it('onCancel 不传时不渲染取消按钮', () => {
    render(<ExperimentInputForm onSubmit={() => {}} />)
    // antd Button 对 2 字符中文加空格，用 regex 匹配
    expect(screen.queryByText(/取\s*消/)).toBeNull()
  })

  it('onCancel 传入时渲染取消按钮且可触发', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ExperimentInputForm onSubmit={() => {}} onCancel={onCancel} />)
    // antd Button 对 "取消" 加空格变成 "取 消"，用 regex 匹配
    const cancelText = screen.getByText(/取\s*消/)
    await user.click(cancelText)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submitting 时禁用提交与取消按钮', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <ExperimentInputForm onSubmit={() => {}} onCancel={onCancel} submitting />,
    )
    // antd loading 不设置 disabled 属性，而是加 ant-btn-loading class
    const submitBtn = screen.getByRole('button', { name: /提交实验结果/ })
    expect(submitBtn.className).toContain('ant-btn-loading')
    // 取消按钮在 submitting 时应 disabled
    const cancelBtn = container.querySelectorAll('button')
    const cancelBtnEl = Array.from(cancelBtn).find((b) => b.textContent?.includes('取') && b.textContent?.includes('消')) as HTMLButtonElement
    expect(cancelBtnEl.disabled).toBe(true)
  })
})
