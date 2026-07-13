import { describe, it, expect, beforeEach } from 'vitest'
import { useUserStore } from './userStore'
import type { SafeUser } from '@/types'

// userStore 测试：LLM/RAG/学科/同步用户/重置

beforeEach(() => {
  useUserStore.getState().reset()
})

describe('store/userStore', () => {
  describe('setLLMConfig', () => {
    it('按 tier 精确更新对应档位配置', () => {
      useUserStore.getState().setLLMConfig('strong', { apiKey: 'sk-new', enabled: false })
      const llm = useUserStore.getState().llm
      const strong = llm.find((c) => c.tier === 'strong')
      const cheap = llm.find((c) => c.tier === 'cheap')
      expect(strong?.apiKey).toBe('sk-new')
      expect(strong?.enabled).toBe(false)
      expect(cheap?.apiKey).toBe('')
      expect(cheap?.enabled).toBe(true)
    })

    it('更新 long 档位', () => {
      useUserStore.getState().setLLMConfig('long', { model: 'Kimi-New' })
      const long = useUserStore.getState().llm.find((c) => c.tier === 'long')
      expect(long?.model).toBe('Kimi-New')
    })

    it('更新 embedding 档位', () => {
      useUserStore.getState().setLLMConfig('embedding', { enabled: false })
      const emb = useUserStore.getState().llm.find((c) => c.tier === 'embedding')
      expect(emb?.enabled).toBe(false)
    })
  })

  describe('setRAGConfig', () => {
    it('浅合并 rag 配置', () => {
      useUserStore.getState().setRAGConfig({ chunkSize: 1024, topK: 20 })
      const rag = useUserStore.getState().rag
      expect(rag.chunkSize).toBe(1024)
      expect(rag.topK).toBe(20)
      expect(rag.overlap).toBe(64)
      expect(rag.reranker).toBe(true)
    })
  })

  describe('setDiscipline', () => {
    it('设置学科', () => {
      useUserStore.getState().setDiscipline('CV')
      expect(useUserStore.getState().discipline).toBe('CV')
    })
  })

  describe('syncFromUser', () => {
    it('同步 username/avatar/discipline', () => {
      const user: SafeUser = {
        id: 'u1', email: 'a@b.com', username: 'alice', avatar: 'http://img.png',
        role: 'user', discipline: 'CV', apiKeys: {},
        createdAt: '', updatedAt: '',
      }
      useUserStore.getState().syncFromUser(user)
      const state = useUserStore.getState()
      expect(state.username).toBe('alice')
      expect(state.avatar).toBe('http://img.png')
      expect(state.discipline).toBe('CV')
    })

    it('按 apiKeys.deepseek 映射到 strong/cheap 档位', () => {
      const user: SafeUser = {
        id: 'u1', email: 'a@b.com', username: 'alice',
        role: 'user', discipline: 'NLP',
        apiKeys: { deepseek: 'sk-deep', kimi: 'sk-kimi' },
        createdAt: '', updatedAt: '',
      }
      useUserStore.getState().syncFromUser(user)
      const llm = useUserStore.getState().llm
      const strong = llm.find((c) => c.tier === 'strong')
      const cheap = llm.find((c) => c.tier === 'cheap')
      const long = llm.find((c) => c.tier === 'long')
      expect(strong?.apiKey).toBe('sk-deep')
      expect(strong?.enabled).toBe(true)
      expect(cheap?.apiKey).toBe('sk-deep')
      expect(cheap?.enabled).toBe(true)
      expect(long?.apiKey).toBe('sk-kimi')
      expect(long?.enabled).toBe(true)
    })

    it('无 apiKeys 时 strong/cheap/long 为空且 disabled', () => {
      const user: SafeUser = {
        id: 'u1', email: 'a@b.com', username: 'alice',
        role: 'user', discipline: 'NLP', apiKeys: {},
        createdAt: '', updatedAt: '',
      }
      useUserStore.getState().syncFromUser(user)
      const llm = useUserStore.getState().llm
      const strong = llm.find((c) => c.tier === 'strong')
      const long = llm.find((c) => c.tier === 'long')
      const emb = llm.find((c) => c.tier === 'embedding')
      expect(strong?.apiKey).toBe('')
      expect(strong?.enabled).toBe(false)
      expect(long?.apiKey).toBe('')
      expect(long?.enabled).toBe(false)
      expect(emb?.enabled).toBe(true)
    })
  })

  describe('reset', () => {
    it('重置为默认值', () => {
      useUserStore.getState().setDiscipline('CV')
      useUserStore.getState().setLLMConfig('strong', { apiKey: 'x' })
      useUserStore.getState().setRAGConfig({ chunkSize: 999 })
      useUserStore.getState().reset()
      const state = useUserStore.getState()
      expect(state.username).toBe('研究员')
      expect(state.discipline).toBe('NLP')
      expect(state.llm.find((c) => c.tier === 'strong')?.apiKey).toBe('')
      expect(state.rag.chunkSize).toBe(512)
    })
  })

  describe('初始默认值', () => {
    it('llm 包含 4 个档位', () => {
      const tiers = useUserStore.getState().llm.map((c) => c.tier)
      expect(tiers).toEqual(['strong', 'cheap', 'long', 'embedding'])
    })

    it('rag 默认值正确', () => {
      const rag = useUserStore.getState().rag
      expect(rag.chunkStrategy).toBe('semantic')
      expect(rag.chunkSize).toBe(512)
      expect(rag.overlap).toBe(64)
      expect(rag.reranker).toBe(true)
      expect(rag.topK).toBe(10)
    })
  })
})
