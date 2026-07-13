import { describe, it, expect, beforeEach, vi } from 'vitest'

// project API 测试：mock ./request，验证每个 API 调用正确的方法与 URL

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('./request', () => ({
  get: mockRequest.get,
  post: mockRequest.post,
  put: mockRequest.put,
  patch: mockRequest.patch,
  del: mockRequest.del,
  default: mockRequest,
  setUnauthorizedHandler: vi.fn(),
}))

import { get, post, patch } from './request'
import {
  fetchProjectsApi,
  fetchProjectApi,
  createProjectApi,
  updateProjectApi,
  advanceStageApi,
  pauseProjectApi,
} from './project'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('services/project', () => {
  it('fetchProjectsApi 调用 GET /projects', async () => {
    ;(get as any).mockResolvedValueOnce({ code: 0, data: [] })
    await fetchProjectsApi()
    expect(get).toHaveBeenCalledWith('/projects')
  })

  it('fetchProjectApi 调用 GET /projects/:id', async () => {
    ;(get as any).mockResolvedValueOnce({ code: 0, data: {} })
    await fetchProjectApi('p1')
    expect(get).toHaveBeenCalledWith('/projects/p1')
  })

  it('createProjectApi 调用 POST /projects，传入 payload', async () => {
    ;(post as any).mockResolvedValueOnce({ code: 0, data: {} })
    const payload = { name: 'p', discipline: 'NLP', question: 'q' }
    await createProjectApi(payload)
    expect(post).toHaveBeenCalledWith('/projects', payload)
  })

  it('updateProjectApi 调用 PATCH /projects/:id，传入 payload', async () => {
    ;(patch as any).mockResolvedValueOnce({ code: 0, data: {} })
    const payload = { name: 'new' }
    await updateProjectApi('p1', payload)
    expect(patch).toHaveBeenCalledWith('/projects/p1', payload)
  })

  it('advanceStageApi 调用 POST /projects/:id/advance', async () => {
    ;(post as any).mockResolvedValueOnce({ code: 0, data: {} })
    await advanceStageApi('p1')
    expect(post).toHaveBeenCalledWith('/projects/p1/advance')
  })

  it('pauseProjectApi 调用 POST /projects/:id/pause', async () => {
    ;(post as any).mockResolvedValueOnce({ code: 0, data: {} })
    await pauseProjectApi('p1')
    expect(post).toHaveBeenCalledWith('/projects/p1/pause')
  })
})
