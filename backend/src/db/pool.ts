import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import { config } from '../config';

/**
 * MySQL 连接池
 *
 * 全局共享一个池，所有 service 通过 db.query() / db.execute() 访问。
 * 池化避免每次请求建立 TCP 连接，提升吞吐量。
 */

const poolOptions: PoolOptions = {
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: config.mysql.connectionLimit,
  queueLimit: 0,
  connectTimeout: config.mysql.connectTimeout,
  // 启用 prepared statement 缓存（防 SQL 注入 + 提升性能）
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // 时区设为 UTC，应用层用 ISO 字符串
  timezone: 'Z',
  // 字符集
  charset: 'utf8mb4',
};

export const pool: Pool = mysql.createPool(poolOptions);

/**
 * 执行查询（参数化）。
 * 用法：
 *   const rows = await query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
 */
export async function query<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [result] = await pool.query(sql, params as any[]);
  return result as T;
}

/**
 * 执行预编译语句（推荐用于单条 INSERT/UPDATE/DELETE）。
 * 返回 [rows, fields]。
 */
export async function execute<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [result] = await pool.execute(sql, params as any[]);
  return result as T;
}

/** 测试连接（启动时调用），失败抛错 */
export async function ping(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/** 关闭连接池（优雅退出时调用） */
export async function closePool(): Promise<void> {
  await pool.end();
}
