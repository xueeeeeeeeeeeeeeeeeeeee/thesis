import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { wsService } from './services/wsService';
import { userService } from './services/userService';

/**
 * 应用入口
 *
 * 职责：
 * 1. 创建 Express app
 * 2. 创建 HTTP server 并挂载 Express app
 * 3. 创建 WebSocketServer，与 HTTP server 共享同一端口
 * 4. 种子默认管理员账户（用户库为空时）
 * 5. 监听端口并打印启动日志
 *
 * 设计要点：
 * - 即使 Python LLM 服务未启动，本服务也能正常启动
 * - LLM 调用失败时返回友好错误，不影响进程运行
 */
async function main(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  // 初始化 WebSocket 服务（路径 /ws）
  wsService.init(server);

  // 启动时种子默认管理员账户（用户库为空时）
  await userService.seedAdminIfEmpty();

  // 监听端口
  server.listen(config.port, () => {
    console.log('');
    console.log('========================================================');
    console.log(`  ${config.serviceName} v${config.version} 已启动`);
    console.log('========================================================');
    console.log(`  环境:        ${config.nodeEnv}`);
    console.log(`  HTTP 地址:   http://localhost:${config.port}`);
    console.log(`  WebSocket:   ws://localhost:${config.port}/ws`);
    console.log(`  前端地址:    ${config.frontendUrl}`);
    console.log(`  LLM 服务:    ${config.llmServiceUrl}`);
    console.log('--------------------------------------------------------');
    console.log('  可用路由:');
    console.log(`    GET    /health                       健康检查`);
    console.log(`    POST   /api/auth/register            注册`);
    console.log(`    POST   /api/auth/login               登录`);
    console.log(`    GET    /api/auth/me                  当前用户`);
    console.log(`    PATCH  /api/auth/me                  更新用户`);
    console.log(`    POST   /api/auth/me/password         修改密码`);
    console.log(`    POST   /api/auth/logout              登出`);
    console.log(`    GET    /api/auth/users               用户列表(管理员)`);
    console.log(`    GET    /api/projects                 项目列表`);
    console.log(`    GET    /api/projects/:id             项目详情`);
    console.log(`    POST   /api/projects                 创建项目（懒启动 Agent）`);
    console.log(`    PATCH  /api/projects/:id             更新项目`);
    console.log(`    DELETE /api/projects/:id             删除项目`);
    console.log(`    POST   /api/projects/:id/advance     推进阶段`);
    console.log(`    POST   /api/projects/:id/rollback    回滚阶段`);
    console.log(`    GET    /api/projects/:id/pipeline    获取流水线状态`);
    console.log(`    POST   /api/projects/:id/pipeline/resume  恢复流水线 (HIL)`);
    console.log(`    POST   /api/projects/:id/pipeline/abort   中止流水线`);
    console.log(`    PATCH  /api/projects/:id/pipeline/mode    切换运行模式`);
    console.log(`    PATCH  /api/projects/:id/pipeline/template 切换初稿模板`);
    console.log(`    GET    /api/projects/:id/draft       获取初稿`);
    console.log(`    POST   /api/projects/:id/draft/render 渲染初稿`);
    console.log(`    GET    /api/projects/:id/draft/download 下载初稿`);
    console.log(`    POST   /api/llm/chat                 通用对话`);
    console.log(`    POST   /api/llm/agents/run           触发 Agent`);
    console.log(`    GET    /api/llm/agents/:id/status    Agent 状态`);
    console.log(`    POST   /api/llm/agents/:id/interrupt HIL 中断`);
    console.log(`    GET    /api/llm/models               模型列表`);
    console.log(`    POST   /api/rag/query                RAG 检索`);
    console.log(`    POST   /api/rag/ingest               RAG 导入`);
    console.log(`    GET    /api/rag/sources              数据源列表`);
    console.log(`    GET    /api/ws                       WebSocket 状态`);
    console.log(`    POST   /api/ws/broadcast             手动广播事件`);
    console.log('========================================================');
    console.log('');
  });

  // 优雅关闭
  const shutdown = (signal: string) => {
    console.log(`\n[shutdown] 收到 ${signal} 信号，正在关闭服务...`);
    wsService.close();
    server.close(() => {
      console.log('[shutdown] HTTP 服务已关闭');
      process.exit(0);
    });
    // 强制退出兜底（5 秒）
    setTimeout(() => {
      console.error('[shutdown] 强制退出');
      process.exit(1);
    }, 5_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 未捕获异常兜底，避免进程崩溃
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
