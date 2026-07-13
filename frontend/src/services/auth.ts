import { get, post, patch } from './request'
import type { ApiResponse, SafeUser, LoginResponse, RegisterInput, LoginInput } from '@/types'

// 注册
export const registerApi = (data: RegisterInput): Promise<ApiResponse<LoginResponse>> =>
  post<ApiResponse<LoginResponse>>('/auth/register', data)

// 登录
export const loginApi = (data: LoginInput): Promise<ApiResponse<LoginResponse>> =>
  post<ApiResponse<LoginResponse>>('/auth/login', data)

// 获取当前用户信息
export const getMeApi = (): Promise<ApiResponse<{ user: SafeUser }>> =>
  get<ApiResponse<{ user: SafeUser }>>('/auth/me')

// 更新当前用户信息
export const updateMeApi = (data: Partial<SafeUser>): Promise<ApiResponse<{ user: SafeUser }>> =>
  patch<ApiResponse<{ user: SafeUser }>>('/auth/me', data)

// 修改密码
export const changePasswordApi = (data: {
  oldPassword: string
  newPassword: string
}): Promise<ApiResponse<{ success: boolean }>> =>
  post<ApiResponse<{ success: boolean }>>('/auth/me/password', data)

// 退出登录
export const logoutApi = (): Promise<ApiResponse<{ success: boolean }>> =>
  post<ApiResponse<{ success: boolean }>>('/auth/logout')
