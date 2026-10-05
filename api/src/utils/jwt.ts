import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const signToken = (payload: object) => {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn as any });
};

export const verifyToken = <T>(token: string) => {
  return jwt.verify(token, env.jwt.secret) as T;
};
