import { create } from 'zustand'
import type { UserConfig, LLMConfig, RAGConfig, SafeUser } from '@/types'

interface UserState extends UserConfig {
  username: string
  avatar: string
  setLLMConfig: (tier: LLMConfig['tier'], patch: Partial<LLMConfig>) => void
  setRAGConfig: (patch: Partial<RAGConfig>) => void
  setDiscipline: (d: string) => void
  syncFromUser: (user: SafeUser) => void
  reset: () => void
}

// LLM 默认档位（仅作为前端展示的初始模板，实际 Key 从 authStore.user.apiKeys 读取）
const defaultLLM: LLMConfig[] = [
  {
    tier: 'strong',
    provider: 'DeepSeek',
    model: 'DeepSeek-R1',
    apiKey: '',
    enabled: true,
  },
  {
    tier: 'cheap',
    provider: 'DeepSeek',
    model: 'DeepSeek-V3',
    apiKey: '',
    enabled: true,
  },
  {
    tier: 'long',
    provider: 'Moonshot',
    model: 'Kimi-K2',
    apiKey: '',
    enabled: false,
  },
  {
    tier: 'embedding',
    provider: 'BAAI',
    model: 'bge-m3',
    apiKey: '',
    enabled: true,
  },
]

const defaultRAG: RAGConfig = {
  sources: {
    arXiv: true,
    s2: true,
    openAlex: false,
    pubMed: true,
  },
  chunkStrategy: 'semantic',
  chunkSize: 512,
  overlap: 64,
  reranker: true,
  topK: 10,
}

export const useUserStore = create<UserState>((set) => ({
  username: '研究员',
  avatar: '',
  llm: defaultLLM,
  rag: defaultRAG,
  discipline: 'NLP',

  setLLMConfig: (tier, patch) =>
    set((state) => ({
      llm: state.llm.map((c) => (c.tier === tier ? { ...c, ...patch } : c)),
    })),

  setRAGConfig: (patch) =>
    set((state) => ({ rag: { ...state.rag, ...patch } })),

  setDiscipline: (d) => set({ discipline: d }),

  // 登录/更新后从 SafeUser 同步信息
  syncFromUser: (user) =>
    set({
      username: user.username,
      avatar: user.avatar ?? '',
      discipline: user.discipline,
      // 同步 API Key 到对应档位（仅用于前端展示状态）
      llm: defaultLLM.map((c) => {
        let key = ''
        if (c.tier === 'strong' || c.tier === 'cheap') key = user.apiKeys?.deepseek ?? ''
        else if (c.tier === 'long') key = user.apiKeys?.kimi ?? ''
        return { ...c, apiKey: key, enabled: !!key || c.tier === 'embedding' }
      }),
    }),

  reset: () =>
    set({
      username: '研究员',
      avatar: '',
      llm: defaultLLM,
      rag: defaultRAG,
      discipline: 'NLP',
    }),
}))
