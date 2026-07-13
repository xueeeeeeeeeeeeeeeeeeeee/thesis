/**
 * 统一响应封装
 * 所有接口返回统一的 { code, data, message } 结构
 */

/** 成功响应结构 */
export interface SuccessResponse<T = unknown> {
  code: 0;
  data: T;
  message: string;
}

/** 失败响应结构 */
export interface FailResponse {
  code: number;
  data: null;
  message: string;
}

/**
 * 构造成功响应
 * @param data 数据载荷
 * @param message 提示信息（默认"成功"）
 */
export function success<T>(data: T, message: string = '成功'): SuccessResponse<T> {
  return { code: 0, data, message };
}

/**
 * 构造失败响应
 * @param message 错误信息
 * @param code 错误码（默认 -1）
 */
export function fail(message: string, code: number = -1): FailResponse {
  return { code, data: null, message };
}
