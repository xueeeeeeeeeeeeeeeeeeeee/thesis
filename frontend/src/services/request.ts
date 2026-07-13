import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { message } from 'antd'

// axios 实例，baseURL 指向 /api（由 Vite 代理转发到后端 3001）
const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 全局 401 回调钩子（由 authStore 注入，避免硬编码跳转逻辑）
let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  onUnauthorized = handler
}

// 请求拦截器：附加 token
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rap_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器：统一错误处理 + 401 自动登出
request.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response) {
      const { status, data } = error.response
      // 401：清除本地凭证并跳转登录
      if (status === 401) {
        localStorage.removeItem('rap_token')
        localStorage.removeItem('rap_user')
        if (onUnauthorized) {
          onUnauthorized()
        } else if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
      const msg = data?.message || `请求失败（${status}）`
      // 401 时不再重复 toast，避免与跳转叠加
      if (status !== 401) {
        message.error(msg)
      }
    } else if (error.request) {
      message.error('网络异常，后端服务可能未启动')
    } else {
      message.error(error.message || '未知错误')
    }
    return Promise.reject(error)
  },
)

// 通用 GET
export const get = <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  request.get(url, config)

// 通用 POST
export const post = <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> => request.post(url, data, config)

// 通用 PUT
export const put = <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> => request.put(url, data, config)

// 通用 PATCH
export const patch = <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> => request.patch(url, data, config)

// 通用 DELETE
export const del = <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  request.delete(url, config)

export default request
