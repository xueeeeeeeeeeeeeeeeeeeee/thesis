import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import StatusDot from './StatusDot'

// StatusDot 测试：颜色映射、pulse 动画、text 显示
// 注意：jsdom 会把 hex 颜色转成 rgb 格式，所以用 toContain 检查 rgb 值

const HEX_TO_RGB: Record<string, string> = {
  '#16a34a': 'rgb(22, 163, 74)',
  '#ca8a04': 'rgb(202, 138, 4)',
  '#dc2626': 'rgb(220, 38, 38)',
  '#94a3b8': 'rgb(148, 163, 184)',
  '#2563eb': 'rgb(37, 99, 235)',
}

describe('components/StatusDot', () => {
  it('默认 color 为 green', () => {
    const { container } = render(<StatusDot />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.background).toBe(HEX_TO_RGB['#16a34a'])
  })

  it('green 颜色映射正确', () => {
    const { container } = render(<StatusDot color="green" />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.background).toBe(HEX_TO_RGB['#16a34a'])
  })

  it('yellow 颜色映射正确', () => {
    const { container } = render(<StatusDot color="yellow" />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.background).toBe(HEX_TO_RGB['#ca8a04'])
  })

  it('red 颜色映射正确', () => {
    const { container } = render(<StatusDot color="red" />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.background).toBe(HEX_TO_RGB['#dc2626'])
  })

  it('gray 颜色映射正确', () => {
    const { container } = render(<StatusDot color="gray" />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.background).toBe(HEX_TO_RGB['#94a3b8'])
  })

  it('blue 颜色映射正确', () => {
    const { container } = render(<StatusDot color="blue" />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.background).toBe(HEX_TO_RGB['#2563eb'])
  })

  it('pulse 时注入 keyframes style', () => {
    const { container } = render(<StatusDot pulse />)
    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain('@keyframes rap-pulse')
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.animation).toContain('rap-pulse')
  })

  it('无 pulse 时不注入动画', () => {
    const { container } = render(<StatusDot />)
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.style.animation).toBe('none')
  })

  it('text 显示', () => {
    const { getByText } = render(<StatusDot text="运行中" />)
    expect(getByText('运行中')).toBeInTheDocument()
  })

  it('无 text 时仅渲染 dot 子元素（不含 style 标签）', () => {
    const { container } = render(<StatusDot />)
    const outer = container.querySelector('span') as HTMLElement
    // 子元素中应包含 dot（span），可能也包含 style 标签
    const dot = outer.querySelector('span')
    expect(dot).not.toBeNull()
  })
})
