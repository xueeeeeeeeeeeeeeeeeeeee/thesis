import type { RequestHandler } from 'express';
import { userService } from '../services/userService';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../types';
import type { AuthRequest } from '../types';

/**
 * 认证中间件集合
 *
 * 注意：userService 的方法均为 async（MySQL 持久化），
 * 因此中间件也是 async，错误用 try/catch 转 next(err) 传递给 errorHandler。
 */

/** 从 Authorization 头解析 Bearer token */
function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

/**
 * 强制认证：解析 token 并挂载 req.user
 * 失败抛 401
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      throw new ApiError('未登录或令牌缺失', 401, -1);
    }
    const payload = verifyToken(token);
    const user = await userService.getById(payload.userId);
    (req as AuthRequest).user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      next(err);
    } else {
      next(new ApiError('令牌无效或已过期', 401, -1));
    }
  }
};

/**
 * 可选认证：同 authenticate 但失败不报错，req.user 为 undefined
 */
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      next();
      return;
    }
    const payload = verifyToken(token);
    const user = await userService.getById(payload.userId);
    (req as AuthRequest).user = user;
    next();
  } catch {
    // 失败不报错，按未登录处理
    next();
  }
};

/**
 * 管理员权限校验：必须在 authenticate 之后使用
 * 非 admin 抛 403
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    next(new ApiError('未登录', 401, -1));
    return;
  }
  if (user.role !== 'admin') {
    next(new ApiError('需要管理员权限', 403, -1));
    return;
  }
  next();
};
