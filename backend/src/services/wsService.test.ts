import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server } from 'http';

// mock ws 模块：保留 WebSocket 常量（OPEN 等）和 WebSocketServer 类
const mockWebSocketServerInstances: Array<{
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  options: { server: Server };
}> = [];

vi.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    on = vi.fn();
    send = vi.fn();
    ping = vi.fn();
    terminate = vi.fn();
    close = vi.fn();
  }
  class MockWebSocketServer {
    options: { server: Server };
    on = vi.fn();
    close = vi.fn();
    constructor(opts: { server: Server }) {
      this.options = opts;
      mockWebSocketServerInstances.push(this);
    }
  }
  return {
    WebSocketServer: MockWebSocketServer,
    WebSocket: MockWebSocket,
    default: { WebSocketServer: MockWebSocketServer, WebSocket: MockWebSocket },
  };
});

// mock uuid：让 clientID 可预测，每次调用递增
const { mockUuidV4 } = vi.hoisted(() => ({
  mockUuidV4: vi.fn(),
}));
vi.mock('uuid', () => ({
  v4: mockUuidV4,
}));

import { WebSocketServer, WebSocket } from 'ws';
import { wsService } from './wsService';

// WebSocket 服务测试
describe('services/wsService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWebSocketServerInstances.length = 0;
    // uuid 每次调用返回递增的 id（client-1, client-2, ...）
    let uuidCounter = 0;
    mockUuidV4.mockImplementation(() => `client-${++uuidCounter}`);
    // 重置内部状态：通过 close 清空
    wsService.close();
  });

  describe('init', () => {
    it('创建 WebSocketServer 并监听 connection 事件', () => {
      // 验证 init 创建实例并注册 connection 监听
      const fakeServer = {} as Server;
      wsService.init(fakeServer);
      expect(mockWebSocketServerInstances).toHaveLength(1);
      const instance = mockWebSocketServerInstances[0];
      expect(instance.options.server).toBe(fakeServer);
      expect(instance.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('broadcast', () => {
    it('仅向 OPEN 状态客户端发送', () => {
      // 准备 2 个客户端：1 个 OPEN、1 个 CLOSED
      // uuid mock 会依次返回 client-1, client-2，避免覆盖
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;

      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      const closedWs = new (WebSocket as unknown as { new (): WebSocket })();
      closedWs.readyState = WebSocket.CLOSED;

      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });
      connectionHandler(closedWs, { socket: { remoteAddress: '2.2.2.2' } });

      // 清空 connected 事件的 send 记录，只观察 broadcast
      (openWs.send as unknown as ReturnType<typeof vi.fn>).mockClear();
      (closedWs.send as unknown as ReturnType<typeof vi.fn>).mockClear();

      wsService.broadcast('log_line', { msg: 'hello' });

      // OPEN 客户端应被发送（仅 broadcast 这次）
      expect(openWs.send).toHaveBeenCalledTimes(1);
      // CLOSED 客户端不应被发送
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('无客户端时不抛错', () => {
      // 验证空广播安全
      wsService.init({} as Server);
      expect(() => wsService.broadcast('log_line', {})).not.toThrow();
    });

    it('广播消息包含 type/payload/timestamp', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });

      wsService.broadcast('stage_change', { projectId: 'p1' });
      // 最后一次 send 应是 broadcast 数据
      const lastCall = openWs.send.mock.calls[openWs.send.mock.calls.length - 1];
      const data = JSON.parse(lastCall[0] as string);
      expect(data.type).toBe('stage_change');
      expect(data.payload).toEqual({ projectId: 'p1' });
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('sendToClient', () => {
    it('客户端不存在返回 false', () => {
      wsService.init({} as Server);
      const ok = wsService.sendToClient('non-existent', 'heartbeat', {});
      expect(ok).toBe(false);
    });

    it('客户端存在且 OPEN 时返回 true 并 send', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });

      const ok = wsService.sendToClient('client-1', 'heartbeat', { t: 1 });
      expect(ok).toBe(true);
      // 最后一次 send 应是 sendToClient 数据
      const lastCall = openWs.send.mock.calls[openWs.send.mock.calls.length - 1];
      const data = JSON.parse(lastCall[0] as string);
      expect(data.type).toBe('heartbeat');
      expect(data.payload).toEqual({ t: 1 });
    });

    it('客户端存在但非 OPEN 时返回 false', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const closedWs = new (WebSocket as unknown as { new (): WebSocket })();
      closedWs.readyState = WebSocket.CLOSED;
      connectionHandler(closedWs, { socket: { remoteAddress: '1.1.1.1' } });

      const ok = wsService.sendToClient('client-1', 'heartbeat', {});
      expect(ok).toBe(false);
    });
  });

  describe('getClientCount', () => {
    it('返回当前在线数量', () => {
      wsService.init({} as Server);
      expect(wsService.getClientCount()).toBe(0);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });
      expect(wsService.getClientCount()).toBe(1);
    });
  });

  describe('handleMessage（间接测试，通过 ws.on message 回调）', () => {
    it('收到 ping 时返回 heartbeat', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });

      // 找到 ws.on('message', ...) 注册的回调
      const messageListener = openWs.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )![1] as (raw: unknown) => void;

      // 清空之前的 send 调用计数
      (openWs.send as unknown as ReturnType<typeof vi.fn>).mockClear();
      messageListener(JSON.stringify({ type: 'ping' }));
      // 应触发 sendToClient('heartbeat', ...)
      expect(openWs.send).toHaveBeenCalledTimes(1);
      const sentData = JSON.parse(
        (openWs.send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );
      expect(sentData.type).toBe('heartbeat');
      expect(sentData.payload).toHaveProperty('time');
    });

    it('收到非 ping 消息不发送 heartbeat', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });
      const messageListener = openWs.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )![1] as (raw: unknown) => void;
      (openWs.send as unknown as ReturnType<typeof vi.fn>).mockClear();
      messageListener(JSON.stringify({ type: 'something_else' }));
      expect(openWs.send).not.toHaveBeenCalled();
    });

    it('非法 JSON 不抛错', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });
      const messageListener = openWs.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )![1] as (raw: unknown) => void;
      expect(() => messageListener('not-json')).not.toThrow();
    });
  });

  describe('close', () => {
    it('清空客户端列表与 wss', () => {
      wsService.init({} as Server);
      const instance = mockWebSocketServerInstances[0];
      const connectionHandler = instance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'connection',
      )![1] as (ws: WebSocket, req: unknown) => void;
      const openWs = new (WebSocket as unknown as { new (): WebSocket })();
      openWs.readyState = WebSocket.OPEN;
      connectionHandler(openWs, { socket: { remoteAddress: '1.1.1.1' } });
      expect(wsService.getClientCount()).toBe(1);
      wsService.close();
      expect(wsService.getClientCount()).toBe(0);
      // close 后应调用 ws.terminate()
      expect(openWs.terminate).toHaveBeenCalled();
    });
  });
});
