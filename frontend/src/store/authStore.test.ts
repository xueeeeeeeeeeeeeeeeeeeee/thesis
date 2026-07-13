import { describe, it, expect, beforeEach, vi } from 'vitest'

// authStore 测试：mock services/auth 与 services/request，验证 login/register/logout/fetchMe/updateUser/initialize
vi.mock('@/services/auth', () => ({
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  getMeApi: vi.fn(),
  logoutApi: vi.fn(),
}))

vi.mock('@/services/request', () => ({
  setUnauthorizedHandler: vi.fn(),
}))

import { loginApi, registerApi, getMeApi, logoutApi } from '@/services/auth'
import { setUnauthorizedHandler } from '@/services/request'
import { useAuthStore } from './authStore'
import type { SafeUser } from '@/types'

const mkUser = (overrides: Partial<SafeUser> = {}): SafeUser => ({
  id: 'u1',
  email: 'a@b.com',
  username: 'alice',
  role: 'user',
  discipline: 'NLP',
  apiKeys: {},
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  ...overrides,
})

// 仅重置数据字段，不替换 actions
const resetState = () => {
  useAuthStore.setState({
    user: null,
    token: null,
    loading: false,
    initialized: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetState()
})

describe('store/authStore', () => {
  describe('login', () => {
    it('成功时（res.code === 0）写 localStorage 并返回 true', async () => {
      const user = mkUser()
      ;(loginApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: { token: 'tok-123', user },
      })
      const ok = await useAuthStore.getState().login('a@b.com', 'pwd')
      expect(ok).toBe(true)
      expect(localStorage.getItem('rap_token')).toBe('tok-123')
      expect(JSON.parse(localStorage.getItem('rap_user')!)).toEqual(user)
      const state = useAuthStore.getState()
      expect(state.token).toBe('tok-123')
      expect(state.user).toEqual(user)
      expect(state.loading).toBe(false)
    })

    it('失败时（res.code !== 0）不写 localStorage 并返回 false', async () => {
      ;(loginApi as any).mockResolvedValue({
        code: 1,
        message: 'invalid credentials',
        data: null,
      })
      const ok = await useAuthStore.getState().login('a@b.com', 'wrong')
      expect(ok).toBe(false)
      expect(localStorage.getItem('rap_token')).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().loading).toBe(false)
    })

    it('API 抛错时返回 false', async () => {
      ;(loginApi as any).mockRejectedValue(new Error('network'))
      const ok = await useAuthStore.getState().login('a@b.com', 'pwd')
      expect(ok).toBe(false)
      expect(useAuthStore.getState().loading).toBe(false)
    })

    it('调用 loginApi 时传入 {email, password}', async () => {
      ;(loginApi as any).mockResolvedValue({ code: 0, data: { token: 't', user: mkUser() } })
      await useAuthStore.getState().login('x@y.com', 'pw')
      expect(loginApi).toHaveBeenCalledWith({ email: 'x@y.com', password: 'pw' })
    })
  })

  describe('register', () => {
    it('成功时返回 true 并写 localStorage', async () => {
      const user = mkUser()
      ;(registerApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: { token: 'tok-r', user },
      })
      const ok = await useAuthStore.getState().register({
        email: 'a@b.com',
        username: 'alice',
        password: 'pw',
      })
      expect(ok).toBe(true)
      expect(localStorage.getItem('rap_token')).toBe('tok-r')
    })

    it('失败时返回 false', async () => {
      ;(registerApi as any).mockResolvedValue({ code: 1, data: null })
      const ok = await useAuthStore.getState().register({
        email: 'a@b.com',
        username: 'alice',
        password: 'pw',
      })
      expect(ok).toBe(false)
    })

    it('API 抛错时返回 false', async () => {
      ;(registerApi as any).mockRejectedValue(new Error('e'))
      const ok = await useAuthStore.getState().register({
        email: 'a@b.com',
        username: 'alice',
        password: 'pw',
      })
      expect(ok).toBe(false)
    })
  })

  describe('logout', () => {
    it('后端成功时也清空 state 和 localStorage', async () => {
      useAuthStore.setState({ token: 't', user: mkUser() })
      localStorage.setItem('rap_token', 't')
      localStorage.setItem('rap_user', '{}')
      ;(logoutApi as any).mockResolvedValue({ code: 0, data: { success: true } })
      await useAuthStore.getState().logout()
      expect(localStorage.getItem('rap_token')).toBeNull()
      expect(localStorage.getItem('rap_user')).toBeNull()
      expect(useAuthStore.getState().token).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('后端失败时仍清空 state 和 localStorage', async () => {
      useAuthStore.setState({ token: 't', user: mkUser() })
      localStorage.setItem('rap_token', 't')
      ;(logoutApi as any).mockRejectedValue(new Error('e'))
      await useAuthStore.getState().logout()
      expect(localStorage.getItem('rap_token')).toBeNull()
      expect(useAuthStore.getState().token).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('fetchMe', () => {
    it('无 token 时直接 return，不调用 getMeApi', async () => {
      useAuthStore.setState({ token: null })
      await useAuthStore.getState().fetchMe()
      expect(getMeApi).not.toHaveBeenCalled()
    })

    it('成功时写入 user 到 state 与 localStorage', async () => {
      useAuthStore.setState({ token: 't' })
      const user = mkUser({ username: 'bob' })
      ;(getMeApi as any).mockResolvedValue({ code: 0, data: { user } })
      await useAuthStore.getState().fetchMe()
      expect(useAuthStore.getState().user).toEqual(user)
      expect(JSON.parse(localStorage.getItem('rap_user')!)).toEqual(user)
    })

    it('API 失败时清空 state', async () => {
      useAuthStore.setState({ token: 't', user: mkUser() })
      localStorage.setItem('rap_token', 't')
      localStorage.setItem('rap_user', '{}')
      ;(getMeApi as any).mockRejectedValue(new Error('401'))
      await useAuthStore.getState().fetchMe()
      expect(useAuthStore.getState().token).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
      expect(localStorage.getItem('rap_token')).toBeNull()
      expect(localStorage.getItem('rap_user')).toBeNull()
    })

    it('API 成功但 code !== 0 时不写入 user', async () => {
      useAuthStore.setState({ token: 't' })
      ;(getMeApi as any).mockResolvedValue({ code: 1, data: null })
      await useAuthStore.getState().fetchMe()
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('updateUser', () => {
    it('浅合并并写 localStorage', () => {
      const current = mkUser({ username: 'old', discipline: 'NLP' })
      useAuthStore.setState({ user: current })
      useAuthStore.getState().updateUser({ username: 'new' })
      const state = useAuthStore.getState()
      expect(state.user?.username).toBe('new')
      expect(state.user?.discipline).toBe('NLP')
      expect(JSON.parse(localStorage.getItem('rap_user')!).username).toBe('new')
    })

    it('user 为 null 时直接 return', () => {
      useAuthStore.setState({ user: null })
      useAuthStore.getState().updateUser({ username: 'x' })
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('initialize', () => {
    it('注入 setUnauthorizedHandler', async () => {
      useAuthStore.setState({ token: null })
      await useAuthStore.getState().initialize()
      expect(setUnauthorizedHandler).toHaveBeenCalledTimes(1)
      expect(setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function))
    })

    it('有 token 时调用 fetchMe', async () => {
      useAuthStore.setState({ token: 't' })
      ;(getMeApi as any).mockResolvedValue({ code: 0, data: { user: mkUser() } })
      await useAuthStore.getState().initialize()
      expect(getMeApi).toHaveBeenCalled()
      expect(useAuthStore.getState().initialized).toBe(true)
    })

    it('无 token 时不调用 fetchMe，但 initialized 仍为 true', async () => {
      useAuthStore.setState({ token: null })
      await useAuthStore.getState().initialize()
      expect(getMeApi).not.toHaveBeenCalled()
      expect(useAuthStore.getState().initialized).toBe(true)
    })

    it('注入的 handler 调用后清空 state', async () => {
      useAuthStore.setState({ token: null })
      await useAuthStore.getState().initialize()
      const handler = (setUnauthorizedHandler as any).mock.calls.at(-1)[0] as () => void
      useAuthStore.setState({ token: 't', user: mkUser() })
      handler()
      expect(useAuthStore.getState().token).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
    })
  })
})
