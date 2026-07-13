import { Router } from 'express';
import type { Response } from 'express';
import { userService } from '../services/userService';
import { signToken } from '../utils/jwt';
import { authenticate, requireAdmin } from '../middleware/auth';
import { success } from '../utils/response';
import { ApiError, asyncHandler } from '../types';
import type {
  AuthRequest,
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  UpdateUserInput,
} from '../types';

/**
 * 认证路由
 * 挂载前缀: /api/auth
 *
 * POST   /register       注册
 * POST   /login          登录
 * GET    /me             获取当前用户
 * PATCH  /me             更新当前用户
 * POST   /me/password    修改密码
 * POST   /logout         登出
 * GET    /users          用户列表（管理员）
 */
const router: Router = Router();

/** POST /register 注册 */
router.post(
  '/register',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, username, password, discipline } = req.body as RegisterInput;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new ApiError('邮箱(email)格式不正确', 400, -1);
    }
    if (!username || typeof username !== 'string' || !username.trim()) {
      throw new ApiError('用户名(username)不能为空', 400, -1);
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new ApiError('密码(password)至少 6 位', 400, -1);
    }

    const user = await userService.register({
      email: email.trim().toLowerCase(),
      username: username.trim(),
      password,
      discipline: typeof discipline === 'string' && discipline.trim() ? discipline.trim() : '综合',
    });
    const token = signToken(user);
    res.status(201).json(success({ token, user: userService.toSafeUser(user) }, '注册成功'));
  }),
);

/** POST /login 登录 */
router.post(
  '/login',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, password } = req.body as LoginInput;
    if (!email || !password) {
      throw new ApiError('邮箱或密码错误', 401, -1);
    }
    const user = await userService.validatePassword({
      email: email.trim().toLowerCase(),
      password,
    });
    const token = signToken(user);
    res.json(success({ token, user: userService.toSafeUser(user) }, '登录成功'));
  }),
);

/** GET /me 获取当前用户（apiKeys 掩码） */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const safe = userService.toSafeUser(user);
    safe.apiKeys = userService.maskApiKeys(user.apiKeys);
    res.json(success({ user: safe }, '获取当前用户成功'));
  }),
);

/** PATCH /me 更新当前用户 */
router.patch(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const input = req.body as UpdateUserInput;
    const updated = await userService.update(user.id, input);
    res.json(success({ user: userService.toSafeUser(updated) }, '更新用户成功'));
  }),
);

/** POST /me/password 修改密码 */
router.post(
  '/me/password',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { oldPassword, newPassword } = req.body as ChangePasswordInput;
    if (!oldPassword || !newPassword) {
      throw new ApiError('原密码与新密码均不能为空', 400, -1);
    }
    if (newPassword.length < 6) {
      throw new ApiError('新密码至少 6 位', 400, -1);
    }
    await userService.changePassword(user.id, { oldPassword, newPassword });
    res.json(success({ success: true }, '修改密码成功'));
  }),
);

/** POST /logout 登出（JWT 无状态，前端删除 token 即可） */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(success({ success: true }, '登出成功'));
  }),
);

/** GET /users 用户列表（仅管理员） */
router.get(
  '/users',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const users = await userService.list();
    res.json(success({ users }, '获取用户列表成功'));
  }),
);

export default router;
