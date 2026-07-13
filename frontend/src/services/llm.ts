import { post } from './request'
import type { ApiResponse } from '@/types'

// LLM 服务 API（经后端代理转发，避免前端暴露密钥）

export interface ChatRequest {
  tier: 'strong' | 'cheap' | 'long'
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  maxTokens?: number
}

export interface ChatResponse {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
}

// 聊天补全
export const chatApi = (
  payload: ChatRequest,
): Promise<ApiResponse<ChatResponse>> =>
  post<ApiResponse<ChatResponse>>('/llm/chat', payload)

// 嵌入向量
export const embedApi = (
  texts: string[],
): Promise<ApiResponse<{ vectors: number[][]; model: string }>> =>
  post<ApiResponse<{ vectors: number[][]; model: string }>>('/llm/embed', {
    texts,
  })
