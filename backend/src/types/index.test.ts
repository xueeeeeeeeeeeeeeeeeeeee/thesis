import { describe, it, expect, vi } from 'vitest';
import { asyncHandler, ApiError, STAGE_ORDER } from './index';
import type { Request, Response, NextFunction } from 'express';

// 类型定义集合测试
describe('types/index', () => {
  describe('STAGE_ORDER', () => {
    it('包含 8 个阶段', () => {
      // 8 阶段流水线
      expect(STAGE_ORDER).toHaveLength(8);
    });

    it('顺序正确', () => {
      // 与 LLM 服务对齐的 8 阶段顺序
      expect(STAGE_ORDER).toEqual([
        'literature',
        'design',
        'experiment',
        'evaluate',
        'discuss',
        'write',
        'figure',
        'submit',
      ]);
    });

    it('首阶段为 literature', () => {
      // 项目创建时初始阶段
      expect(STAGE_ORDER[0]).toBe('literature');
    });

    it('末阶段为 submit', () => {
      // 流水线终点
      expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe('submit');
    });
  });

  describe('ApiError', () => {
    it('默认 statusCode=500, code=-1', () => {
      // 仅传 message 时使用默认值
      const err = new ApiError('出错了');
      expect(err.message).toBe('出错了');
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe(-1);
      expect(err.name).toBe('ApiError');
      expect(err instanceof Error).toBe(true);
    });

    it('可指定 statusCode 和 code', () => {
      // 完整构造参数
      const err = new ApiError('未找到', 404, 100);
      expect(err.message).toBe('未找到');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe(100);
    });

    it('可只指定 statusCode（code 默认 -1）', () => {
      // 省略 code 时使用默认 -1
      const err = new ApiError('禁止访问', 403);
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe(-1);
    });
  });

  describe('asyncHandler', () => {
    it('fn resolve 时不调用 next（由 fn 自行处理响应或调 next）', async () => {
      // 实现：Promise.resolve(fn()).catch(next)
      // fn 正常 resolve 时 catch 不触发，next 不被调用
      const req = {} as Request;
      const res = {} as Response;
      const next = vi.fn();
      const handler = asyncHandler(async () => {
        // 模拟异步操作，但不调用 next
        await Promise.resolve();
      });
      handler(req, res, next);
      // 等待微任务队列清空
      await new Promise((r) => setImmediate(r));
      expect(next).not.toHaveBeenCalled();
    });

    it('fn reject 时调用 next(err)', async () => {
      // 异步处理器抛错时，错误应传给 next
      const req = {} as Request;
      const res = {} as Response;
      const next = vi.fn();
      const error = new Error('async fail');
      const handler = asyncHandler(async () => {
        await Promise.resolve();
        throw error;
      });
      handler(req, res, next);
      await new Promise((r) => setImmediate(r));
      expect(next).toHaveBeenCalledWith(error);
    });

    it('fn 同步返回非 Promise 时也正确处理（不调用 next）', async () => {
      // 同步处理器（非 async 函数）也应被 Promise.resolve 包装
      // 返回非 Promise 时 resolve，catch 不触发
      const req = {} as Request;
      const res = {} as Response;
      const next = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = asyncHandler(((): any => 'sync-value') as any);
      handler(req, res, next);
      await new Promise((r) => setImmediate(r));
      expect(next).not.toHaveBeenCalled();
    });
  });
});
