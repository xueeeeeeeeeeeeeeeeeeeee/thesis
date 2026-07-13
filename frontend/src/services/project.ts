import { get, post, patch } from './request'
import type { Project, ApiResponse, PipelineMode, DraftTemplate } from '@/types'

// 项目 API 封装（后端尚未实现时前端会走 mock，请求失败由拦截器提示）

// 获取项目列表
export const fetchProjectsApi = (): Promise<ApiResponse<Project[]>> =>
  get<ApiResponse<Project[]>>('/projects')

// 获取单个项目
export const fetchProjectApi = (id: string): Promise<ApiResponse<Project>> =>
  get<ApiResponse<Project>>(`/projects/${id}`)

// 新建项目入参（业务字段）
export interface CreateProjectPayload {
  name: string
  discipline: string
  question: string
  description?: string
  mode?: PipelineMode
  template?: DraftTemplate
}

export interface UpdateProjectPayload {
  name?: string
  discipline?: string
  question?: string
  description?: string
  mode?: PipelineMode
  template?: DraftTemplate
}

// 新建项目
export const createProjectApi = (
  payload: CreateProjectPayload,
): Promise<ApiResponse<Project>> =>
  post<ApiResponse<Project>>('/projects', payload)

// 更新项目
export const updateProjectApi = (
  id: string,
  payload: UpdateProjectPayload,
): Promise<ApiResponse<Project>> =>
  patch<ApiResponse<Project>>(`/projects/${id}`, payload)

// 推进阶段
export const advanceStageApi = (
  id: string,
): Promise<ApiResponse<Project>> =>
  post<ApiResponse<Project>>(`/projects/${id}/advance`)

// 暂停项目
export const pauseProjectApi = (id: string): Promise<ApiResponse<Project>> =>
  post<ApiResponse<Project>>(`/projects/${id}/pause`)
