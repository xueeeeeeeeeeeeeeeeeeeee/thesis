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
  runDemoPipelineApi,
  setModeApi,
  setTemplateApi,
  getDraftApi,
  renderDraftApi,
  type HILResumePayload,
} from '@/services/pipeline'
import { fetchProjectApi } from '@/services/project'
import { useProjectStore } from '@/store/projectStore'

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
  // 已触发过的 HIL 阶段历史（用于在 Workbench 4 张 HIL 卡片上持久显示状态，
  // 即使用户已对当前 HIL 完成决策 hilPending 置空后也不会回退到"未触发"）
  triggeredHILs: StageKey[]
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

// 把 HIL 写入 store：除了 hilPending，还要把 stage 追加进 triggeredHILs 历史（去重）。
// 供所有"产生新 HIL"的代码路径统一调用，避免历史与当前不同步。
const setHILWithHistory = (
  set: (partial: Partial<PipelineState>) => void,
  get: () => PipelineState,
  hp: HILPending,
): void => {
  const current = get().triggeredHILs
  if (current.includes(hp.stage)) {
    set({ hilPending: hp })
    return
  }
  set({ hilPending: hp, triggeredHILs: [...current, hp.stage] })
}

const DEMO_STAGE_LOGS: Array<{ stage: StageKey; text: string }> = [
  { stage: 'literature', text: '[文献] 已生成参考文献与综述线索' },
  { stage: 'design', text: '[设计] 已生成研究假设与实验方案' },
  { stage: 'experiment', text: '[实验] 已整理实验输入、指标与结果描述' },
  { stage: 'evaluate', text: '[评价] 已完成指标评价与结论判断' },
  { stage: 'discuss', text: '[讨论] 已生成局限性与后续工作分析' },
  { stage: 'write', text: '[撰写] 已生成摘要、方法、结果、讨论和结论章节' },
  { stage: 'figure', text: '[画图] 已生成图表清单与说明文字' },
  { stage: 'submit', text: '[投稿] 已生成投稿建议与检查清单' },
]

const MANUAL_HIL_FLOW: Array<{
  stage: StageKey
  title: string
  message: string
  proposal: string
}> = [
  {
    stage: 'design',
    title: 'HIL 审阅：文献到设计',
    message: '请确认文献综述、研究问题和论文字数要求后进入研究设计。',
    proposal: '建议保留当前研究问题，按设定字数生成一份结构完整、可继续编辑的论文初稿。',
  },
  {
    stage: 'experiment',
    title: 'HIL 审阅：设计到实验',
    message: '请确认实验方案或填写实验结果后进入评估。',
    proposal: '建议使用本地 demo 结果模拟实验输入，重点展示流程闭环。',
  },
  {
    stage: 'discuss',
    title: 'HIL 审阅：评价到讨论',
    message: '请确认评价结论后进入讨论分析。',
    proposal: '建议强调系统能稳定完成 8 阶段流程，同时说明真实论文仍需补充真实数据和引用核验。',
  },
  {
    stage: 'figure',
    title: 'HIL 审阅：撰写到画图',
    message: '请确认论文初稿方向后进入图表和投稿准备。',
    proposal: '建议生成流程图和阶段产物映射图，并保留字数要求说明。',
  },
]

const manualReviewState = new Map<string, number>()

