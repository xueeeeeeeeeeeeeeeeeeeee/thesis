import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import type { JwtPayload, User } from '../types';

/**
 * JWT 工具
 * 负责签发与校验 token，密钥与有效期来自全局配置
 */

/** 为用户签发 JWT */
export function signToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

/** 校验 JWT 并返回 payload，校验失败会抛出 jsonwebtoken 的异常 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as unknown as JwtPayload;
}
