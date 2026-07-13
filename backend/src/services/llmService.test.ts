import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 提升 mock 引用，避免 vi.mock 工厂引用顶层变量时报错
const { mockRequest, mockGet, mockPost, MockAxiosError } = vi.hoisted(() => {
  class MockAxiosError extends Error {
    response?: { status: number; data: unknown };
    code?: string;
    constructor(message: string, code?: string, response?: { status: number; data: unknown }) {
      super(message);
      this.name = 'AxiosError';
      this.code = code;
      this.response = response;
    }
  }
  return {
    mockRequest: vi.fn(),
    mockGet: vi.fn(),
    mockPost: vi.fn(),
    MockAxiosError,
  };
});

// mock axios：让 axios.create 返回一个可控的实例
vi.mock('axios', () => {
  return {
    default: {
      AxiosError: MockAxiosError,
      create: vi.fn(() => ({
        request: mockRequest,
        get: mockGet,
        post: mockPost,
      })),
      isAxiosError: (err: unknown) => err instanceof MockAxiosError,
    },
    AxiosError: MockAxiosError,
  };
});

import { llmService } from './llmService';
import { ApiError } from '../types';
import { AxiosError } from 'axios';

// LLM 服务客户端测试
describe('services/llmService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('isAvailable', () => {
    it('请求成功后返回 true', async () => {
      // 验证请求成功后 available 标记为 true
      mockRequest.mockResolvedValueOnce({ data: { ok: true } });
      await llmService.chat({ message: 'hi' });
      expect(llmService.isAvailable()).toBe(true);
    });

    it('请求失败后返回 false', async () => {
      // 验证请求失败后 available 标记为 false
      const err = new MockAxiosError('Network Error');
      mockRequest.mockRejectedValueOnce(err);
      await expect(llmService.chat({ message: 'hi' })).rejects.toThrow();
      expect(llmService.isAvailable()).toBe(false);
    });
  });

  describe('chat', () => {
    it('调 POST /llm/chat', async () => {
      // 验证 chat 方法调用 POST /llm/chat
      mockRequest.mockResolvedValueOnce({ data: { reply: 'hello' } });
      const result = await llmService.chat({ message: 'hi' });
      expect(result).toEqual({ reply: 'hello' });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/llm/chat',
        data: { message: 'hi' },
      });
    });
  });

  describe('getAgentStatus', () => {
    it('调 GET /agents/:id/status', async () => {
      // 验证 getAgentStatus 调用 GET /agents/{id}/status
      mockRequest.mockResolvedValueOnce({ data: { agent_id: 'a1', status: 'running' } });
      const result = await llmService.getAgentStatus('a1');
      expect(result.agent_id).toBe('a1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/agents/a1/status',
        data: undefined,
      });
    });
  });

  describe('runAgent', () => {
    it('非法 stage 被过滤为 undefined', async () => {
      // 后端 ProjectStage 中 'topic' 不在 LLM 8 阶段白名单内
      mockRequest.mockResolvedValueOnce({
        data: { agent_id: 'a1', status: { agent_id: 'a1', status: 'running' } },
      });
      await llmService.runAgent({
        projectId: 'p1',
        question: 'q',
        discipline: 'd',
        startStage: 'topic' as never,
      });
      const callArgs = mockRequest.mock.calls[0][0];
      expect(callArgs.data.start_stage).toBeUndefined();
    });

    it('合法 stage 透传', async () => {
      // 'literature' 在白名单内，应原样透传
      mockRequest.mockResolvedValueOnce({
        data: { agent_id: 'a1', status: { agent_id: 'a1', status: 'running' } },
      });
      await llmService.runAgent({
        projectId: 'p1',
        question: 'q',
        discipline: 'd',
        startStage: 'literature',
      });
      const callArgs = mockRequest.mock.calls[0][0];
      expect(callArgs.data.start_stage).toBe('literature');
    });

    it('未传 stage 时 start_stage 为 undefined', async () => {
      // 不传 startStage 字段
      mockRequest.mockResolvedValueOnce({
        data: { agent_id: 'a1', status: { agent_id: 'a1', status: 'running' } },
      });
      await llmService.runAgent({
        projectId: 'p1',
        question: 'q',
        discipline: 'd',
      });
      const callArgs = mockRequest.mock.calls[0][0];
      expect(callArgs.data.start_stage).toBeUndefined();
    });

    it('默认 mode 与 template', async () => {
      // 不传 mode / template 时使用默认值 auto / markdown
      mockRequest.mockResolvedValueOnce({
        data: { agent_id: 'a1', status: { agent_id: 'a1', status: 'running' } },
      });
      await llmService.runAgent({
        projectId: 'p1',
        question: 'q',
        discipline: 'd',
      });
      const callArgs = mockRequest.mock.calls[0][0];
      expect(callArgs.data.mode).toBe('auto');
      expect(callArgs.data.template).toBe('markdown');
    });

    it('调 POST /agents/run', async () => {
      // 验证 runAgent 走 POST /agents/run
      mockRequest.mockResolvedValueOnce({
        data: { agent_id: 'a1', status: { agent_id: 'a1', status: 'running' } },
      });
      await llmService.runAgent({
        projectId: 'p1',
        question: 'q',
        discipline: 'd',
        startStage: 'literature',
      });
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/agents/run',
        }),
      );
    });
  });

  describe('错误处理（间接测试 normalizeError）', () => {
    it('无 response（网络错误）→ 503「无法连接到 LLM 服务」', async () => {
      // 构造无 response 的 AxiosError，应映射为 503
      const err = new MockAxiosError('connect ECONNREFUSED');
      mockRequest.mockRejectedValueOnce(err);
      try {
        await llmService.chat({});
        expect.fail('应抛出 ApiError(503)');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).statusCode).toBe(503);
        expect((e as ApiError).message).toContain('无法连接到 LLM 服务');
      }
    });

    it('有 response 4xx 透传状态码与 message', async () => {
      // 构造 422 响应
      const err = new MockAxiosError('Request failed', 'ERR_BAD_REQUEST', {
        status: 422,
        data: { message: '参数不合法' },
      });
      mockRequest.mockRejectedValueOnce(err);
      await expect(llmService.chat({})).rejects.toMatchObject({
        statusCode: 422,
        message: '参数不合法',
      });
    });

    it('有 response 5xx 透传状态码', async () => {
      // 构造 500 响应
      const err = new MockAxiosError('Server error', 'ERR_BAD_RESPONSE', {
        status: 500,
        data: { message: '上游异常' },
      });
      mockRequest.mockRejectedValueOnce(err);
      await expect(llmService.chat({})).rejects.toMatchObject({
        statusCode: 500,
        message: '上游异常',
      });
    });

    it('上游返回纯字符串 message 透传', async () => {
      // 上游 data 是字符串
      const err = new MockAxiosError('Bad Request', 'ERR_BAD_REQUEST', {
        status: 400,
        data: '纯字符串错误',
      });
      mockRequest.mockRejectedValueOnce(err);
      await expect(llmService.chat({})).rejects.toMatchObject({
        statusCode: 400,
        message: '纯字符串错误',
      });
    });

    it('上游无 message 字段时返回兜底文案', async () => {
      // 上游 data 是对象但无 message 字段
      const err = new MockAxiosError('Bad Request', 'ERR_BAD_REQUEST', {
        status: 418,
        data: { foo: 'bar' },
      });
      mockRequest.mockRejectedValueOnce(err);
      try {
        await llmService.chat({});
        expect.fail('应抛出 ApiError(418)');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).statusCode).toBe(418);
        expect((e as ApiError).message).toContain('LLM 服务返回错误');
      }
    });

    it('非 AxiosError 返回 500', async () => {
      // 普通 Error 应映射为 500
      mockRequest.mockRejectedValueOnce(new Error('unknown failure'));
      await expect(llmService.chat({})).rejects.toMatchObject({
        statusCode: 500,
        message: 'unknown failure',
      });
    });

    it('非 Error 类型也返回 500', async () => {
      // 字符串异常
      mockRequest.mockRejectedValueOnce('string error');
      await expect(llmService.chat({})).rejects.toMatchObject({
        statusCode: 500,
        message: 'LLM 服务调用失败',
      });
    });
  });

  describe('其他端点', () => {
    it('resumeAgent 调 POST /agents/:id/resume', async () => {
      mockRequest.mockResolvedValueOnce({ data: { ok: true } });
      await llmService.resumeAgent('a1');
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/agents/a1/resume',
        }),
      );
    });

    it('interruptAgent 调 POST /agents/:id/interrupt', async () => {
      mockRequest.mockResolvedValueOnce({ data: { ok: true } });
      await llmService.interruptAgent('a1', 'abort');
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/agents/a1/interrupt',
        }),
      );
    });

    it('listModels 调 GET /llm/models', async () => {
      mockRequest.mockResolvedValueOnce({ data: [] });
      await llmService.listModels();
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/llm/models',
        }),
      );
    });

    it('ragQuery 调 POST /rag/query', async () => {
      mockRequest.mockResolvedValueOnce({ data: {} });
      await llmService.ragQuery({ query: 'q' });
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/rag/query',
        }),
      );
    });
  });
});
