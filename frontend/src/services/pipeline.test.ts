import { describe, it, expect, beforeEach, vi } from 'vitest'

// pipeline API 测试：mock ./request，验证每个 API 调用正确的方法与 URL

const { mockRequest, mockAxiosGet } = vi.hoisted(() => ({
  mockRequest: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
  mockAxiosGet: vi.fn(),
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

// mock axios（downloadDraftApi 中动态 import axios）
vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}))

import { get, post, patch } from './request'
import axios from 'axios'
import {
  getPipelineApi,
  resumePipelineApi,
  abortPipelineApi,
  setModeApi,
  setTemplateApi,
  getDraftApi,
  renderDraftApi,
  downloadDraftApi,
} from './pipeline'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('services/pipeline', () => {
  it('getPipelineApi 调用 GET /projects/:id/pipeline', async () => {
    ;(get as any).mockResolvedValueOnce({ code: 0, data: {} })
    await getPipelineApi('p1')
    expect(get).toHaveBeenCalledWith('/projects/p1/pipeline')
  })

  it('resumePipelineApi 调用 POST /projects/:id/pipeline/resume，传入 body', async () => {
    ;(post as any).mockResolvedValueOnce({ code: 0, data: {} })
    const body = { action: 'confirm', payload: { text: 'ok' } }
    await resumePipelineApi('p1', body)
    expect(post).toHaveBeenCalledWith('/projects/p1/pipeline/resume', body)
  })

  it('abortPipelineApi 调用 POST /projects/:id/pipeline/abort', async () => {
    ;(post as any).mockResolvedValueOnce({ code: 0, data: {} })
    await abortPipelineApi('p1')
    expect(post).toHaveBeenCalledWith('/projects/p1/pipeline/abort')
  })

  it('setModeApi 调用 PATCH /projects/:id/pipeline/mode，传 { mode }', async () => {
    ;(patch as any).mockResolvedValueOnce({ code: 0, data: {} })
    await setModeApi('p1', 'auto')
    expect(patch).toHaveBeenCalledWith('/projects/p1/pipeline/mode', { mode: 'auto' })
  })

  it('setTemplateApi 调用 PATCH /projects/:id/pipeline/template，传 { template }', async () => {
    ;(patch as any).mockResolvedValueOnce({ code: 0, data: {} })
    await setTemplateApi('p1', 'ctex')
    expect(patch).toHaveBeenCalledWith('/projects/p1/pipeline/template', { template: 'ctex' })
  })

  it('getDraftApi 调用 GET /projects/:id/draft', async () => {
    ;(get as any).mockResolvedValueOnce({ code: 0, data: {} })
    await getDraftApi('p1')
    expect(get).toHaveBeenCalledWith('/projects/p1/draft')
  })

  it('renderDraftApi 调用 POST /projects/:id/draft/render，传 { template }', async () => {
    ;(post as any).mockResolvedValueOnce({ code: 0, data: {} })
    await renderDraftApi('p1', 'ieee')
    expect(post).toHaveBeenCalledWith('/projects/p1/draft/render', { template: 'ieee' })
  })

  it('downloadDraftApi 返回 blob URL（mock URL.createObjectURL）', async () => {
    const blob = new Blob(['draft content'], { type: 'text/plain' })
    mockAxiosGet.mockResolvedValueOnce({ data: blob })
    const url = await downloadDraftApi('p1')
    expect(url).toBe('blob:mock-url')
    expect(mockAxiosGet).toHaveBeenCalledWith(
      '/api/projects/p1/draft/download',
      expect.objectContaining({
        responseType: 'blob',
        headers: {},
        timeout: 60000,
      }),
    )
  })

  it('downloadDraftApi 有 token 时附加 Authorization', async () => {
    localStorage.setItem('rap_token', 'tok-xyz')
    mockAxiosGet.mockResolvedValueOnce({ data: new Blob() })
    await downloadDraftApi('p2')
    expect(mockAxiosGet).toHaveBeenCalledWith(
      '/api/projects/p2/draft/download',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok-xyz' },
      }),
    )
  })
})
