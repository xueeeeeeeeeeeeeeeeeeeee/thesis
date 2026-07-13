import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from './errorHandler';
import { ApiError } from '../types';

// 错误处理中间件测试
describe('middleware/errorHandler', () => {
  function makeRes() {
    const res: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    return res as Response;
  }
  const req = {} as Request;
  const next = vi.fn() as unknown as NextFunction;

  describe('errorHandler', () => {
    it('ApiError 使用其 statusCode 和 message', () => {
      // 已知业务错误透传 statusCode
      const err = new ApiError('未找到', 404, 100);
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        code: 100,
        data: null,
        message: '未找到',
      });
    });

    it('ApiError 默认 code=-1', () => {
      // 不传 code 时 ApiError 默认 -1
      const err = new ApiError('出错了', 500);
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        data: null,
        message: '出错了',
      });
    });

    it('{status:400, message:"bad"} 透传 status', () => {
      // Express 风格错误对象（带 status 字段）
      const err = { status: 400, message: 'bad' };
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        data: null,
        message: 'bad',
      });
    });

    it('status 不在 400-599 范围时退回 400', () => {
      // 越界 status 兜底为 400
      const err = { status: 999, message: 'x' };
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('status 字段非数字时跳过该分支走 500', () => {
      // status 是字符串等非数字
      const err = { status: 'oops', message: 'x' };
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('未知 Error 返回 500', () => {
      // 普通 Error 走兜底分支
      const err = new Error('unknown');
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        data: null,
        message: 'unknown',
      });
    });

    it('非 Error 对象返回 500 + "服务器内部错误"', () => {
      // 字符串错误等
      const res = makeRes();
      errorHandler('just a string', req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        data: null,
        message: '服务器内部错误',
      });
    });

    it('带 status 但无 message 时使用默认"请求参数错误"', () => {
      // status 错误对象缺 message
      const err = { status: 422 };
      const res = makeRes();
      errorHandler(err, req, res, next);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        data: null,
        message: '请求参数错误',
      });
    });
  });

  describe('notFoundHandler', () => {
    it('返回 404 含方法和 URL', () => {
      // 未匹配路由返回 404
      const req = {
        method: 'GET',
        originalUrl: '/api/unknown',
      } as unknown as Request;
      const res = makeRes();
      notFoundHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        data: null,
        message: '找不到路由: GET /api/unknown',
      });
    });

    it('POST 请求也正确反映方法', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/foo',
      } as unknown as Request;
      const res = makeRes();
      notFoundHandler(req, res);
      const call = res.json.mock.calls[0][0];
      expect(call.message).toContain('POST /api/foo');
    });
  });
});
