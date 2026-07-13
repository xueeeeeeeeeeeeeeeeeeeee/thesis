import type { Request, Response, NextFunction } from 'express';
import { fail } from '../utils/response';
import { ApiError } from '../types';

/**
 * 全局错误处理中间件
 * 统一捕获控制器抛出的异常，返回 { code: -1, message, data: null }
 *
 * - 4xx 类错误（业务错误）使用 ApiError.statusCode
 * - 其他未知错误统一 500
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // 已知业务错误
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(fail(err.message, err.code));
    return;
  }

  // Express 路由参数校验错误（带有 status 字段）
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    const e = err as { status: number; message?: string };
    const status = e.status >= 400 && e.status < 600 ? e.status : 400;
    res.status(status).json(fail(e.message ?? '请求参数错误', -1));
    return;
  }

  // 未知错误
  const message = err instanceof Error ? err.message : '服务器内部错误';
  console.error('[errorHandler] 未捕获错误:', err);
  res.status(500).json(fail(message, -1));
}

/**
 * 404 处理中间件
 * 所有未匹配到路由的请求返回 404
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(fail(`找不到路由: ${req.method} ${req.originalUrl}`, -1));
}
