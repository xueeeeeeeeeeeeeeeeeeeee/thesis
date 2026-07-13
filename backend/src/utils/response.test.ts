import { describe, it, expect } from 'vitest';
import { success, fail } from './response';

// 统一响应封装测试
describe('utils/response', () => {
  describe('success', () => {
    it('默认 message 为"成功"', () => {
      // 测试不传 message 时使用默认值
      const result = success({ a: 1 });
      expect(result).toEqual({ code: 0, data: { a: 1 }, message: '成功' });
    });

    it('支持自定义 message', () => {
      // 测试传入自定义消息
      const result = success(null, '自定义消息');
      expect(result).toEqual({ code: 0, data: null, message: '自定义消息' });
    });

    it('保留任意 data 类型', () => {
      // 测试数组、字符串、数字等数据类型
      expect(success([1, 2, 3]).data).toEqual([1, 2, 3]);
      expect(success('hello').data).toBe('hello');
      expect(success(42).data).toBe(42);
    });

    it('code 永远为 0', () => {
      // 成功响应固定 code=0
      expect(success('x').code).toBe(0);
    });
  });

  describe('fail', () => {
    it('默认 code 为 -1', () => {
      // 不传 code 时默认 -1
      const result = fail('出错了');
      expect(result).toEqual({ code: -1, data: null, message: '出错了' });
    });

    it('支持自定义 code', () => {
      // 测试传入自定义 code
      const result = fail('参数错误', 100);
      expect(result.code).toBe(100);
      expect(result.data).toBeNull();
      expect(result.message).toBe('参数错误');
    });

    it('data 永远为 null', () => {
      // 失败响应固定 data=null
      expect(fail('x').data).toBeNull();
      expect(fail('x', 500).data).toBeNull();
    });
  });
});
