import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// mock config：可控 isDev
vi.mock('../config', () => ({
  config: {
    isDev: true,
  },
}));

import { requestLogger } from './logger';
import { config } from '../config';

// 请求日志中间件测试
describe('middleware/logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('返回一个 RequestHandler 函数', () => {
    // 验证工厂函数返回值
    const handler = requestLogger();
    expect(typeof handler).toBe('function');
  });

  it('调用 next() 让请求继续', () => {
    // 中间件应透传给下一个中间件
    const handler = requestLogger();
    const req = { method: 'GET', originalUrl: '/' } as unknown as Request;
    const res = { on: vi.fn() } as unknown as Response;
    const next = vi.fn();
    handler(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('isDev=true 时响应结束打印日志', () => {
    // 开发环境应打印日志
    (config as { isDev: boolean }).isDev = true;
    const handler = requestLogger();
    const req = { method: 'GET', originalUrl: '/api' } as unknown as Request;
    const listeners: Record<string, () => void> = {};
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
    } as unknown as Response;
    handler(req, res, vi.fn());
    // 触发 finish 回调
    listeners['finish']();
    expect(console.log).toHaveBeenCalled();
    const logMsg = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(logMsg).toContain('GET');
    expect(logMsg).toContain('/api');
    expect(logMsg).toContain('200');
  });

  it('isDev=false 时不打印日志', () => {
    // 生产环境不打印
    (config as { isDev: boolean }).isDev = false;
    const handler = requestLogger();
    const req = { method: 'GET', originalUrl: '/api' } as unknown as Request;
    const listeners: Record<string, () => void> = {};
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
    } as unknown as Response;
    handler(req, res, vi.fn());
    listeners['finish']();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('状态码 ≥400 时日志级别为 WARN', () => {
    // 错误响应应使用 WARN 级别
    (config as { isDev: boolean }).isDev = true;
    const handler = requestLogger();
    const req = { method: 'POST', originalUrl: '/x' } as unknown as Request;
    const listeners: Record<string, () => void> = {};
    const res = {
      statusCode: 500,
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
    } as unknown as Response;
    handler(req, res, vi.fn());
    listeners['finish']();
    const logMsg = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(logMsg).toContain('WARN');
  });
});
