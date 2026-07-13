import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { v4 as uuidv4 } from 'uuid';
import type { WsClient, WsEventType, WsMessage } from '../types';

/**
 * WebSocket 服务
 * 管理 WebSocket 客户端连接、广播事件、心跳保活
 *
 * 事件类型：
 * - agent_progress   Agent 执行进度
 * - log_line         日志行
 * - hil_required     需要人工介入
 * - stage_change     项目阶段变更
 * - experiment_status 实验状态变更
 * - heartbeat        心跳
 * - connected        连接成功
 */
class WsService {
  private clients: Map<string, WsClient> = new Map();
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  /**
   * 初始化 WebSocket 服务，共享同一个 HTTP server
   * 路径固定为 /ws
   */
  init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = uuidv4();
      const client: WsClient = {
        id: clientId,
        ws,
        isAlive: true,
        connectedAt: new Date().toISOString(),
      };
      this.clients.set(clientId, client);

      console.log(`[ws] 客户端连接: ${clientId} (来源: ${req.socket.remoteAddress ?? 'unknown'})，当前在线: ${this.clients.size}`);

      // 发送连接成功事件
      this.sendToClient(clientId, 'connected', {
        clientId,
        message: 'WebSocket 连接成功',
        serverTime: new Date().toISOString(),
      });

      ws.on('pong', () => {
        const c = this.clients.get(clientId);
        if (c) c.isAlive = true;
      });

      ws.on('message', (raw) => {
        this.handleMessage(clientId, raw.toString());
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[ws] 客户端断开: ${clientId}，当前在线: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error(`[ws] 客户端 ${clientId} 错误:`, err.message);
        this.clients.delete(clientId);
      });
    });

    this.startHeartbeat();
    console.log(`[ws] WebSocket 服务已启动，路径: /ws`);
  }

  /** 处理客户端发来的消息 */
  private handleMessage(clientId: string, raw: string): void {
    try {
      const parsed = JSON.parse(raw) as { type?: string; payload?: unknown };
      // 心跳响应
      if (parsed.type === 'ping') {
        this.sendToClient(clientId, 'heartbeat', { time: new Date().toISOString() });
        return;
      }
      // 其他消息暂不处理，仅记录日志
      console.log(`[ws] 收到客户端 ${clientId} 消息: ${parsed.type ?? 'unknown'}`);
    } catch {
      console.warn(`[ws] 收到客户端 ${clientId} 非法消息:`, raw.slice(0, 200));
    }
  }

  /** 广播给所有在线客户端 */
  broadcast<T>(type: WsEventType, payload: T): void {
    const message: WsMessage<T> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const data = JSON.stringify(message);
    let sent = 0;
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
        sent++;
      }
    }
    if (sent > 0) {
      console.log(`[ws] 广播事件 ${type} 给 ${sent} 个客户端`);
    }
  }

  /** 发送给指定客户端 */
  sendToClient<T>(clientId: string, type: WsEventType, payload: T): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    const message: WsMessage<T> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    client.ws.send(JSON.stringify(message));
    return true;
  }

  /** 获取当前在线客户端数量 */
  getClientCount(): number {
    return this.clients.size;
  }

  /** 获取所有客户端概要信息 */
  getClients(): Array<{ id: string; connectedAt: string; isAlive: boolean }> {
    return Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      connectedAt: c.connectedAt,
      isAlive: c.isAlive,
    }));
  }

  /** 启动心跳保活定时器 */
  private startHeartbeat(): void {
    // 每 30 秒发送一次 ping
    this.heartbeatTimer = setInterval(() => {
      for (const [id, client] of this.clients.entries()) {
        if (!client.isAlive) {
          // 上次 ping 后未收到 pong，判定为断开
          console.log(`[ws] 客户端 ${id} 心跳超时，主动断开`);
          client.ws.terminate();
          this.clients.delete(id);
          continue;
        }
        client.isAlive = false;
        try {
          client.ws.ping();
        } catch {
          this.clients.delete(id);
        }
      }
    }, 30_000);

    // 防止定时器阻止进程退出
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /** 关闭 WebSocket 服务 */
  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients.values()) {
      client.ws.terminate();
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  /** 获取监听地址信息（用于日志） */
  getAddress(): string | null {
    if (!this.wss || !this.wss.options || !this.wss.options.server) return null;
    const addr = this.wss.options.server.address() as AddressInfo | string | null;
    if (addr && typeof addr === 'object') {
      return `ws://localhost:${addr.port}/ws`;
    }
    return null;
  }
}

export const wsService = new WsService();
