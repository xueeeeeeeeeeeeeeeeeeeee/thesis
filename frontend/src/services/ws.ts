// WebSocket 客户端封装：连接 /ws，支持 on 订阅、自动重连
type EventHandler = (data: unknown) => void

class WSClient {
  private socket: WebSocket | null = null
  private url: string
  private listeners = new Map<string, Set<EventHandler>>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manuallyClosed = false

  constructor(url: string) {
    this.url = url
  }

  // 建立连接
  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return
    this.manuallyClosed = false
    try {
      this.socket = new WebSocket(this.url)
    } catch (e) {
      console.warn('[WS] 连接失败，稍后重试', e)
      this.scheduleReconnect()
      return
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0
      console.info('[WS] 连接已建立')
    }

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const evt = msg.type ?? msg.event
        const data = msg.payload ?? msg.data
        if (evt && this.listeners.has(evt)) {
          this.listeners.get(evt)?.forEach((cb) => cb(data))
        }
      } catch {
        // 非 JSON 消息，忽略
      }
    }

    this.socket.onclose = () => {
      console.info('[WS] 连接关闭')
      if (!this.manuallyClosed) this.scheduleReconnect()
    }

    this.socket.onerror = (e) => {
      console.warn('[WS] 发生错误', e)
    }
  }

  // 订阅事件
  on(event: string, cb: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(cb)
    return () => {
      this.listeners.get(event)?.delete(cb)
    }
  }

  // 发送消息
  send(event: string, data: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: event, payload: data }))
    }
  }

  // 关闭连接
  close(): void {
    this.manuallyClosed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.socket?.close()
    this.socket = null
  }

  // 自动重连
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS] 达到最大重连次数，停止重连')
      return
    }
    this.reconnectAttempts += 1
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
    this.reconnectTimer = setTimeout(() => {
      console.info(`[WS] 第 ${this.reconnectAttempts} 次重连...`)
      this.connect()
    }, delay)
  }
}

// 根据 location 动态生成 ws 地址（开发期通过 Vite 代理）
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const wsUrl = `${protocol}//${window.location.host}/ws`

export const wsClient = new WSClient(wsUrl)

// 默认不自动连接，避免后端未启动时控制台刷错误
// 需要时由具体页面调用 wsClient.connect()
