import { create } from 'zustand'
import type {
  DraftTemplate,
  PipelineArtifacts,
  PipelineMode,
  PipelineStatus,
  StageKey,
} from '@/types'
import {
  getPipelineApi,
  resumePipelineApi,
  abortPipelineApi,
  setModeApi,
  setTemplateApi,
  getDraftApi,
  renderDraftApi,
  type HILResumePayload,
} from '@/services/pipeline'
import { fetchProjectApi } from '@/services/project'

// 实时日志条目
export interface LogEntry {
  id: string
  time: string
  stage: StageKey | null
  text: string
  level: 'info' | 'success' | 'warning' | 'error'
}

// HIL 待办
export interface HILPending {
  stage: StageKey
  message: string
  agentProposal: string
  // experiment 阶段附带的实验设计方案（来自 design 阶段），供表单预填
  experimentDesign?: Record<string, unknown>
  // HIL 标题（来自 LLM 服务）
  title?: string
}

interface PipelineState {
  // 流水线基础
  projectId: string | null
  status: PipelineStatus
  mode: PipelineMode
  template: DraftTemplate
  currentStep: StageKey | null
  agentId: string | null
  artifacts: PipelineArtifacts
  hilPending: HILPending | null
  // 实时日志
  logs: LogEntry[]
  // 草稿
  draftText: string
  // 控制
  loading: boolean
  pollTimer: ReturnType<typeof setInterval> | null

  // 内部辅助
  appendLog: (text: string, level?: LogEntry['level'], stage?: StageKey | null) => void
  clearLogs: () => void

  // actions
  startPipeline: (projectId: string) => Promise<void>
  resumePipeline: (action: HILResumePayload['action'], payload?: HILResumePayload['payload']) => Promise<void>
  abortPipeline: () => Promise<void>
  setMode: (mode: PipelineMode) => Promise<void>
  setTemplate: (template: DraftTemplate) => Promise<void>
  renderDraft: (template?: DraftTemplate) => Promise<void>
  loadDraft: (projectId: string) => Promise<void>
  pollStatus: (projectId: string) => void
  stopPolling: () => void
  applyUpdate: (update: Partial<PipelineState>) => void
  setHilPending: (p: HILPending | null) => void
  reset: () => void
}

