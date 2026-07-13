import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from './jwt';
import { config } from '../config';
import type { User } from '../types';

// JWT 工具测试
describe('utils/jwt', () => {
  const baseUser: User = {
    id: 'user-uuid-123',
    email: 'alice@example.com',
    username: 'alice',
    passwordHash: 'not-a-real-hash',
    role: 'user',
    discipline: '计算机科学',
    apiKeys: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  describe('signToken', () => {
    it('返回字符串且包含 3 段以 . 分隔', () => {
      // JWT 标准格式：header.payload.signature
      const token = signToken(baseUser);
      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('payload 包含 userId / email / role', () => {
      // 验证签发的 token 中 payload 字段
      const token = signToken(baseUser);
      const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
      expect(decoded.userId).toBe(baseUser.id);
      expect(decoded.email).toBe(baseUser.email);
      expect(decoded.role).toBe(baseUser.role);
    });
  });

  describe('verifyToken', () => {
    it('返回 payload 含 userId / email / role', () => {
      // 验证 verifyToken 解出 payload
      const token = signToken(baseUser);
      const payload = verifyToken(token);
      expect(payload.userId).toBe(baseUser.id);
      expect(payload.email).toBe(baseUser.email);
      expect(payload.role).toBe(baseUser.role);
    });

    it('篡改的 token 抛错', () => {
      // 验证签名校验失败时抛出
      const token = signToken(baseUser);
      const tampered = token.slice(0, -4) + 'AAAA';
      expect(() => verifyToken(tampered)).toThrow();
    });

    it('使用错误密钥签发的 token 抛错', () => {
      // 验证密钥不匹配时抛出
      const token = jwt.sign({ userId: 'x' }, 'wrong-secret');
      expect(() => verifyToken(token)).toThrow();
    });

    it('过期 token 抛错', () => {
      // 直接签发一个已过期的 token
      const expired = jwt.sign(
        { userId: baseUser.id, email: baseUser.email, role: baseUser.role },
        config.jwtSecret,
        { expiresIn: '-1s' },
      );
      expect(() => verifyToken(expired)).toThrow();
    });

    it('非 token 字符串抛错', () => {
      // 完全非 token 的输入
      expect(() => verifyToken('not-a-token')).toThrow();
    });

    it('空字符串抛错', () => {
      // 空字符串入参
      expect(() => verifyToken('')).toThrow();
    });
  });

  describe('signToken 与 verifyToken 的往返', () => {
    it('签发后立即校验应得到原 payload', () => {
      // 端到端往返：sign → verify 字段一致
      const token = signToken(baseUser);
      const payload = verifyToken(token);
      expect(payload).toMatchObject({
        userId: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
    });
  });
});
