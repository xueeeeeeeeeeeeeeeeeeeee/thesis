import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom 29 + vitest 4 + Node 22 环境下 localStorage 默认不可用（Node 原生 localStorage 需 --localstorage-file）
// 此处用内存版 polyfill 替换，保证测试可用
class LocalStorageMock {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return keys[index] ?? null
  }
  get length(): number {
    return this.store.size
  }
}

const lsMock = new LocalStorageMock()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: lsMock,
})
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: lsMock,
})

// jsdom 缺失 API 补丁
window.scrollTo = () => {}

// URL.createObjectURL / revokeObjectURL mock
URL.createObjectURL = () => 'blob:mock-url'
URL.revokeObjectURL = () => {}

// matchMedia mock（antd Modal/Drawer 等组件会调用）
window.matchMedia = window.matchMedia || ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

// 每个测试后清理 DOM、localStorage、mock
afterEach(() => {
  cleanup()
  lsMock.clear()
  vi.restoreAllMocks()
})