const generateId = (): string => `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const TERMINAL_STATUS: PipelineStatus[] = ['completed', 'aborted', 'error']

const emptyArtifacts = (): PipelineArtifacts => ({})

export const usePipelineStore = create<PipelineState>((set, get) => ({
  projectId: null,
  status: 'idle',
  mode: 'auto',
  template: 'markdown',
  currentStep: null,
  agentId: null,
  artifacts: emptyArtifacts(),
  hilPending: null,
  logs: [],
  draftText: '',
  loading: false,
  pollTimer: null,

  appendLog: (text, level = 'info', stage = null) => {
    set((state) => {
      const next: LogEntry = {
        id: generateId(),
        time: new Date().toISOString(),
        stage,
        text,
        level,
      }
      // 限制最多 200 条，避免内存膨胀
      const logs = [...state.logs, next].slice(-200)
      return { logs }
    })
  },

  clearLogs: () => set({ logs: [] }),

  startPipeline: async (projectId: string) => {
    set({
      projectId,
      loading: true,
      status: 'running',
      hilPending: null,
    })
    get().clearLogs()
    get().appendLog('启动流水线', 'info', null)
    try {
      // 1) 先拉取项目最新状态，确认模式/模板
      try {
        const projRes = await fetchProjectApi(projectId)
        const proj = projRes?.data
        if (proj) {
          set({
            mode: proj.mode ?? get().mode,
            template: proj.template ?? get().template,
            currentStep: (proj.currentStep ?? proj.stage ?? null) as StageKey | null,
          })
        }
      } catch {
        // 单项目接口失败不影响后续
        get().appendLog('无法加载项目详情（后端可能未启动）', 'warning', null)
      }
      // 2) 拉取流水线状态
      try {
        const res = await getPipelineApi(projectId)
        const data = res?.data
        if (data) {
          set({
            status: data.status ?? 'running',
            currentStep: data.currentStep ?? null,
            agentId: data.agentId ?? null,
            artifacts: (data.artifacts as PipelineArtifacts) ?? emptyArtifacts(),
            hilPending: data.hilPending
              ? {
                  stage: data.hilPending.stage,
                  message: data.hilPending.message,
                  agentProposal: '',
                  title: data.hilPending.title,
                  experimentDesign: data.hilPending.experiment_design as
                    | Record<string, unknown>
                    | undefined,
                }
              : null,
          })
          get().appendLog(`已连接 Agent${data.agentId ? ' ' + data.agentId : ''}`, 'success', null)
        }
      } catch {
        get().appendLog('无法连接后端流水线接口，继续本地模拟', 'warning', null)
      }
      // 3) 加载草稿
      try {
        const draftRes = await getDraftApi(projectId)
        if (draftRes?.data) {
          set({
            draftText: draftRes.data.draftText ?? draftRes.data.text ?? '',
            template: draftRes.data.template,
          })
        }
      } catch {
        // 草稿可能尚未生成，保持空
      }
      // 4) 启动轮询
      get().pollStatus(projectId)
    } finally {
      set({ loading: false })
    }
  },

  resumePipeline: async (action, payload) => {
    const { projectId } = get()
    if (!projectId) return
    set({ loading: true })
    try {
      const res = await resumePipelineApi(projectId, { action, payload })
      const data = res?.data
      if (data) {
        const result = (data as unknown as { result?: Partial<PipelineState> }).result
        set({
          status: (result?.status as PipelineStatus | undefined) ?? get().status,
          currentStep: (result?.currentStep as StageKey | undefined) ?? get().currentStep,
          agentId:
            ((data as unknown as { agentId?: string }).agentId ?? result?.agentId ?? null) as
              | string
              | null,
          artifacts: (result?.artifacts as PipelineArtifacts | undefined) ?? get().artifacts,
          hilPending: null,
        })
        get().appendLog(`HIL 响应：${action}`, 'success', null)
      }
    } catch {
      get().appendLog('HIL 响应失败（后端不可用）', 'error', null)
    } finally {
      set({ loading: false })
    }
  },

  abortPipeline: async () => {
    const { projectId } = get()
    if (!projectId) return
    set({ loading: true })
    try {
      await abortPipelineApi(projectId)
      set({ status: 'aborted' })
      get().appendLog('流水线已中止', 'warning', null)
    } catch {
      set({ status: 'aborted' })
      get().appendLog('中止请求失败，本地标记为中止', 'warning', null)
    } finally {
      get().stopPolling()
      set({ loading: false })
    }
  },

  setMode: async (mode) => {
    const { projectId } = get()
    set({ mode })
    if (!projectId) return
    try {
      await setModeApi(projectId, mode)
      get().appendLog(`切换模式：${mode === 'auto' ? '全自动' : '人工审阅'}`, 'info', null)
    } catch {
      get().appendLog('模式切换接口失败（仅本地生效）', 'warning', null)
    }
  },

  setTemplate: async (template) => {
    const { projectId } = get()
    set({ template })
    if (!projectId) return
    try {
      await setTemplateApi(projectId, template)
      get().appendLog(`切换模板：${template}`, 'info', null)
    } catch {
      get().appendLog('模板切换接口失败（仅本地生效）', 'warning', null)
    }
  },

  renderDraft: async (template) => {
    const { projectId, template: currentTpl } = get()
    if (!projectId) return
    const target = template ?? currentTpl
    set({ loading: true })
    try {
      const res = await renderDraftApi(projectId, target)
      if (res?.data) {
        set({
          draftText: res.data.draftText ?? res.data.text ?? '',
          template: res.data.template,
        })
        get().appendLog(`草稿已用模板 ${res.data.template} 重新渲染`, 'success', null)
      }
    } catch {
      get().appendLog('草稿渲染失败（后端不可用）', 'error', null)
    } finally {
      set({ loading: false })
    }
  },

  loadDraft: async (projectId) => {
    try {
      const res = await getDraftApi(projectId)
      if (res?.data) {
        set({
          draftText: res.data.draftText ?? res.data.text ?? '',
          template: res.data.template,
        })
      }
    } catch {
      // 草稿未生成时静默
    }
  },

  pollStatus: (projectId) => {
    get().stopPolling()
    const timer = setInterval(async () => {
      // 终止态停止轮询
      if (TERMINAL_STATUS.includes(get().status)) {
        get().stopPolling()
        return
      }
      try {
        const res = await getPipelineApi(projectId)
        const data = res?.data
        if (!data) return
        const next: Partial<PipelineState> = {
          // 后端 /pipeline 在顶层返回 status；兜底用当前值，避免 undefined 清掉 running 态
          status: (data.status as PipelineStatus | undefined) ?? get().status,
          currentStep: data.currentStep ?? null,
          agentId: data.agentId ?? null,
          artifacts: (data.artifacts as PipelineArtifacts) ?? emptyArtifacts(),
        }
        if (data.hilPending && !get().hilPending) {
          next.hilPending = {
            stage: data.hilPending.stage,
            message: data.hilPending.message,
            agentProposal: '',
            title: data.hilPending.title,
            experimentDesign: data.hilPending.experiment_design as
              | Record<string, unknown>
              | undefined,
          }
          get().appendLog(`收到 HIL 中断：${data.hilPending.stage}`, 'warning', data.hilPending.stage)
        }
        if (data.artifacts?.draftText && data.artifacts.draftText !== get().draftText) {
          next.draftText = data.artifacts.draftText
        }
        // 消费后端 agent.history，填充实时日志（页面刷新后也能看到历史操作）
        const agentData = (data as { agent?: { history?: unknown[] } }).agent
        const history = agentData?.history
        if (Array.isArray(history) && history.length > 0) {
          const existingCount = get().logs.length
          // 仅追加新增的历史条目（按数量差增量同步，避免重复）
          if (history.length > existingCount) {
            const newEntries = history.slice(existingCount)
            const stageLabelMap: Record<string, string> = {
              literature: '文献', design: '设计', experiment: '实验',
              evaluate: '评价', discuss: '讨论', write: '撰写',
              figure: '画图', submit: '投稿',
            }
            for (const h of newEntries) {
              if (h && typeof h === 'object') {
                const item = h as {
                  stage?: string
                  action?: string
                  detail?: string
                  summary?: string
                  timestamp?: string
                }
                const stageLabel = item.stage ? (stageLabelMap[item.stage] ?? item.stage) : ''
                const text = item.detail || item.summary || item.action || '阶段推进'
                const ts = item.timestamp || new Date().toISOString()
                get().appendLog(`[${stageLabel}] ${text}`, 'info', item.stage as StageKey | undefined)
                // 覆盖最后一条的时间戳（保留 LLM 服务原始时间）
                const logs = get().logs
                if (logs.length > 0) {
                  logs[logs.length - 1].time = ts
                }
              }
            }
          }
        }
        set(next)
        if (TERMINAL_STATUS.includes(data.status)) {
          get().stopPolling()
        }
      } catch {
        // 后端不可用时静默
      }
    }, 2000)
    set({ pollTimer: timer })
  },

  stopPolling: () => {
    const t = get().pollTimer
    if (t) {
      clearInterval(t)
      set({ pollTimer: null })
    }
  },

  applyUpdate: (update) => set(update),

  setHilPending: (p) => set({ hilPending: p }),

  reset: () => {
    get().stopPolling()
    set({
      projectId: null,
      status: 'idle',
      mode: 'auto',
      template: 'markdown',
      currentStep: null,
      agentId: null,
      artifacts: emptyArtifacts(),
      hilPending: null,
      logs: [],
      draftText: '',
      loading: false,
    })
  },
}))

// 暴露给 WS 事件直接更新 store 的工具
export const applyPipelineUpdate = (patch: Partial<PipelineState>): void => {
  usePipelineStore.getState().applyUpdate(patch)
}
