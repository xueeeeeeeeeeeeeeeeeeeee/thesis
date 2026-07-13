import axios, { AxiosError, type AxiosInstance } from 'axios';
import { config } from '../config';
import { ApiError, type ProjectStage } from '../types';

/**
 * LLM 服务客户端
 * 代理调用 Python LLM 服务（默认 http://localhost:8000）
 *
 * 设计要点：
 * - 即使 Python 服务不可用，本服务也不应抛出导致进程崩溃的错误
 * - 所有请求超时与连接错误统一封装为 ApiError，由控制器捕获并返回友好错误
 */

/** Agent 运行入参 */
export interface RunAgentParams {
  /** 项目 ID */
  projectId: string;
  /** 科学问题 */
  question: string;
  /** 学科 */
  discipline: string;
  /** 起始阶段（可选） */
  startStage?: ProjectStage;
  /** 运行模式：auto 全自动 / manual 遇 HIL 暂停（默认 auto） */
  mode?: 'auto' | 'manual';
  /** 草稿模板：ctex/ieee/journal/markdown（默认 markdown） */
  template?: 'ctex' | 'ieee' | 'journal' | 'markdown';
}

/**
 * LLM 服务承认的合法 stage 白名单。
 * 后端 ProjectStage 含 'topic'/'hypothesis' 等旧阶段，LLM 服务只接受 8 阶段枚举，
 * 非法值需过滤掉（不传给 LLM，让其从 literature 开始）。
 */
const LLM_VALID_STAGES: ReadonlySet<string> = new Set([
  'literature',
  'design',
  'experiment',
  'evaluate',
  'discuss',
  'write',
  'figure',
  'submit',
]);

/** Agent 运行响应（兼容 Python 端实际返回）
 *
 * LLM 服务 /agents/run 返回 { agent_id, status: AgentStatus }，
 * 其中 status 是完整的 AgentStatus 对象（含 stage / artifacts / hil_pending 等），
 * 而非字符串。后端拿到后可同步 stage/artifacts 到 project。
 */
export interface AgentStatusResponse {
  agent_id: string;
  project_id?: string;
  question?: string;
  discipline?: string;
  mode?: string;
  template?: string;
  stage?: string;
  status: string;
  literature?: unknown;
  experiment_design?: unknown;
  experiment_results?: unknown;
  evaluation?: unknown;
  discussion?: unknown;
  paper_sections?: unknown;
  figures?: unknown[];
  submission?: unknown;
  artifacts?: Record<string, unknown>;
  hil_pending?: { stage?: string; title?: string; message?: string; [k: string]: unknown } | null;
  history?: unknown[];
  errors?: string[];
  [key: string]: unknown;
}

export interface RunAgentResponse {
  agent_id: string;
  status: AgentStatusResponse;
  [key: string]: unknown;
}

/** HIL 中断 action 类型 */
export type InterruptAction = 'confirm' | 'edit' | 'rollback' | 'abort';

class LlmService {
  private client: AxiosInstance;
  /** 服务是否在线（最近一次探活结果） */
  private available: boolean = true;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 60_000,
      headers: { 'Content-Type': 'application/json' },
      // 禁用代理：本机调用 LLM 服务，避免 http_proxy 环境变量拦截 localhost
      proxy: false,
    });
  }

  /** 通用对话 */
  async chat(payload: unknown): Promise<unknown> {
    return this.request('POST', '/llm/chat', payload);
  }

  /**
   * 触发 Agent 运行（论文生成流水线入口）
   * @param params 项目上下文与起始阶段
   */
  async runAgent(params: RunAgentParams): Promise<RunAgentResponse> {
    // 过滤非法 stage：后端 'topic'/'hypothesis' 等不在 LLM 8 阶段枚举内，传了会 422
    const safeStage =
      params.startStage && LLM_VALID_STAGES.has(params.startStage)
        ? params.startStage
        : undefined;
    const result = (await this.request('POST', '/agents/run', {
      project_id: params.projectId,
      question: params.question,
      discipline: params.discipline,
      start_stage: safeStage,
      mode: params.mode ?? 'auto',
      template: params.template ?? 'markdown',
    })) as RunAgentResponse;
    return result;
  }

  /** 查询 Agent 状态 */
  async getAgentStatus(agentId: string): Promise<AgentStatusResponse> {
    const result = (await this.request(
      'GET',
      `/agents/${agentId}/status`,
    )) as AgentStatusResponse;
    return result;
  }

  /**
   * HIL 中断响应
   * @param agentId Agent ID
   * @param action 动作（confirm/edit/rollback/abort）
   * @param payload 附带负载
   */
  async interruptAgent(
    agentId: string,
    action: InterruptAction,
    payload?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request('POST', `/agents/${agentId}/interrupt`, {
      action,
      payload: payload ?? {},
    });
  }

  /**
   * 恢复 Agent（等价 confirm）
   */
  async resumeAgent(agentId: string): Promise<unknown> {
    return this.request('POST', `/agents/${agentId}/resume`, {});
  }

  /** 获取可用模型列表 */
  async listModels(): Promise<unknown> {
    return this.request('GET', '/llm/models');
  }

  /** RAG 检索 */
  async ragQuery(payload: unknown): Promise<unknown> {
    return this.request('POST', '/rag/query', payload);
  }

  /** RAG 导入 */
  async ragIngest(payload: unknown): Promise<unknown> {
    return this.request('POST', '/rag/ingest', payload);
  }

  /** RAG 数据源列表 */
  async ragSources(): Promise<unknown> {
    return this.request('GET', '/rag/sources');
  }

  /** 服务是否可用 */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * 统一请求封装
   * 捕获 axios 异常并转换为 ApiError，避免进程崩溃
   */
  private async request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<unknown> {
    try {
      const response = await this.client.request({
        method,
        url: path,
        data,
      });
      this.available = true;
      return response.data;
    } catch (err) {
      this.available = false;
      throw this.normalizeError(err);
    }
  }

  /** 把 axios 错误转换为业务错误 */
  private normalizeError(err: unknown): ApiError {
    if (err instanceof AxiosError) {
      // 无响应：服务不可达
      if (!err.response) {
        const hint = `无法连接到 LLM 服务 (${config.llmServiceUrl})，请确认 Python 服务已启动`;
        return new ApiError(hint, 503, -1);
      }
      // 有响应：透传上游错误信息
      const status = err.response.status;
      const upstream = err.response.data;
      const message =
        upstream && typeof upstream === 'object' && 'message' in upstream
          ? String((upstream as { message: unknown }).message)
          : typeof upstream === 'string'
            ? upstream
            : `LLM 服务返回错误 (${status})`;
      return new ApiError(message, status >= 400 && status < 600 ? status : 502, -1);
    }
    // 未知错误
    const message = err instanceof Error ? err.message : 'LLM 服务调用失败';
    return new ApiError(message, 500, -1);
  }
}

export const llmService = new LlmService(config.llmServiceUrl);
