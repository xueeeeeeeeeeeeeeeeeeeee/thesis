import { create } from 'zustand'
import type { SafeUser, RegisterInput } from '@/types'
import {
  loginApi,
  registerApi,
  getMeApi,
  logoutApi,
} from '@/services/auth'
import { setUnauthorizedHandler } from '@/services/request'

const TOKEN_KEY = 'rap_token'
const USER_KEY = 'rap_user'

// 从 localStorage 读取用户
const loadUser = (): SafeUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as SafeUser) : null
  } catch {
    return null
  }
}

interface AuthState {
  user: SafeUser | null
  token: string | null
  loading: boolean
  initialized: boolean // 应用启动时是否已尝试恢复会话
  login: (email: string, password: string) => Promise<boolean>
  register: (data: RegisterInput) => Promise<boolean>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  updateUser: (patch: Partial<SafeUser>) => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadUser(),
  token: localStorage.getItem(TOKEN_KEY),
  loading: false,
  initialized: false,

  login: async (email, password) => {
    set({ loading: true })
    try {
      const res = await loginApi({ email, password })
      if (res && res.code === 0 && res.data) {
        const { token, user } = res.data
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        set({ token, user, loading: false })
        return true
      }
      set({ loading: false })
      return false
    } catch {
      set({ loading: false })
      return false
    }
  },

  register: async (data) => {
    set({ loading: true })
    try {
      const res = await registerApi(data)
      if (res && res.code === 0 && res.data) {
        const { token, user } = res.data
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        set({ token, user, loading: false })
        return true
      }
      set({ loading: false })
      return false
    } catch {
      set({ loading: false })
      return false
    }
  },

  logout: async () => {
    // best effort 调用后端登出
    try {
      await logoutApi()
    } catch {
      // 忽略后端错误
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null })
  },

  fetchMe: async () => {
    const token = get().token
    if (!token) return
    try {
      const res = await getMeApi()
      if (res && res.code === 0 && res.data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
        set({ user: res.data.user })
      }
    } catch {
      // token 无效，清空本地状态
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      set({ token: null, user: null })
    }
  },

  updateUser: (patch) => {
    const current = get().user
    if (!current) return
    const next = { ...current, ...patch }
    localStorage.setItem(USER_KEY, JSON.stringify(next))
    set({ user: next })
  },

  initialize: async () => {
    // 注入 401 回调：清空 state（跳转由 RequireAuth/路由处理）
    setUnauthorizedHandler(() => {
      set({ token: null, user: null })
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    })

    const token = get().token
    if (token) {
      await get().fetchMe()
    }
    set({ initialized: true })
  },
}))
