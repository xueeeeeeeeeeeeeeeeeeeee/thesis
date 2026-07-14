import { create } from 'zustand'
import type { DraftTemplate, Project, HILItem, StageKey } from '@/types'
import {
  fetchProjectsApi,
  fetchProjectApi,
  createProjectApi,
  updateProjectApi,
  advanceStageApi,
  type UpdateProjectPayload,
} from '@/services/project'

// 当前项目持久化 key（只存 id，刷新后从列表恢复）
const CURRENT_PROJECT_ID_KEY = 'rap_current_project_id'

const loadCurrentProjectId = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_PROJECT_ID_KEY)
  } catch {
    return null
  }
}

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  stage: StageKey | null
  hilQueue: HILItem[]
  loading: boolean
  // actions
  fetchProjects: () => Promise<void>
  selectProject: (project: Project) => void
  selectProjectById: (id: string) => Promise<void>
  createProject: (payload: {
    name: string
    discipline: string
    question: string
    description?: string
    wordLimit?: number
    mode?: 'auto' | 'manual'
    template?: DraftTemplate
  }) => Promise<Project | null>
  updateProject: (id: string, payload: UpdateProjectPayload) => Promise<Project | null>
  advanceStage: (projectId?: string) => Promise<void>
  pushHIL: (item: HILItem) => void
  resolveHIL: (id: string) => void
  upsertProject: (project: Project) => void
  setProjects: (projects: Project[]) => void
  reset: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  stage: null,
  hilQueue: [],
  loading: false,

  fetchProjects: async () => {
    set({ loading: true })
    try {
      const res = await fetchProjectsApi()
      const list = res?.data ?? []
      // 优先恢复之前持久化的项目 id，其次保持当前选中，最后取第一个
      const savedId = loadCurrentProjectId()
      const currentId = get().currentProject?.id ?? savedId
      const restored = currentId
        ? list.find((p) => p.id === currentId) ?? null
        : null
      const current = restored ?? list[0] ?? null
      set({
        projects: list,
        currentProject: current,
        stage: (current?.stage ?? current?.currentStage ?? null) as StageKey | null,
      })
    } catch {
      // 后端不可用，置空数组（不再回退 mock）
      set({ projects: [], currentProject: null, stage: null })
    } finally {
      set({ loading: false })
    }
  },

  selectProject: (project) => {
    try {
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id)
    } catch {
      // 忽略写入失败
    }
    set({ currentProject: project, stage: project.stage ?? project.currentStage ?? null })
  },

  selectProjectById: async (id) => {
    // 1) 优先调单项目接口
    try {
      const res = await fetchProjectApi(id)
      if (res?.data) {
        try { localStorage.setItem(CURRENT_PROJECT_ID_KEY, id) } catch { /* 忽略 */ }
        set({ currentProject: res.data, stage: res.data.stage ?? res.data.currentStage ?? null })
        return
      }
    } catch {
      // 单项目接口失败，继续走列表兜底
    }
    // 2) 从已加载列表中查找
    const inList = get().projects.find((p) => p.id === id)
    if (inList) {
      try { localStorage.setItem(CURRENT_PROJECT_ID_KEY, id) } catch { /* 忽略 */ }
      set({ currentProject: inList, stage: inList.stage ?? inList.currentStage ?? null })
      return
    }
    // 3) 列表也没有，拉取列表后再找
    try {
      const res = await fetchProjectsApi()
      const list = res?.data ?? []
      const found = list.find((p) => p.id === id) ?? null
      const current = found ?? list[0] ?? null
      try { if (found) localStorage.setItem(CURRENT_PROJECT_ID_KEY, id) } catch { /* 忽略 */ }
      set({
        projects: list,
        currentProject: current,
        stage: (current?.stage ?? current?.currentStage ?? null) as StageKey | null,
      })
    } catch {
      // 全部失败，保持当前
    }
  },

  createProject: async (payload) => {
    try {
      const res = await createProjectApi({
        name: payload.name,
        discipline: payload.discipline,
        question: payload.question,
        description: payload.description,
        wordLimit: payload.wordLimit,
        mode: payload.mode,
        template: payload.template,
      })
      if (res?.data) {
        const project = res.data
        set((state) => ({
          projects: [project, ...state.projects],
          currentProject: project,
          stage: (project.stage ?? project.currentStage ?? null) as StageKey | null,
        }))
        return project
      }
      return null
    } catch {
      return null
    }
  },

  updateProject: async (id, payload) => {
    try {
      const res = await updateProjectApi(id, payload)
      if (!res?.data) return null
      const updated = res.data
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        currentProject:
          state.currentProject?.id === id ? updated : state.currentProject,
        stage:
          state.currentProject?.id === id
            ? ((updated.stage ?? updated.currentStage ?? null) as StageKey | null)
            : state.stage,
      }))
      return updated
    } catch {
      return null
    }
  },

  advanceStage: async (projectId) => {
    const current = get().currentProject
    const id = projectId ?? current?.id
    if (!id) return
    let success = false
    try {
      const res = await advanceStageApi(id)
      if (res?.data) {
        success = true
        const updated = res.data
        set((state) => {
          const projects = state.projects.map((p) => (p.id === id ? updated : p))
          return {
            projects,
            currentProject: updated,
            stage: updated.stage ?? updated.currentStage ?? null,
          }
        })
      }
    } catch {
      // 后端失败，不本地推进（统一以 API 为准）
    }
    if (!success) {
      // 失败时不推进，保留现状
    }
  },

  pushHIL: (item) => {
    set((state) => ({ hilQueue: [item, ...state.hilQueue] }))
  },

  resolveHIL: (id) => {
    set((state) => ({
      hilQueue: state.hilQueue.filter((h) => h.id !== id),
    }))
  },

  upsertProject: (project) => {
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id)
      const projects = exists
        ? state.projects.map((p) => (p.id === project.id ? project : p))
        : [project, ...state.projects]
      return {
        projects,
        currentProject:
          state.currentProject?.id === project.id ? project : state.currentProject,
        stage:
          state.currentProject?.id === project.id
            ? ((project.stage ?? project.currentStage ?? null) as StageKey | null)
            : state.stage,
      }
    })
  },

  setProjects: (projects) => set({ projects }),

  reset: () => {
    try {
      localStorage.removeItem(CURRENT_PROJECT_ID_KEY)
    } catch {
      // 忽略
    }
    set({
      projects: [],
      currentProject: null,
      stage: null,
      hilQueue: [],
      loading: false,
    })
  },
}))
