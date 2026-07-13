import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 提升 mock 引用，避免 vi.mock 工厂引用顶层变量时报错
const { mockPing, mockPoolQuery, mockClosePool } = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockClosePool: vi.fn(),
}));

// mock ./pool：拦截 ping 与 pool.query
vi.mock('./pool', () => ({
  pool: { query: mockPoolQuery },
  ping: mockPing,
  closePool: mockClosePool,
}));

// mock fs：让 readFileSync 返回可控内容
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

import fs from 'fs';
import { initDatabase, closeDatabase } from './init';
import { pool } from './pool';

// 数据库初始化测试
describe('db/init', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPing.mockResolvedValue(undefined);
    mockPoolQuery.mockResolvedValue([{ affectedRows: 0 }]);
  });

  describe('initDatabase', () => {
    it('先调用 ping 检查连通性', async () => {
      // 验证 ping 在 schema 执行前被调用
      const schemaSql = '-- 注释\nCREATE TABLE x;';
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);
      await initDatabase();
      expect(mockPing).toHaveBeenCalled();
    });

    it('读取 schema.sql 后剥离 -- 注释行', async () => {
      // 关键测试：注释行不应作为语句执行
      const schemaSql = [
        '-- 这是注释行',
        'CREATE TABLE users (id INT);',
        '-- 另一段注释',
        'CREATE TABLE projects (id INT);',
      ].join('\n');
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);

      await initDatabase();

      // 收集所有被执行的 SQL（去掉空白）
      const executedSqls = mockPoolQuery.mock.calls.map(
        (c: unknown[]) => (c[0] as string).trim(),
      );
      // 不应执行注释
      executedSqls.forEach((sql) => {
        expect(sql.startsWith('--')).toBe(false);
      });
      // 应执行两条 CREATE TABLE
      expect(executedSqls).toContainEqual('CREATE TABLE users (id INT)');
      expect(executedSqls).toContainEqual('CREATE TABLE projects (id INT)');
    });

    it('按分号拆分并执行非空语句', async () => {
      // 多条语句用 ; 拆分
      const schemaSql = 'SELECT 1;\nSELECT 2;\nSELECT 3;';
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);
      await initDatabase();
      // 三条非空语句应被执行
      expect(mockPoolQuery).toHaveBeenCalledTimes(3);
      const executed = mockPoolQuery.mock.calls.map(
        (c: unknown[]) => (c[0] as string).trim(),
      );
      expect(executed).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3']);
    });

    it('空语句被过滤掉', async () => {
      // 连续分号 / 末尾多余分号产生的空语句不应执行
      const schemaSql = 'SELECT 1;;;\n;\nSELECT 2;';
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);
      await initDatabase();
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('注释行被剥离后不会让整段语句被吞掉', async () => {
      // 防回归：注释开头时，后续 CREATE 不应被吞掉
      const schemaSql = '-- 文件头注释\nCREATE TABLE a (id INT);\nCREATE TABLE b (id INT);';
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);
      await initDatabase();
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('行内尾随注释不会被剥离（只过滤整行 -- 开头）', async () => {
      // 当前实现只过滤以 -- 开头的整行；行内 -- 不处理
      const schemaSql = 'CREATE TABLE a (id INT) -- 行内注释\n;';
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);
      await initDatabase();
      // 一条语句（包含行内注释 + 换行 + ;）
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      const executed = (mockPoolQuery.mock.calls[0][0] as string).trim();
      expect(executed).toContain('CREATE TABLE a');
    });

    it('ping 失败时抛出错误（不执行 schema）', async () => {
      // 连接失败应直接抛错，不读取 schema（不设置 readFileSync mock，避免污染后续测试）
      mockPing.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(initDatabase()).rejects.toThrow('ECONNREFUSED');
      // 失败后不应执行任何 schema 语句
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('执行语句数量正确', async () => {
      // 验证日志中提到的语句数量与实际执行数量一致
      const schemaSql = 'A;\nB;\nC;\nD;\nE;';
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(schemaSql);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await initDatabase();
      // 找到含"schema 初始化完成"的日志
      const completionLog = consoleSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('schema 初始化完成'),
      );
      expect(completionLog).toBeDefined();
      expect(completionLog![0]).toContain('5 条语句');
      consoleSpy.mockRestore();
    });
  });

  describe('closeDatabase', () => {
    it('调用 closePool', async () => {
      // 验证关闭流程
      mockClosePool.mockResolvedValueOnce(undefined);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await closeDatabase();
      expect(mockClosePool).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('pool mock 自检', () => {
    it('pool.query 与 mockPoolQuery 是同一引用', () => {
      // 防御：确保 mock 正确替换
      expect(pool.query).toBe(mockPoolQuery);
    });
  });
});
