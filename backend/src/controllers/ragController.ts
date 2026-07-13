import type { Request, Response } from 'express';
import { llmService } from '../services/llmService';
import { success } from '../utils/response';
import { ApiError, asyncHandler } from '../types';
import type { RagQueryRequest, RagIngestRequest } from '../types';

/**
 * RAG 控制器
 * 代理所有 RAG 检索/导入/数据源请求到 Python 服务
 */

/** RAG 检索 */
export const query = asyncHandler(async (req: Request, res: Response) => {
  const { query: q, topK, filters } = (req.body ?? {}) as RagQueryRequest;
  if (!q || typeof q !== 'string' || !q.trim()) {
    throw new ApiError('查询语句(query)不能为空', 400, -1);
  }
  const payload: RagQueryRequest = {
    query: q.trim(),
    topK: typeof topK === 'number' ? topK : 5,
    filters: filters ?? {},
  };
  const result = await llmService.ragQuery(payload);
  res.json(success(result, '检索成功'));
});

/** RAG 导入文献 */
export const ingest = asyncHandler(async (req: Request, res: Response) => {
  const { source, documents } = (req.body ?? {}) as RagIngestRequest;
  if (!source || typeof source !== 'string' || !source.trim()) {
    throw new ApiError('数据源(source)不能为空', 400, -1);
  }
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new ApiError('导入文档(documents)不能为空', 400, -1);
  }
  const result = await llmService.ragIngest({ source: source.trim(), documents });
  res.json(success(result, '导入文献成功'));
});

/** 获取数据源列表 */
export const sources = asyncHandler(async (req: Request, res: Response) => {
  const result = await llmService.ragSources();
  res.json(success(result, '获取数据源列表成功'));
});
