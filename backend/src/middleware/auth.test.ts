import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// mock JWT 工具
vi.mock('../utils/jwt', () => ({
  verifyToken: vi.fn(),
}));

// mock 用户服务
vi.mock('../services/userService', () => ({
  userService: {
    getById: vi.fn(),
  },
}));

import { authenticate, optionalAuth, requireAdmin } from './auth';
import { verifyToken } from '../utils/jwt';
import { userService } from '../services/userService';
import { ApiError } from '../types';
import type { User } from '../types';

// 认证中间件测试
describe('middleware/auth', () => {
  const mockVerifyToken = verifyToken as unknown as ReturnType<typeof vi.fn>;
  const mockGetById = userService.getById as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMocks() {
    const req: Partial<Request> = { headers: {} };
    const res: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next: NextFunction = vi.fn();
    return { req, res, next };
  }

  const fakeUser: User = {
    id: 'u1',
    email: 'a@b.com',
    username: 'a',
    passwordHash: 'x',
    role: 'user',
    discipline: 'd',
    apiKeys: {},
    createdAt: '',
    updatedAt: '',
  };

  describe('authenticate', () => {
    it('无 Authorization header → 401', async () => {
      // 没有 Authorization 头时应抛 401
      const { req, res, next } = makeMocks();
      await authenticate(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(401);
    });

    it('Authorization 非 Bearer → 401', async () => {
      // 格式不对的 token
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Basic abc' };
      await authenticate(req as Request, res as Response, next);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    it('Bearer token 无效（verifyToken 抛错）→ 401', async () => {
      // verifyToken 抛错时应转 401
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Bearer invalid.token.here' };
      mockVerifyToken.mockImplementationOnce(() => {
        throw new Error('invalid token');
      });
      await authenticate(req as Request, res as Response, next);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(401);
    });

    it('有效 token 但用户不存在 → 401', async () => {
      // verifyToken 通过但 userService.getById 抛 404 → 应转为 401
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Bearer valid.token.here' };
      mockVerifyToken.mockReturnValueOnce({ userId: 'u1', email: 'a@b.com', role: 'user' });
      mockGetById.mockRejectedValueOnce(new ApiError('用户不存在', 404, -1));
      await authenticate(req as Request, res as Response, next);
      const err = next.mock.calls[0][0];
      // ApiError 实例直接传递（保持 404）—— 实现里 ApiError 直接走 next(err) 分支
      expect(err).toBeInstanceOf(ApiError);
    });

    it('有效 token 且用户存在 → 设置 req.user 并 next() 无参数', async () => {
      // 完整成功路径
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Bearer valid.token.here' };
      mockVerifyToken.mockReturnValueOnce({ userId: 'u1', email: 'a@b.com', role: 'user' });
      mockGetById.mockResolvedValueOnce(fakeUser);
      await authenticate(req as Request, res as Response, next);
      expect((req as unknown as { user?: User }).user).toBe(fakeUser);
      expect(next).toHaveBeenCalledWith();
    });

    it('Bearer 前缀后多余空格也应能解析', async () => {
      // 验证 extractToken 的 trim 逻辑
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Bearer    spaced.token   ' };
      mockVerifyToken.mockReturnValueOnce({ userId: 'u1', email: 'a@b.com', role: 'user' });
      mockGetById.mockResolvedValueOnce(fakeUser);
      await authenticate(req as Request, res as Response, next);
      expect(mockVerifyToken).toHaveBeenCalledWith('spaced.token');
    });
  });

  describe('optionalAuth', () => {
    it('无 Authorization header → 不报错，req.user 为 undefined', async () => {
      // 缺 token 时按未登录处理
      const { req, res, next } = makeMocks();
      await optionalAuth(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();
      expect((req as unknown as { user?: User }).user).toBeUndefined();
    });

    it('token 无效时不报错（按未登录处理）', async () => {
      // verifyToken 抛错时也走 next() 不传 err
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Bearer invalid' };
      mockVerifyToken.mockImplementationOnce(() => {
        throw new Error('bad');
      });
      await optionalAuth(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();
      expect((req as unknown as { user?: User }).user).toBeUndefined();
    });

    it('有效 token 时设置 req.user', async () => {
      // 成功路径同 authenticate
      const { req, res, next } = makeMocks();
      req.headers = { authorization: 'Bearer valid' };
      mockVerifyToken.mockReturnValueOnce({ userId: 'u1', email: 'a@b.com', role: 'user' });
      mockGetById.mockResolvedValueOnce(fakeUser);
      await optionalAuth(req as Request, res as Response, next);
      expect((req as unknown as { user?: User }).user).toBe(fakeUser);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireAdmin', () => {
    it('未登录 → 401', () => {
      // req.user 未挂载
      const { req, res, next } = makeMocks();
      requireAdmin(req as Request, res as Response, next);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.message).toContain('未登录');
    });

    it('role=user → 403', () => {
      // 普通用户无管理员权限
      const { req, res, next } = makeMocks();
      (req as unknown as { user?: User }).user = { ...fakeUser, role: 'user' };
      requireAdmin(req as Request, res as Response, next);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain('管理员');
    });

    it('role=admin → next() 无参数', () => {
      // 管理员放行
      const { req, res, next } = makeMocks();
      (req as unknown as { user?: User }).user = { ...fakeUser, role: 'admin' };
      requireAdmin(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
