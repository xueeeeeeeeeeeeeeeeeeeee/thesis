import dotenv from 'dotenv';

// 加载 .env 文件
dotenv.config();

/**
 * 全局配置对象
 * 集中管理所有环境变量，提供默认值与类型约束
 */
export const config = {
  /** 服务端口 */
  port: Number(process.env.PORT ?? 3001),
  /** 运行环境 */
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** 是否开发环境 */
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  /** 前端地址（用于 CORS） */
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  /** Python LLM 服务地址 */
  llmServiceUrl: process.env.LLM_SERVICE_URL ?? 'http://localhost:8000',
  /** JWT 签名密钥（生产环境必须通过环境变量覆盖） */
  jwtSecret: process.env.JWT_SECRET ?? 'rap-dev-secret-change-in-production',
  /** JWT 有效期 */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  /** 默认管理员邮箱（仅开发态，启动时种子用） */
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@rap.dev',
  /** 默认管理员密码（仅开发态，启动时种子用） */
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
  /** 服务名称 */
  serviceName: 'rap-backend',
  /** 服务版本 */
  version: '0.1.0',
  /** MySQL 数据库配置 */
  mysql: {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'rap',
    password: process.env.MYSQL_PASSWORD ?? 'rap_dev_pwd',
    database: process.env.MYSQL_DATABASE ?? 'rap',
    /** 连接池大小 */
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 10),
    /** 连接超时（毫秒） */
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT ?? 10_000),
  },
} as const;

export type AppConfig = typeof config;
