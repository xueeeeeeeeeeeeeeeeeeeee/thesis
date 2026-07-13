import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../config';

/**
 * 请求日志中间件
 * 记录每个请求的方法、路径、耗时与状态码
 */
export function requestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    const { method, originalUrl } = req;

    // 响应结束时记录
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const level = statusCode >= 400 ? 'WARN' : 'INFO';
      if (config.isDev) {
        console.log(`[${level}] ${method} ${originalUrl} ${statusCode} ${duration}ms`);
      }
    });

    next();
  };
}
