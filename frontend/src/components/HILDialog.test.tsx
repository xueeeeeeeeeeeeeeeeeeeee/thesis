import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HILDialog from './HILDialog'

// HILDialog 测试：experiment 阶段渲染表单、其他阶段渲染 TextArea、open 重置、dirty 提示、按钮回调

beforeEach(() => {
  vi.clearAllMocks()
})

describe('components/HILDialog', () => {
  it('experiment 阶段渲染 ExperimentInputForm（而非 TextArea）', () => {
    render(
      <HILDialog
        open={true}
        stage="experiment"
        message="请填写实验"
        agentProposal="agent 内容"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    expect(screen.getByText(/实验方法/)).toBeInTheDocument()
    expect(screen.queryByText('您的审阅 / 编辑')).toBeNull()
  })

  it('非 experiment 阶段渲染 Agent 提议 + TextArea + 4 按钮', () => {
    render(
      <HILDialog
        open={true}
        stage="design"
        message="需确认"
        agentProposal="agent-提议-正文内容"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    expect(screen.getByText('Agent 提议')).toBeInTheDocument()
    expect(screen.getByText('您的审阅 / 编辑')).toBeInTheDocument()
    // agentProposal 内容应被渲染（用 getAllByText 因为 antd Paragraph 可能渲染多层）
    expect(screen.getAllByText('agent-提议-正文内容').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /中止/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /回滚/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /编辑确认/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /通过/ })).toBeInTheDocument()
  })

  it('open 从 false 变 true 时重置 editText 和 dirty', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <HILDialog
        open={false}
        stage="design"
        message="m"
        agentProposal="initial"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    rerender(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="initial"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    const textarea = screen.getByPlaceholderText(/可在此编辑修改/) as HTMLTextAreaElement
    expect(textarea.value).toBe('initial')
    await user.clear(textarea)
    await user.type(textarea, 'modified')
    expect(screen.getByText(/检测到修改/)).toBeInTheDocument()
    // 切换 open=false → true，dirty 应被重置
    rerender(
      <HILDialog
        open={false}
        stage="design"
        message="m"
        agentProposal="initial"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    rerender(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="initial"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    expect(screen.queryByText(/检测到修改/)).toBeNull()
  })

  it('dirty 时显示提示文本（输入与 agentProposal 不同）', async () => {
    const user = userEvent.setup()
    render(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="agent 内容"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    expect(screen.queryByText(/检测到修改/)).toBeNull()
    const textarea = screen.getByPlaceholderText(/可在此编辑修改/)
    await user.type(textarea, 'x')
    expect(screen.getByText(/检测到修改/)).toBeInTheDocument()
  })

  it('onConfirm 被调用时传 editText', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="agent 内容"
        onConfirm={onConfirm}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    await user.click(screen.getByRole('button', { name: /通过/ }))
    expect(onConfirm).toHaveBeenCalledWith('agent 内容')
  })

  it('onEdit 被调用时传 editText', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="agent 内容"
        onConfirm={() => {}}
        onEdit={onEdit}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    const textarea = screen.getByPlaceholderText(/可在此编辑修改/)
    await user.clear(textarea)
    await user.type(textarea, 'user edit content')
    await user.click(screen.getByRole('button', { name: /编辑确认/ }))
    expect(onEdit).toHaveBeenCalledWith('user edit content')
  })

  it('onRollback 被调用', async () => {
    const user = userEvent.setup()
    const onRollback = vi.fn()
    render(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="a"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={onRollback}
        onAbort={() => {}}
      />,
    )
    await user.click(screen.getByRole('button', { name: /回滚/ }))
    expect(onRollback).toHaveBeenCalledTimes(1)
  })

  it('onAbort 被调用', async () => {
    const user = userEvent.setup()
    const onAbort = vi.fn()
    render(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="a"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={onAbort}
      />,
    )
    await user.click(screen.getByRole('button', { name: /中止/ }))
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('experiment 阶段也渲染中止与回滚按钮', () => {
    render(
      <HILDialog
        open={true}
        stage="experiment"
        message="m"
        agentProposal="a"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /中止/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /回滚/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /跳过/ })).toBeInTheDocument()
  })

  it('title 自定义时显示在 Modal 标题', () => {
    render(
      <HILDialog
        open={true}
        stage="design"
        message="m"
        agentProposal="a"
        title="自定义 HIL 标题"
        onConfirm={() => {}}
        onEdit={() => {}}
        onRollback={() => {}}
        onAbort={() => {}}
      />,
    )
    expect(screen.getByText('自定义 HIL 标题')).toBeInTheDocument()
  })
})
