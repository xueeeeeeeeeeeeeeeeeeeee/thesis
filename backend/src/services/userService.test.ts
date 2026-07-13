import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock 数据库访问层
vi.mock('../db/pool', () => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

// mock bcryptjs：哈希与比对都直接返回可预测值
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { query } from '../db/pool';
import bcrypt from 'bcryptjs';
import { userService } from './userService';
import { ApiError } from '../types';
import type { User } from '../types';

// 用户服务测试
describe('services/userService', () => {
  const mockQuery = query as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    (bcrypt.hash as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-password');
    (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  // 构造一个完整的数据库行（snake_case）
  function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      id: 'u1',
      email: 'alice@example.com',
      username: 'alice',
      password_hash: 'hashed-password',
      avatar: null,
      role: 'user',
      discipline: '计算机科学',
      api_keys: JSON.stringify({}),
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  function makeUser(overrides: Partial<User> = {}): User {
    return {
      id: 'u1',
      email: 'alice@example.com',
      username: 'alice',
      passwordHash: 'hashed-password',
      avatar: undefined,
      role: 'user',
      discipline: '计算机科学',
      apiKeys: {},
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  // ─────────────── 纯函数 ───────────────

  describe('toSafeUser', () => {
    it('剥离 passwordHash', () => {
      // 脱敏后不应包含 passwordHash 字段
      const safe = userService.toSafeUser(makeUser());
      expect(safe).not.toHaveProperty('passwordHash');
      expect(safe.id).toBe('u1');
      expect(safe.email).toBe('alice@example.com');
    });

    it('保留其他字段', () => {
      // 验证其他字段完整保留
      const safe = userService.toSafeUser(makeUser({ role: 'admin', discipline: '物理' }));
      expect(safe.role).toBe('admin');
      expect(safe.discipline).toBe('物理');
      expect(safe.apiKeys).toEqual({});
    });

    it('apiKeys 是副本而非原引用', () => {
      // 防御性测试：返回的 apiKeys 不应是原对象引用
      const user = makeUser({ apiKeys: { deepseek: 'sk-xxx' } });
      const safe = userService.toSafeUser(user);
      expect(safe.apiKeys).toEqual({ deepseek: 'sk-xxx' });
      safe.apiKeys.deepseek = 'modified';
      expect(user.apiKeys.deepseek).toBe('sk-xxx');
    });
  });

  describe('maskApiKeys', () => {
    it('长 key 返回前 3 + *** + 后 4', () => {
      // 标准 mask：sk-***7890
      const masked = userService.maskApiKeys({ deepseek: 'sk-1234567890' });
      expect(masked.deepseek).toBe('sk-***7890');
    });

    it('短 key（≤6）返回 ***', () => {
      // 太短的 key 完全隐藏
      const masked = userService.maskApiKeys({ deepseek: 'short' });
      expect(masked.deepseek).toBe('***');
    });

    it('长度刚好 6 也返回 ***', () => {
      // 边界情况：长度等于 6
      const masked = userService.maskApiKeys({ deepseek: '123456' });
      expect(masked.deepseek).toBe('***');
    });

    it('长度刚好 7 返回前 3 + *** + 后 4', () => {
      // 边界情况：长度等于 7
      const masked = userService.maskApiKeys({ deepseek: '1234567' });
      expect(masked.deepseek).toBe('123***4567');
    });

    it('空对象返回全 undefined', () => {
      // 空 apiKeys 输入
      const masked = userService.maskApiKeys({});
      expect(masked.deepseek).toBeUndefined();
      expect(masked.kimi).toBeUndefined();
      expect(masked.qwen).toBeUndefined();
    });

    it('undefined / 缺失字段也返回 undefined', () => {
      // 单字段输入
      const masked = userService.maskApiKeys({ deepseek: 'sk-1234567890' });
      expect(masked.kimi).toBeUndefined();
      expect(masked.qwen).toBeUndefined();
    });

    it('多 key 同时 mask', () => {
      // 多个 LLM key 同时处理
      const masked = userService.maskApiKeys({
        deepseek: 'sk-deepseek-abcdef',
        kimi: 'kimi-key-1234',
        qwen: 'qwen-abc-9999',
      });
      expect(masked.deepseek).toBe('sk-***cdef');
      expect(masked.kimi).toBe('kim***1234');
      expect(masked.qwen).toBe('qwe***9999');
    });
  });

  // ─────────────── 业务方法 ───────────────

  describe('list', () => {
    it('返回脱敏用户列表', async () => {
      // 验证 list 调用 query 并对结果脱敏
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'u1' }), makeRow({ id: 'u2', email: 'b@x.com' })]);
      const list = await userService.list();
      expect(list).toHaveLength(2);
      list.forEach((u) => {
        expect(u).not.toHaveProperty('passwordHash');
      });
      expect(list[0].id).toBe('u1');
      expect(list[1].email).toBe('b@x.com');
    });

    it('空表返回空数组', async () => {
      // 数据库无数据
      mockQuery.mockResolvedValueOnce([]);
      const list = await userService.list();
      expect(list).toEqual([]);
    });
  });

  describe('getById', () => {
    it('存在时返回 User', async () => {
      // 找到时返回完整实体（含 passwordHash）
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'u1' })]);
      const user = await userService.getById('u1');
      expect(user.id).toBe('u1');
      expect(user.passwordHash).toBe('hashed-password');
    });

    it('不存在时抛 ApiError(404)', async () => {
      // 找不到时抛 404（仅设置一次 mock，避免污染后续测试）
      mockQuery.mockResolvedValueOnce([]);
      try {
        await userService.getById('missing');
        expect.fail('应抛出 ApiError(404)');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).statusCode).toBe(404);
        expect((e as ApiError).code).toBe(-1);
      }
    });
  });

  describe('getByEmail', () => {
    it('邮箱自动 toLowerCase', async () => {
      // 验证查询前 lowercase
      mockQuery.mockResolvedValueOnce([makeRow({ email: 'alice@example.com' })]);
      await userService.getByEmail('ALICE@EXAMPLE.COM');
      const args = mockQuery.mock.calls[0];
      // 第二个参数是 SQL params 数组，第一个元素应为小写邮箱
      expect(args[1]).toEqual(['alice@example.com']);
    });

    it('找不到返回 null', async () => {
      // 邮箱不存在
      mockQuery.mockResolvedValueOnce([]);
      const user = await userService.getByEmail('nobody@x.com');
      expect(user).toBeNull();
    });
  });

  describe('register', () => {
    it('邮箱已存在抛 409', async () => {
      // 通过 getByEmail 返回已存在用户触发 409
      mockQuery.mockResolvedValueOnce([makeRow()]); // getByEmail
      await expect(
        userService.register({
          email: 'alice@example.com',
          username: 'alice',
          password: 'pwd',
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('注册成功插入并返回 User', async () => {
      // 注册流程：getByEmail 返回空 → bcrypt.hash → query INSERT → getById 返回用户
      mockQuery.mockResolvedValueOnce([]); // getByEmail
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'new-id' })]); // getById
      const user = await userService.register({
        email: 'NEW@Example.com',
        username: 'newuser',
        password: 'pwd',
      });
      expect(user.id).toBe('new-id');
      // 验证邮箱在 INSERT 时被小写
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1]).toContain('new@example.com');
    });
  });

  describe('validatePassword', () => {
    it('用户不存在抛 401', async () => {
      // 用户不存在
      mockQuery.mockResolvedValueOnce([]); // getByEmail
      await expect(
        userService.validatePassword({ email: 'x@y.com', password: 'pwd' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('密码错误抛 401', async () => {
      // 用户存在但密码比对失败
      mockQuery.mockResolvedValueOnce([makeRow()]); // getByEmail
      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      await expect(
        userService.validatePassword({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('密码正确返回 User', async () => {
      // 用户存在且密码正确
      mockQuery.mockResolvedValueOnce([makeRow()]);
      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      const user = await userService.validatePassword({
        email: 'alice@example.com',
        password: 'correct',
      });
      expect(user.email).toBe('alice@example.com');
    });
  });

  describe('changePassword', () => {
    it('原密码错误抛 400', async () => {
      // getById 返回用户但 compare 失败
      mockQuery.mockResolvedValueOnce([makeRow()]); // getById
      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      await expect(
        userService.changePassword('u1', { oldPassword: 'wrong', newPassword: 'new' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('原密码正确则更新并返回 User', async () => {
      // 完整流程：getById → compare=true → hash → UPDATE → getById
      mockQuery.mockResolvedValueOnce([makeRow()]); // getById
      (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE
      mockQuery.mockResolvedValueOnce([makeRow()]); // getById 再次
      const user = await userService.changePassword('u1', {
        oldPassword: 'old',
        newPassword: 'new',
      });
      expect(user.id).toBe('u1');
    });

    it('用户不存在时抛 404（在 compare 之前）', async () => {
      // getById 找不到用户
      mockQuery.mockResolvedValueOnce([]);
      await expect(
        userService.changePassword('missing', { oldPassword: 'x', newPassword: 'y' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('update', () => {
    it('apiKeys 浅合并（保留旧 key，覆盖同名字段）', async () => {
      // 验证 update 中 apiKeys 的合并逻辑
      const existingRow = makeRow({ api_keys: JSON.stringify({ deepseek: 'sk-old', kimi: 'kimi-old' }) });
      mockQuery.mockResolvedValueOnce([existingRow]); // getById
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE
      mockQuery.mockResolvedValueOnce([
        makeRow({ api_keys: JSON.stringify({ deepseek: 'sk-new', kimi: 'kimi-old' }) }),
      ]); // getById after update

      await userService.update('u1', { apiKeys: { deepseek: 'sk-new' } });

      // 检查 UPDATE 调用时的 api_keys 参数（应该是合并后的对象）
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      // api_keys 是第 4 个参数（基于 SQL：username, avatar, discipline, api_keys, updated_at, id）
      const apiKeysParam = JSON.parse(params[3] as string);
      expect(apiKeysParam).toEqual({ deepseek: 'sk-new', kimi: 'kimi-old' });
    });

    it('未传 apiKeys 时保留原值', async () => {
      // 不传 apiKeys 时使用原 user.apiKeys
      const existingRow = makeRow({ api_keys: JSON.stringify({ deepseek: 'sk-old' }) });
      mockQuery.mockResolvedValueOnce([existingRow]); // getById
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE
      mockQuery.mockResolvedValueOnce([existingRow]); // getById after update

      await userService.update('u1', { username: 'newname' });

      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      const apiKeysParam = JSON.parse(params[3] as string);
      expect(apiKeysParam).toEqual({ deepseek: 'sk-old' });
    });
  });

  describe('remove', () => {
    it('用户不存在抛 404', async () => {
      // getById 找不到
      mockQuery.mockResolvedValueOnce([]);
      await expect(userService.remove('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('用户存在时执行 DELETE', async () => {
      // getById → DELETE
      mockQuery.mockResolvedValueOnce([makeRow()]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await userService.remove('u1');
      // 验证 DELETE 调用
      const deleteCall = mockQuery.mock.calls[1];
      expect(deleteCall[0]).toContain('DELETE');
    });
  });
});
