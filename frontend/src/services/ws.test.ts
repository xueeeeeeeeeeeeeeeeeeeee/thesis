import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// WSClient 测试：mock 全局 WebSocket，验证订阅、消息分发、发送、关闭、重连退避
// 注意：模块底部会立即创建单例 wsClient（依赖 window.location），需在 import 前 stub WebSocket
// 注意：源码使用 WebSocket.OPEN 静态属性，需要在 mock 类上挂载

interface MockSocket {
  url: string
  readyState: number
  onopen: ((ev?: unknown) => void) | null
  onmessage: ((ev: { data: string }) => void) | null
  onclose: ((ev?: unknown) => void) | null
  onerror: ((ev?: unknown) => void) | null
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

let mockInstances: MockSocket[] = []

const createMockSocket = (url: string): MockSocket => ({
  url,
  readyState: 0,
  onopen: null,
  onmessage: null,
  onclose: null,
  onerror: null,
  send: vi.fn(),
  close: vi.fn(function (this: MockSocket) {
    this.readyState = 3
  }),
})

// vitest 4 要求 mock 构造函数使用 function/class 关键字
function MockWebSocket(this: any, url: string) {
  const inst = createMockSocket(url)
  mockInstances.push(inst)
  return inst
}
// 挂载静态常量（源码用 WebSocket.OPEN 等判断 readyState）
;(MockWebSocket as any).CONNECTING = 0
;(MockWebSocket as any).OPEN = 1
;(MockWebSocket as any).CLOSING = 2
;(MockWebSocket as any).CLOSED = 3

beforeEach(() => {
  mockInstances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const loadModule = async () => {
  vi.resetModules()
  return (await import('./ws')) as typeof import('./ws')
}

describe('WSClient', () => {
  it('模块加载时创建单例 wsClient', async () => {
    const { wsClient } = await loadModule()
    expect(wsClient).toBeDefined()
    expect(mockInstances.length).toBe(0)
  })

  it('connect 后创建 WebSocket 实例并绑定 4 个回调', async () => {
    const { wsClient } = await loadModule()
    wsClient.connect()
    expect(mockInstances.length).toBe(1)
    const sock = mockInstances[0]
    expect(sock.onopen).toBeTypeOf('function')
    expect(sock.onmessage).toBeTypeOf('function')
    expect(sock.onclose).toBeTypeOf('function')
    expect(sock.onerror).toBeTypeOf('function')
  })

  it('重复 connect 不会创建新连接（已 OPEN 时）', async () => {
    const { wsClient } = await loadModule()
    wsClient.connect()
    const sock = mockInstances[0]
    sock.readyState = 1 // OPEN
    wsClient.connect()
    expect(mockInstances.length).toBe(1)
  })

  it('on 订阅后返回取消订阅函数，调用后取消订阅', async () => {
    const { wsClient } = await loadModule()
    const cb = vi.fn()
    const off = wsClient.on('pipeline_update', cb)
    expect(typeof off).toBe('function')
    wsClient.connect()
    const sock = mockInstances[0]
    sock.onmessage!({ data: JSON.stringify({ event: 'pipeline_update', data: { foo: 1 } }) })
    expect(cb).toHaveBeenCalledWith({ foo: 1 })
    off()
    cb.mockClear()
    sock.onmessage!({ data: JSON.stringify({ event: 'pipeline_update', data: { foo: 2 } }) })
    expect(cb).not.toHaveBeenCalled()
  })

  it('onmessage 收到 pipeline_update 事件时调用订阅回调', async () => {
    const { wsClient } = await loadModule()
    const cb = vi.fn()
    wsClient.on('pipeline_update', cb)
    wsClient.connect()
    const sock = mockInstances[0]
    const payload = { stage: 'experiment', status: 'running' }
    sock.onmessage!({ data: JSON.stringify({ event: 'pipeline_update', data: payload }) })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(payload)
  })

  it('onmessage 收到未订阅事件时不调用回调', async () => {
    const { wsClient } = await loadModule()
    const cb = vi.fn()
    wsClient.on('pipeline_update', cb)
    wsClient.connect()
    const sock = mockInstances[0]
    sock.onmessage!({ data: JSON.stringify({ event: 'other_event', data: {} }) })
    expect(cb).not.toHaveBeenCalled()
  })

  it('onmessage 收到非 JSON 消息时不抛错', async () => {
    const { wsClient } = await loadModule()
    wsClient.on('pipeline_update', () => {
      throw new Error('不应被调用')
    })
    wsClient.connect()
    const sock = mockInstances[0]
    expect(() => sock.onmessage!({ data: 'not-json' })).not.toThrow()
  })

  it('send 在 OPEN 时发送 JSON 字符串', async () => {
    const { wsClient } = await loadModule()
    wsClient.connect()
    const sock = mockInstances[0]
    sock.readyState = 1 // OPEN
    wsClient.send('chat', { text: 'hello' })
    expect(sock.send).toHaveBeenCalledTimes(1)
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ event: 'chat', data: { text: 'hello' } }))
  })

  it('send 在非 OPEN 时不抛错也不发送', async () => {
    const { wsClient } = await loadModule()
    wsClient.connect()
    const sock = mockInstances[0]
    sock.readyState = 0 // CONNECTING
    expect(() => wsClient.send('chat', { text: 'hi' })).not.toThrow()
    expect(sock.send).not.toHaveBeenCalled()
  })

  it('close 后不再触发重连', async () => {
    vi.useFakeTimers()
    const { wsClient } = await loadModule()
    wsClient.connect()
    const sock = mockInstances[0]
    wsClient.close()
    expect(sock.close).toHaveBeenCalled()
    sock.onclose!()
    vi.advanceTimersByTime(60000)
    expect(mockInstances.length).toBe(1)
  })

  it('未 close 时 onclose 会触发 scheduleReconnect 重连', async () => {
    vi.useFakeTimers()
    const { wsClient } = await loadModule()
    wsClient.connect()
    const sock = mockInstances[0]
    sock.onclose!()
    vi.advanceTimersByTime(2000)
    expect(mockInstances.length).toBeGreaterThanOrEqual(2)
  })

  it('scheduleReconnect 退避算法：延迟按 2 的幂递增', async () => {
    vi.useFakeTimers()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { wsClient } = await loadModule()
    wsClient.connect()
    const sock = mockInstances[0]
    sock.onclose!()
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 2000)
    vi.advanceTimersByTime(2000)
    const sock2 = mockInstances[mockInstances.length - 1]
    sock2.onclose!()
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 4000)
  })

  it('达到最大重连次数后停止重连', async () => {
    vi.useFakeTimers()
    const { wsClient } = await loadModule()
    wsClient.connect()
    for (let i = 0; i < 11; i++) {
      const sock = mockInstances[mockInstances.length - 1]
      sock.onclose!()
      vi.advanceTimersByTime(60000)
    }
    expect(mockInstances.length).toBeLessThanOrEqual(11)
  })

  it('connect 抛错时进入 scheduleReconnect', async () => {
    vi.useFakeTimers()
    function FailWebSocket(this: any) {
      throw new Error('connect failed')
    }
    ;(FailWebSocket as any).OPEN = 1
    vi.stubGlobal('WebSocket', FailWebSocket)
    const { wsClient } = await loadModule()
    expect(() => wsClient.connect()).not.toThrow()
    vi.advanceTimersByTime(60000)
  })
})