const manualProposalWithRequirements = (
  proposal: string,
  artifacts: PipelineArtifacts,
): string => {
  const wordLimit = artifacts.requirements?.wordLimit
  return wordLimit ? `${proposal}\n\n论文字数要求：约 ${wordLimit} 字。` : proposal
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  projectId: null,
  status: 'idle',
  mode: 'auto',
  template: 'markdown',
  currentStep: null,
  agentId: null,
  artifacts: emptyArtifacts(),
  hilPending: null,
  triggeredHILs: [],
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
    const current = get()
    if (current.loading && current.projectId === projectId) {
      return
    }
    if (current.projectId === projectId && current.status === 'completed' && current.draftText) {
      return
    }
    set({
      projectId,
      loading: true,
      status: 'running',
      hilPending: null,
      // 新一轮流水线：清空 HIL 触发历史，避免上一轮的记录污染
      triggeredHILs: [],
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
      let pipelineData:
        | Awaited<ReturnType<typeof getPipelineApi>>['data']
        | undefined
      try {
        const res = await getPipelineApi(projectId)
        const data = res?.data
        pipelineData = data
        if (data) {
          // 从后端 agent.history 恢复已触发的 HIL 阶段列表
          const agentData0 = (data as { agent?: { history?: unknown[] } }).agent
          const history0 = agentData0?.history
          const restoredTriggered: StageKey[] = []
          if (Array.isArray(history0)) {
            const hilStages: StageKey[] = ['design', 'experiment', 'discuss', 'figure']
            for (const h of history0) {
              if (h && typeof h === 'object') {
                const item = h as { stage?: string; action?: string }
                if (item.stage && hilStages.includes(item.stage as StageKey)) {
                  if (!restoredTriggered.includes(item.stage as StageKey)) {
                    restoredTriggered.push(item.stage as StageKey)
                  }
                }
              }
            }
          }
          // 当前后端返回的 hilPending 也要追加
          if (data.hilPending && !restoredTriggered.includes(data.hilPending.stage)) {
            restoredTriggered.push(data.hilPending.stage)
          }
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
            // 用后端历史恢复 triggeredHILs（覆盖 startPipeline 开头的清空）
            triggeredHILs: restoredTriggered,
          })
          get().appendLog(`已连接 Agent${data.agentId ? ' ' + data.agentId : ''}`, 'success', null)
        }
      } catch {
        get().appendLog('无法连接后端流水线接口，继续本地模拟', 'warning', null)
      }
      const shouldRunDemo =
        pipelineData &&
        (pipelineData.status === 'idle' || pipelineData.status === 'error') &&
        !pipelineData.agentId &&
        !pipelineData.artifacts?.draftText
      if (shouldRunDemo) {
        const readyPipelineData = pipelineData
        if (!readyPipelineData) return
        if ((readyPipelineData.mode ?? get().mode) === 'manual') {
          const artifacts = (readyPipelineData.artifacts as PipelineArtifacts | undefined) ?? emptyArtifacts()
          const first = MANUAL_HIL_FLOW[0]
          set({
            status: 'interrupted',
            currentStep: first.stage,
            artifacts,
          })
          setHILWithHistory(set, get, {
            stage: first.stage,
            title: first.title,
            message: first.message,
            agentProposal: manualProposalWithRequirements(first.proposal, artifacts),
          })
          manualReviewState.set(projectId, 0)
          get().appendLog(`收到 HIL 中断：${first.stage}`, 'warning', first.stage)
        } else {
          get().appendLog('检测到项目尚未启动，使用本地演示流水线跑完 8 个阶段', 'info', null)
          const demoRes = await runDemoPipelineApi(projectId)
          const data = demoRes?.data
          if (data) {
            const project = (data as unknown as { project?: import('@/types').Project }).project
            if (project) {
              useProjectStore.getState().upsertProject(project)
            }
            set({
              status: data.status ?? 'completed',
              currentStep: data.currentStep ?? 'submit',
              agentId: data.agentId ?? null,
              artifacts: (data.artifacts as PipelineArtifacts) ?? emptyArtifacts(),
              draftText: data.artifacts?.draftText ?? get().draftText,
              hilPending: null,
            })
            for (const item of DEMO_STAGE_LOGS) {
              get().appendLog(item.text, 'success', item.stage)
            }
          }
        }
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
      if (manualReviewState.has(projectId)) {
        return
      }
      get().pollStatus(projectId)
    } finally {
      set({ loading: false })
    }
  },

  resumePipeline: async (action, payload) => {
    const { projectId } = get()
    if (!projectId) return
    const manualIndex = manualReviewState.get(projectId)
    if (manualIndex !== undefined && get().mode === 'manual') {
      set({ loading: true })
      try {
        get().appendLog(`HIL 响应：${action}`, 'success', get().hilPending?.stage ?? null)
        if (action === 'abort') {
          manualReviewState.delete(projectId)
          set({ status: 'aborted', hilPending: null })
          return
        }
        if (action === 'rollback') {
          const prevIndex = Math.max(0, manualIndex - 1)
          const item = MANUAL_HIL_FLOW[prevIndex]
          manualReviewState.set(projectId, prevIndex)
          set({
            status: 'interrupted',
            currentStep: item.stage,
          })
          setHILWithHistory(set, get, {
            stage: item.stage,
            title: item.title,
            message: item.message,
            agentProposal: manualProposalWithRequirements(item.proposal, get().artifacts),
          })
          return
        }
        const nextIndex = manualIndex + 1
        if (nextIndex < MANUAL_HIL_FLOW.length) {
          const item = MANUAL_HIL_FLOW[nextIndex]
          manualReviewState.set(projectId, nextIndex)
          set({
            status: 'interrupted',
            currentStep: item.stage,
          })
          setHILWithHistory(set, get, {
            stage: item.stage,
            title: item.title,
            message: item.message,
            agentProposal: manualProposalWithRequirements(item.proposal, get().artifacts),
          })
          get().appendLog(`收到 HIL 中断：${item.stage}`, 'warning', item.stage)
          return
        }
        manualReviewState.delete(projectId)
        get().appendLog('人工审阅完成，生成最终演示流水线产物', 'info', null)
        const demoRes = await runDemoPipelineApi(projectId)
        const data = demoRes?.data
        if (data) {
          const project = (data as unknown as { project?: import('@/types').Project }).project
          if (project) {
            useProjectStore.getState().upsertProject(project)
          }
          set({
            status: data.status ?? 'completed',
            currentStep: data.currentStep ?? 'submit',
            agentId: data.agentId ?? null,
            artifacts: (data.artifacts as PipelineArtifacts) ?? emptyArtifacts(),
            draftText: data.artifacts?.draftText ?? get().draftText,
            hilPending: null,
          })
          for (const item of DEMO_STAGE_LOGS) {
            get().appendLog(item.text, 'success', item.stage)
          }
        }
      } catch {
        get().appendLog('人工审阅推进失败', 'error', null)
      } finally {
        set({ loading: false })
      }
      return
    }
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
      set({ status: 'aborted', hilPending: null })
      get().appendLog('流水线已中止', 'warning', null)
    } catch {
      set({ status: 'aborted', hilPending: null })
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
          // LLM 服务返回的 hil_pending 只有 stage/message，无 agentProposal。
          // 把 message 作为"提议内容"兜底显示，避免弹窗里"Agent 提议"区为空。
          const hp = data.hilPending as Record<string, unknown>
          const proposal =
            (hp.agentProposal as string | undefined) ??
            (hp.agent_proposal as string | undefined) ??
            (hp.message as string | undefined) ??
            ''
          const newHIL: HILPending = {
            stage: data.hilPending.stage,
            message: data.hilPending.message,
            agentProposal: proposal,
            title: data.hilPending.title,
            experimentDesign: data.hilPending.experiment_design as
              | Record<string, unknown>
              | undefined,
          }
          next.hilPending = newHIL
          // agent 已中断（有 hilPending）但后端 project.pipelineStatus 可能仍为 running
          // （syncFromAgent 只在创建时调用一次）。此时强制设为 interrupted，保证 UI 一致。
          next.status = 'interrupted'
          // 同步追加到触发历史，确保 Workbench 4 张 HIL 卡片状态不会回退
          const current = get().triggeredHILs
          if (!current.includes(newHIL.stage)) {
            next.triggeredHILs = [...current, newHIL.stage]
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

  setHilPending: (p) => {
    // 写入新 HIL 时同步追加到触发历史，确保 Workbench 4 张 HIL 卡片
    // 即使用户已决策 hilPending 置空后仍能保持"已审阅"状态。
    if (p) {
      const current = get().triggeredHILs
      if (!current.includes(p.stage)) {
        set({ hilPending: p, triggeredHILs: [...current, p.stage] })
        return
      }
    }
    set({ hilPending: p })
  },

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
      triggeredHILs: [],
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
