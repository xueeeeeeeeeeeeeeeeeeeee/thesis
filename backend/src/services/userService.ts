import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { ApiError } from '../types';
import { query } from '../db/pool';
import type {
  User,
  UserApiKeys,
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  UpdateUserInput,
} from '../types';

/**
 * 用户服务（MySQL 持久化版）
 * 密码使用 bcryptjs 哈希，重启后数据保留
 */

/** 脱敏后的用户结构（不含 passwordHash） */
export interface SafeUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  role: 'admin' | 'user';
  discipline: string;
  /** API Key 不脱敏，前端编辑用；展示时请使用 maskApiKeys */
  apiKeys: UserApiKeys;
  createdAt: string;
  updatedAt: string;
}

/** bcrypt 加盐轮数 */
const BCRYPT_SALT_ROUNDS = 10;

/** 数据库行结构 */
interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  avatar: string | null;
  role: 'admin' | 'user';
  discipline: string;
  api_keys: unknown;
  created_at: Date;
  updated_at: Date;
}

/** 解析 JSON 列：兼容 mysql2 自动反序列化与原始字符串 */
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    if (value.length === 0) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/** 把数据库行转成 User 实体 */
function rowToUser(row: UserRow): User {
  const apiKeys = parseJsonColumn<UserApiKeys>(row.api_keys, {});
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    avatar: row.avatar ?? undefined,
    role: row.role,
    discipline: row.discipline,
    apiKeys,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

class UserService {
  /**
   * 启动时种子管理员账户
   * 仅在用户表为空时执行
   */
  async seedAdminIfEmpty(): Promise<void> {
    const rows = await query<UserRow[]>('SELECT id FROM users LIMIT 1');
    if (rows.length > 0) return;
    const passwordHash = await bcrypt.hash(config.adminPassword, BCRYPT_SALT_ROUNDS);
    const now = new Date();
    const id = uuidv4();
    await query(
      `INSERT INTO users (id, email, username, password_hash, role, discipline, api_keys, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        config.adminEmail.toLowerCase(),
        '管理员',
        passwordHash,
        'admin',
        '综合',
        JSON.stringify({}),
        now,
        now,
      ],
    );
    console.log(`[userService] 已种子管理员账户: ${config.adminEmail.toLowerCase()}`);
  }

  /** 获取全部用户列表（脱敏） */
  async list(): Promise<SafeUser[]> {
    const rows = await query<UserRow[]>(
      'SELECT * FROM users ORDER BY created_at DESC',
    );
    return rows.map((r) => this.toSafeUser(rowToUser(r)));
  }

  /** 根据 ID 获取用户（原始实体，含 passwordHash） */
  async getById(id: string): Promise<User> {
    const rows = await query<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      throw new ApiError(`用户不存在: ${id}`, 404, -1);
    }
    return rowToUser(rows[0]);
  }

  /** 根据邮箱获取用户，找不到返回 null */
  async getByEmail(email: string): Promise<User | null> {
    const rows = await query<UserRow[]>(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase()],
    );
    if (rows.length === 0) return null;
    return rowToUser(rows[0]);
  }

  /** 注册新用户，邮箱重复时抛 409 */
  async register(input: RegisterInput): Promise<User> {
    const existing = await this.getByEmail(input.email);
    if (existing) {
      throw new ApiError('该邮箱已被注册', 409, -1);
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
    const now = new Date();
    const id = uuidv4();
    await query(
      `INSERT INTO users (id, email, username, password_hash, role, discipline, api_keys, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.email.toLowerCase(),
        input.username,
        passwordHash,
        'user',
        input.discipline ?? '综合',
        JSON.stringify({}),
        now,
        now,
      ],
    );
    return this.getById(id);
  }

  /** 校验密码（登录），密码错误统一抛 401 "邮箱或密码错误" */
  async validatePassword(input: LoginInput): Promise<User> {
    const user = await this.getByEmail(input.email);
    if (!user) {
      throw new ApiError('邮箱或密码错误', 401, -1);
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new ApiError('邮箱或密码错误', 401, -1);
    }
    return user;
  }

  /** 修改密码，原密码错误抛 400 */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<User> {
    const user = await this.getById(userId);
    const ok = await bcrypt.compare(input.oldPassword, user.passwordHash);
    if (!ok) {
      throw new ApiError('原密码错误', 400, -1);
    }
    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
    await query(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newHash, new Date(), userId],
    );
    return this.getById(userId);
  }

  /** 更新用户配置（部分字段） */
  async update(userId: string, input: UpdateUserInput): Promise<User> {
    const user = await this.getById(userId);
    const newApiKeys = input.apiKeys
      ? { ...user.apiKeys, ...input.apiKeys }
      : user.apiKeys;
    await query(
      `UPDATE users
       SET username = ?, avatar = ?, discipline = ?, api_keys = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.username ?? user.username,
        input.avatar ?? user.avatar ?? null,
        input.discipline ?? user.discipline,
        JSON.stringify(newApiKeys),
        new Date(),
        userId,
      ],
    );
    return this.getById(userId);
  }

  /** 删除用户 */
  async remove(userId: string): Promise<void> {
    const user = await this.getById(userId); // 不存在会抛 404
    await query('DELETE FROM users WHERE id = ?', [user.id]);
  }

  /** 脱敏：去除 passwordHash，返回 SafeUser */
  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      discipline: user.discipline,
      apiKeys: { ...user.apiKeys },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /** 对 API Key 做掩码处理（如 sk-***xxxx），仅用于前端展示 */
  maskApiKeys(apiKeys: UserApiKeys): UserApiKeys {
    const mask = (key: string | undefined): string | undefined => {
      if (!key) return undefined;
      if (key.length <= 6) return '***';
      return `${key.slice(0, 3)}***${key.slice(-4)}`;
    };
    return {
      deepseek: mask(apiKeys.deepseek),
      kimi: mask(apiKeys.kimi),
      qwen: mask(apiKeys.qwen),
    };
  }
}

export const userService = new UserService();
