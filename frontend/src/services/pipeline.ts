import { get, post, patch } from './request'
import type {
  ApiResponse,
  DraftTemplate,
  PipelineMode,
  PipelineStatus,
  StageKey,
} from '@/types'

// 流水线单次状态响应
export interface PipelineStatusResponse {
  agentId?: string
  status: PipelineStatus
  currentStep?: StageKey
  artifacts?: {
    literature?: unknown[]
    design?: { method?: string; hypothesis?: string; plan?: string }
    experiment?: { code?: string; metrics?: { name: string; value: number }[] }
    evaluation?: {
      metrics?: { name: string; value: number; baseline?: number }[]
      conclusion?: string
    }
    discussion?: { points?: string[]; limitations?: string[] }
    paperSections?: { type: string; title: string; content: string }[]
    figures?: { name: string; caption: string; dataUrl?: string }[]
    draftText?: string
  }
  hilPending?: {
    stage: StageKey
    message: string
    title?: string
    // experiment 阶段附带的实验设计方案，供表单预填
    experiment_design?: { method?: string; hypothesis?: string; plan?: string; dataset?: string } & Record<string, unknown>
  } | null
}

// HIL 响应入参
export interface HILResumePayload {
  // 与后端 InterruptAction 对齐：approve→confirm
  action: 'confirm' | 'edit' | 'rollback' | 'abort'
  // text/comment 用于通用阶段；experiment_results 用于 experiment 阶段提交用户输入
  payload?: {
    text?: string
    comment?: string
    experiment_results?: import('@/types').ExperimentFormData
  }
}

// 草稿响应
export interface DraftResponse {
  template: DraftTemplate
  draftText: string
}

// 拉取流水线当前状态
export const getPipelineApi = (
  projectId: string,
): Promise<ApiResponse<PipelineStatusResponse>> =>
  get<ApiResponse<PipelineStatusResponse>>(`/projects/${projectId}/pipeline`)

// 触发 HIL 响应（通过 / 编辑 / 回滚 / 中止）
export const resumePipelineApi = (
  projectId: string,
  body: HILResumePayload,
): Promise<ApiResponse<PipelineStatusResponse>> =>
  post<ApiResponse<PipelineStatusResponse>>(
    `/projects/${projectId}/pipeline/resume`,
    body,
  )

// 中止流水线
export const abortPipelineApi = (
  projectId: string,
): Promise<ApiResponse<{ success: boolean }>> =>
  post<ApiResponse<{ success: boolean }>>(`/projects/${projectId}/pipeline/abort`)

// 切换推进模式（auto / manual）
export const setModeApi = (
  projectId: string,
  mode: PipelineMode,
): Promise<ApiResponse<{ mode: PipelineMode }>> =>
  patch<ApiResponse<{ mode: PipelineMode }>>(
    `/projects/${projectId}/pipeline/mode`,
    { mode },
  )

// 切换初稿模板
export const setTemplateApi = (
  projectId: string,
  template: DraftTemplate,
): Promise<ApiResponse<{ template: DraftTemplate }>> =>
  patch<ApiResponse<{ template: DraftTemplate }>>(
    `/projects/${projectId}/pipeline/template`,
    { template },
  )

// 拉取草稿
export const getDraftApi = (
  projectId: string,
): Promise<ApiResponse<DraftResponse>> =>
  get<ApiResponse<DraftResponse>>(`/projects/${projectId}/draft`)

// 重新渲染草稿
export const renderDraftApi = (
  projectId: string,
  template: DraftTemplate,
): Promise<ApiResponse<DraftResponse>> =>
  post<ApiResponse<DraftResponse>>(
    `/projects/${projectId}/draft/render`,
    { template },
  )

// 下载草稿（返回 blob URL，调用方需自行 revoke）
export const downloadDraftApi = async (projectId: string): Promise<string> => {
  // request.ts 的响应拦截器直接返回 response.data，blob 走 axios 的 responseType: 'blob'
  const { default: axios } = await import('axios')
  const token = localStorage.getItem('rap_token')
  const res = await axios.get<Blob>(
    `/api/projects/${projectId}/draft/download`,
    {
      responseType: 'blob',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 60000,
    },
  )
  return URL.createObjectURL(res.data)
}
