import { describe, it, expect, beforeEach, vi } from 'vitest'

// axios 拦截器测试：mock axios 模块，验证 token 注入、响应解包、401 处理
// 注意：vi.mock 会被 hoist 到文件顶部，mock 工厂中引用的变量必须用 vi.hoisted 包装

const { mockAxios } = vi.hoisted(() => {
  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return { mockAxios }
})

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxios),
  },
}))

vi.mock('antd', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

import * as antd from 'antd'
import {
  setUnauthorizedHandler,
  get,
  post,
  put,
  patch,
  del,
  default as request,
} from './request'

// 在模块加载后立即取出拦截器 handler（避免被 clearAllMocks 清除）
const reqUse = mockAxios.interceptors.request.use as ReturnType<typeof vi.fn>
const resUse = mockAxios.interceptors.response.use as ReturnType<typeof vi.fn>

const getInterceptors = () => ({
  reqFulfilled: reqUse.mock.calls[0]?.[0] as (config: any) => any,
  reqRejected: reqUse.mock.calls[0]?.[1] as (e: any) => any,
  resFulfilled: resUse.mock.calls[0]?.[0] as (response: any) => any,
  resRejected: resUse.mock.calls[0]?.[1] as (e: any) => any,
})

beforeEach(() => {
  // 不 clearAllMocks，避免清除拦截器注册记录；仅 reset 方法 mock 与 localStorage
  mockAxios.get.mockClear()
  mockAxios.post.mockClear()
  mockAxios.put.mockClear()
  mockAxios.patch.mockClear()
  mockAxios.delete.mockClear()
  ;(antd.message as any).error.mockClear()
  localStorage.clear()
})

describe('services/request', () => {
  describe('请求拦截器', () => {
    it('localStorage 有 rap_token 时附加 Authorization header', () => {
      localStorage.setItem('rap_token', 'fake-token-123')
      const { reqFulfilled } = getInterceptors()
      const config = { headers: {} }
      const result = reqFulfilled(config)
      expect(result.headers.Authorization).toBe('Bearer fake-token-123')
    })

    it('localStorage 无 rap_token 时不附加 Authorization', () => {
      const { reqFulfilled } = getInterceptors()
      const config = { headers: {} }
      const result = reqFulfilled(config)
      expect(result.headers.Authorization).toBeUndefined()
    })

    it('请求拦截器 reject 时透传错误', async () => {
      const { reqRejected } = getInterceptors()
      const err = new Error('req error')
      await expect(reqRejected(err)).rejects.toBe(err)
    })
  })

  describe('响应拦截器', () => {
    it('成功时返回 response.data', () => {
      const { resFulfilled } = getInterceptors()
      const response = { data: { code: 0, data: { id: 1 }, message: 'ok' } }
      const result = resFulfilled(response)
      expect(result).toEqual(response.data)
    })

    it('401 时清除 rap_token/rap_user 并调用 onUnauthorized handler', async () => {
      localStorage.setItem('rap_token', 'fake')
      localStorage.setItem('rap_user', JSON.stringify({ id: 'u1' }))
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      const { resRejected } = getInterceptors()
      const err = {
        response: { status: 401, data: { message: 'unauthorized' } },
      }
      await expect(resRejected(err)).rejects.toBe(err)
      expect(localStorage.getItem('rap_token')).toBeNull()
      expect(localStorage.getItem('rap_user')).toBeNull()
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('401 时无 handler 则跳转到 /login（非 /login 路径下）', async () => {
      setUnauthorizedHandler(null)
      const hrefSetter = vi.fn()
      let storedHref = ''
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          pathname: '/projects',
          href: storedHref,
          set href(v: string) {
            storedHref = v
            hrefSetter(v)
          },
          get href() {
            return storedHref
          },
        },
      })
      const { resRejected } = getInterceptors()
      const err = { response: { status: 401, data: {} } }
      await expect(resRejected(err)).rejects.toBe(err)
      expect(hrefSetter).toHaveBeenCalledWith('/login')
    })

    it('非 401 业务错误时调用 message.error 并 reject', async () => {
      const { resRejected } = getInterceptors()
      const err = {
        response: { status: 500, data: { message: '服务器错误' } },
      }
      await expect(resRejected(err)).rejects.toBe(err)
      expect((antd.message as any).error).toHaveBeenCalledWith('服务器错误')
    })

    it('无 response 但有 request 时提示网络异常', async () => {
      const { resRejected } = getInterceptors()
      const err = { request: {}, message: 'Network Error' }
      await expect(resRejected(err)).rejects.toBe(err)
      expect((antd.message as any).error).toHaveBeenCalledWith('网络异常，后端服务可能未启动')
    })

    it('既无 response 也无 request 时提示 error.message', async () => {
      const { resRejected } = getInterceptors()
      const err = { message: '未知配置错误' }
      await expect(resRejected(err)).rejects.toBe(err)
      expect((antd.message as any).error).toHaveBeenCalledWith('未知配置错误')
    })
  })

  describe('setUnauthorizedHandler', () => {
    it('注入 handler 后再清空（传 null），401 时不再调用旧 handler', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      setUnauthorizedHandler(null)
      const { resRejected } = getInterceptors()
      const err = { response: { status: 401, data: {} } }
      await expect(resRejected(err)).rejects.toBe(err)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('HTTP 方法封装', () => {
    it('get 调用 request.get', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: 'ok' })
      await get('/foo')
      expect(mockAxios.get).toHaveBeenCalledWith('/foo', undefined)
    })

    it('post 调用 request.post', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: 'ok' })
      await post('/foo', { a: 1 })
      expect(mockAxios.post).toHaveBeenCalledWith('/foo', { a: 1 }, undefined)
    })

    it('put 调用 request.put', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: 'ok' })
      await put('/foo', { a: 1 })
      expect(mockAxios.put).toHaveBeenCalledWith('/foo', { a: 1 }, undefined)
    })

    it('patch 调用 request.patch', async () => {
      mockAxios.patch.mockResolvedValueOnce({ data: 'ok' })
      await patch('/foo', { a: 1 })
      expect(mockAxios.patch).toHaveBeenCalledWith('/foo', { a: 1 }, undefined)
    })

    it('del 调用 request.delete', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: 'ok' })
      await del('/foo')
      expect(mockAxios.delete).toHaveBeenCalledWith('/foo', undefined)
    })

    it('default 导出是 axios 实例', () => {
      expect(request).toBe(mockAxios)
    })
  })
})
