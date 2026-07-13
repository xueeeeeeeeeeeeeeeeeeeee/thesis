import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import router from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';

/**
 * 创建并配置 Express 应用
 */
export function createApp(): Express {
  const app = express();

  // 安全头
  app.use(helmet());

  // CORS：允许前端访问
  app.use(
    cors({
      origin: [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Id'],
    }),
  );

  // 请求日志（开发环境用 dev 格式）
  app.use(morgan('dev'));

  // JSON body 解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 自定义请求日志
  app.use(requestLogger());

  // 路由挂载
  app.use(router);

  // 404 处理
  app.use(notFoundHandler);

  // 全局错误处理（必须放在最后）
  app.use(errorHandler);

  return app;
}
