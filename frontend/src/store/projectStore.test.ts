import { describe, it, expect, beforeEach, vi } from 'vitest'

// Zustand projectStore 测试：mock services/project，验证 CRUD、HIL 队列、reset
vi.mock('@/services/project', () => ({
  fetchProjectsApi: vi.fn(),
  fetchProjectApi: vi.fn(),
  createProjectApi: vi.fn(),
  updateProjectApi: vi.fn(),
  advanceStageApi: vi.fn(),
}))

import {
  fetchProjectsApi,
  fetchProjectApi,
  createProjectApi,
  updateProjectApi,
  advanceStageApi,
} from '@/services/project'
import { useProjectStore } from './projectStore'
import type { Project } from '@/types'

const mkProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: '项目1',
  discipline: 'NLP',
  stage: 'literature',
  status: 'idle',
  updatedAt: '2025-01-01',
  createdAt: '2025-01-01',
  description: 'desc',
  ...overrides,
})

// 仅重置数据字段，不替换 actions（避免 setState(state, true) 把 actions 覆盖）
const resetState = () => {
  useProjectStore.setState({
    projects: [],
    currentProject: null,
    stage: null,
    hilQueue: [],
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetState()
})

describe('store/projectStore', () => {
  describe('fetchProjects', () => {
    it('成功后写入 projects 并选中第一个', async () => {
      ;(fetchProjectsApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: [mkProject({ id: 'p1' }), mkProject({ id: 'p2' })],
      })
      await useProjectStore.getState().fetchProjects()
      const state = useProjectStore.getState()
      expect(state.projects).toHaveLength(2)
      expect(state.currentProject?.id).toBe('p1')
      expect(state.stage).toBe('literature')
      expect(state.loading).toBe(false)
    })

    it('失败时置空数组', async () => {
      ;(fetchProjectsApi as any).mockRejectedValue(new Error('network'))
      await useProjectStore.getState().fetchProjects()
      const state = useProjectStore.getState()
      expect(state.projects).toEqual([])
      expect(state.currentProject).toBeNull()
      expect(state.loading).toBe(false)
    })

    it('恢复 localStorage 中持久化的 currentProjectId', async () => {
      localStorage.setItem('rap_current_project_id', 'p2')
      ;(fetchProjectsApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: [mkProject({ id: 'p1' }), mkProject({ id: 'p2', stage: 'design' })],
      })
      await useProjectStore.getState().fetchProjects()
      const state = useProjectStore.getState()
      expect(state.currentProject?.id).toBe('p2')
      expect(state.stage).toBe('design')
    })

    it('loading 在请求期间为 true', async () => {
      let resolveFn: (v: any) => void
      ;(fetchProjectsApi as any).mockReturnValue(
        new Promise((resolve) => {
          resolveFn = resolve
        }),
      )
      const p = useProjectStore.getState().fetchProjects()
      expect(useProjectStore.getState().loading).toBe(true)
      resolveFn!({ code: 0, data: [] })
      await p
      expect(useProjectStore.getState().loading).toBe(false)
    })
  })

  describe('selectProject', () => {
    it('写入 localStorage 并更新 currentProject/stage', () => {
      const proj = mkProject({ id: 'p9', stage: 'experiment' })
      useProjectStore.getState().selectProject(proj)
      const state = useProjectStore.getState()
      expect(state.currentProject).toEqual(proj)
      expect(state.stage).toBe('experiment')
      expect(localStorage.getItem('rap_current_project_id')).toBe('p9')
    })

    it('currentStage 兜底字段', () => {
      const proj = mkProject({ id: 'p9', stage: 'write' as any, currentStage: 'figure' as any })
      useProjectStore.getState().selectProject(proj)
      expect(useProjectStore.getState().stage).toBe('write')
    })

    it('仅 currentStage 字段时也能识别', () => {
      const proj = mkProject({ id: 'p9', stage: undefined as any, currentStage: 'discuss' as any })
      useProjectStore.getState().selectProject(proj as any)
      expect(useProjectStore.getState().stage).toBe('discuss')
    })
  })

  describe('selectProjectById', () => {
    it('一级兜底：fetchProjectApi 成功', async () => {
      ;(fetchProjectApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: mkProject({ id: 'p1', stage: 'design' }),
      })
      await useProjectStore.getState().selectProjectById('p1')
      const state = useProjectStore.getState()
      expect(state.currentProject?.id).toBe('p1')
      expect(state.stage).toBe('design')
      expect(localStorage.getItem('rap_current_project_id')).toBe('p1')
      expect(fetchProjectsApi).not.toHaveBeenCalled()
    })

    it('二级兜底：单项目接口失败时从已加载列表查找', async () => {
      ;(fetchProjectApi as any).mockRejectedValue(new Error('404'))
      useProjectStore.setState({
        projects: [mkProject({ id: 'p2', stage: 'experiment' })],
      })
      await useProjectStore.getState().selectProjectById('p2')
      const state = useProjectStore.getState()
      expect(state.currentProject?.id).toBe('p2')
      expect(state.stage).toBe('experiment')
    })

    it('三级兜底：列表也没有时调 fetchProjectsApi 再查找', async () => {
      ;(fetchProjectApi as any).mockRejectedValue(new Error('404'))
      ;(fetchProjectsApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: [mkProject({ id: 'p3', stage: 'evaluate' })],
      })
      await useProjectStore.getState().selectProjectById('p3')
      const state = useProjectStore.getState()
      expect(state.currentProject?.id).toBe('p3')
      expect(state.stage).toBe('evaluate')
      expect(fetchProjectsApi).toHaveBeenCalled()
    })

    it('三级兜底仍未找到时取列表第一个', async () => {
      ;(fetchProjectApi as any).mockRejectedValue(new Error('404'))
      ;(fetchProjectsApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: [mkProject({ id: 'p4', stage: 'discuss' })],
      })
      await useProjectStore.getState().selectProjectById('not-exist')
      const state = useProjectStore.getState()
      expect(state.currentProject?.id).toBe('p4')
    })

    it('所有接口都失败时保持当前状态', async () => {
      ;(fetchProjectApi as any).mockRejectedValue(new Error('e'))
      ;(fetchProjectsApi as any).mockRejectedValue(new Error('e'))
      const before = useProjectStore.getState().currentProject
      await useProjectStore.getState().selectProjectById('any')
      expect(useProjectStore.getState().currentProject).toBe(before)
    })
  })

  describe('createProject', () => {
    it('成功后插入到 projects 头部', async () => {
      useProjectStore.setState({ projects: [mkProject({ id: 'old' })] })
      ;(createProjectApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: mkProject({ id: 'new', stage: 'literature' }),
      })
      const result = await useProjectStore.getState().createProject({
        name: '新项目',
        discipline: 'NLP',
        question: 'q',
      })
      expect(result?.id).toBe('new')
      const state = useProjectStore.getState()
      expect(state.projects).toHaveLength(2)
      expect(state.projects[0].id).toBe('new')
      expect(state.currentProject?.id).toBe('new')
      expect(state.stage).toBe('literature')
    })

    it('失败时返回 null，state 不变', async () => {
      ;(createProjectApi as any).mockRejectedValue(new Error('e'))
      const result = await useProjectStore.getState().createProject({
        name: 'x',
        discipline: 'x',
        question: 'x',
      })
      expect(result).toBeNull()
      expect(useProjectStore.getState().projects).toEqual([])
    })

    it('res.data 为空时返回 null', async () => {
      ;(createProjectApi as any).mockResolvedValue({ code: 1, message: 'err', data: null })
      const result = await useProjectStore.getState().createProject({
        name: 'x',
        discipline: 'x',
        question: 'x',
      })
      expect(result).toBeNull()
    })
  })

  describe('updateProject', () => {
    it('成功后更新对应项目与 currentProject', async () => {
      useProjectStore.setState({
        projects: [mkProject({ id: 'p1', name: 'old' })],
        currentProject: mkProject({ id: 'p1', name: 'old' }),
        stage: 'literature',
      })
      ;(updateProjectApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: mkProject({ id: 'p1', name: 'new', stage: 'design' }),
      })
      const result = await useProjectStore.getState().updateProject('p1', { name: 'new' })
      expect(result?.name).toBe('new')
      const state = useProjectStore.getState()
      expect(state.projects[0].name).toBe('new')
      expect(state.currentProject?.name).toBe('new')
      expect(state.stage).toBe('design')
    })

    it('非当前项目更新不影响 currentProject', async () => {
      useProjectStore.setState({
        projects: [
          mkProject({ id: 'p1', name: 'a' }),
          mkProject({ id: 'p2', name: 'b' }),
        ],
        currentProject: mkProject({ id: 'p1', name: 'a' }),
        stage: 'literature',
      })
      ;(updateProjectApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: mkProject({ id: 'p2', name: 'b-updated' }),
      })
      await useProjectStore.getState().updateProject('p2', { name: 'b-updated' })
      const state = useProjectStore.getState()
      expect(state.projects[1].name).toBe('b-updated')
      expect(state.currentProject?.name).toBe('a')
    })

    it('失败时返回 null', async () => {
      ;(updateProjectApi as any).mockRejectedValue(new Error('e'))
      const result = await useProjectStore.getState().updateProject('p1', {})
      expect(result).toBeNull()
    })
  })

  describe('advanceStage', () => {
    it('调用 advanceStageApi 并更新项目', async () => {
      useProjectStore.setState({
        currentProject: mkProject({ id: 'p1', stage: 'literature' }),
        projects: [mkProject({ id: 'p1', stage: 'literature' })],
      })
      ;(advanceStageApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: mkProject({ id: 'p1', stage: 'design' }),
      })
      await useProjectStore.getState().advanceStage()
      expect(advanceStageApi).toHaveBeenCalledWith('p1')
      const state = useProjectStore.getState()
      expect(state.currentProject?.stage).toBe('design')
      expect(state.stage).toBe('design')
    })

    it('显式传入 projectId 时使用传入值', async () => {
      ;(advanceStageApi as any).mockResolvedValue({
        code: 0,
        message: 'ok',
        data: mkProject({ id: 'p2', stage: 'design' }),
      })
      await useProjectStore.getState().advanceStage('p2')
      expect(advanceStageApi).toHaveBeenCalledWith('p2')
    })

    it('无 projectId 且无 currentProject 时直接 return', async () => {
      useProjectStore.setState({ currentProject: null })
      await useProjectStore.getState().advanceStage()
      expect(advanceStageApi).not.toHaveBeenCalled()
    })

    it('API 失败时不抛错', async () => {
      useProjectStore.setState({
        currentProject: mkProject({ id: 'p1', stage: 'literature' }),
      })
      ;(advanceStageApi as any).mockRejectedValue(new Error('e'))
      await expect(
        useProjectStore.getState().advanceStage(),
      ).resolves.toBeUndefined()
    })
  })

  describe('pushHIL / resolveHIL', () => {
    it('pushHIL 把 item 加到队首', () => {
      const item = { id: 'h1', projectId: 'p1', projectName: 'pn', stage: 'design', title: 't', agentProposal: 'a', status: 'pending', createdAt: '', reason: 'r' }
      useProjectStore.getState().pushHIL(item as any)
      expect(useProjectStore.getState().hilQueue).toHaveLength(1)
      expect(useProjectStore.getState().hilQueue[0].id).toBe('h1')
    })

    it('resolveHIL 按 id 移除', () => {
      const item1 = { id: 'h1', projectId: 'p1', projectName: 'pn', stage: 'design', title: 't', agentProposal: 'a', status: 'pending', createdAt: '', reason: 'r' }
      const item2 = { id: 'h2', projectId: 'p1', projectName: 'pn', stage: 'experiment', title: 't', agentProposal: 'a', status: 'pending', createdAt: '', reason: 'r' }
      useProjectStore.getState().pushHIL(item1 as any)
      useProjectStore.getState().pushHIL(item2 as any)
      useProjectStore.getState().resolveHIL('h1')
      const q = useProjectStore.getState().hilQueue
      expect(q).toHaveLength(1)
      expect(q[0].id).toBe('h2')
    })

    it('resolveHIL 不存在的 id 不报错', () => {
      expect(() => useProjectStore.getState().resolveHIL('not-exist')).not.toThrow()
    })
  })

  describe('setProjects', () => {
    it('直接设置 projects 数组', () => {
      const list = [mkProject({ id: 'a' }), mkProject({ id: 'b' })]
      useProjectStore.getState().setProjects(list)
      expect(useProjectStore.getState().projects).toEqual(list)
    })
  })

  describe('reset', () => {
    it('清空 state 并删除 localStorage', () => {
      localStorage.setItem('rap_current_project_id', 'p1')
      useProjectStore.setState({
        projects: [mkProject()],
        currentProject: mkProject(),
        stage: 'design',
        hilQueue: [{ id: 'h1' } as any],
        loading: true,
      })
      useProjectStore.getState().reset()
      const state = useProjectStore.getState()
      expect(state.projects).toEqual([])
      expect(state.currentProject).toBeNull()
      expect(state.stage).toBeNull()
      expect(state.hilQueue).toEqual([])
      expect(state.loading).toBe(false)
      expect(localStorage.getItem('rap_current_project_id')).toBeNull()
    })
  })
})
