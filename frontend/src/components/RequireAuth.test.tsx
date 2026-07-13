import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import RequireAuth from './RequireAuth'
import { useAuthStore } from '@/store/authStore'

// RequireAuth 测试：未初始化、无 token、有 token 三种状态
// mock react-router-dom 的 Navigate 与 useLocation

vi.mock('react-router-dom', () => ({
  Navigate: ({ to, state, replace }: any) => (
    <div data-testid="navigate" data-to={to} data-replace={String(replace)} data-state={JSON.stringify(state)} />
  ),
  useLocation: () => ({ pathname: '/projects', search: '', hash: '', state: null, key: 'default' }),
}))

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, loading: false, initialized: false }, true)
})

describe('components/RequireAuth', () => {
  it('!initialized 时渲染 Spin（正在加载）', () => {
    useAuthStore.setState({ initialized: false })
    const { container, queryByTestId } = render(
      <RequireAuth>
        <div>children</div>
      </RequireAuth>,
    )
    expect(queryByTestId('navigate')).toBeNull()
    // Spin 渲染会包含 .ant-spin 类
    expect(container.querySelector('.ant-spin')).not.toBeNull()
  })

  it('!token 时渲染 Navigate to="/login"', () => {
    useAuthStore.setState({ initialized: true, token: null })
    const { getByTestId, queryByText } = render(
      <RequireAuth>
        <div>children</div>
      </RequireAuth>,
    )
    const nav = getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/login')
    expect(nav.getAttribute('data-replace')).toBe('true')
    expect(queryByText('children')).toBeNull()
  })

  it('有 token 且 initialized 时渲染 children', () => {
    useAuthStore.setState({ initialized: true, token: 'fake-token' })
    const { getByText, queryByTestId } = render(
      <RequireAuth>
        <div>protected content</div>
      </RequireAuth>,
    )
    expect(getByText('protected content')).toBeInTheDocument()
    expect(queryByTestId('navigate')).toBeNull()
  })

  it('Navigate 携带 state.from 来源路径', () => {
    useAuthStore.setState({ initialized: true, token: null })
    const { getByTestId } = render(
      <RequireAuth>
        <div>x</div>
      </RequireAuth>,
    )
    const nav = getByTestId('navigate')
    const state = JSON.parse(nav.getAttribute('data-state') || '{}')
    expect(state.from.pathname).toBe('/projects')
  })
})
