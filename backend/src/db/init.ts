import fs from 'fs';
import path from 'path';
import { pool, ping, closePool } from './pool';

/**
 * 数据库初始化
 *
 * 启动时调用：
 *  1. ping 检查连通性
 *  2. 执行 schema.sql 自动建表（IF NOT EXISTS 幂等）
 *
 * 失败时抛错，由上层 main() 决定是否继续启动（默认：MySQL 不可用则退出）。
 */
export async function initDatabase(): Promise<void> {
  console.log('[db] 正在连接 MySQL...');
  await ping();
  console.log('[db] MySQL 连接正常');

  console.log('[db] 执行 schema 初始化...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // mysql2 不直接支持多语句执行，需要按分号拆分。
  // 关键：必须先按行去掉 -- 注释，否则以注释开头的语句块会被整体过滤掉。
  const cleanedSql = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleanedSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await pool.query(stmt);
  }
  console.log(`[db] schema 初始化完成（执行 ${statements.length} 条语句）`);
}

/** 优雅关闭连接池（应用退出时调用） */
export async function closeDatabase(): Promise<void> {
  await closePool();
  console.log('[db] 连接池已关闭');
}
