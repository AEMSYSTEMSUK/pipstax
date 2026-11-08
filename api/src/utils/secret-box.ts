import crypto from 'crypto';
import { env } from '../config/env';

// AES-256-GCM for secrets stored in the database (AI keys). The encryption key is derived from SECRET_BOX_KEY if set,
// else JWT_SECRET - so a DB dump alone does not expose the keys. If that secret is ever rotated, stored keys can no
// longer be decrypted and simply have to be entered again in the GUI (openSecret returns null, callers say so).
const derivedKey = () =>
  crypto.createHash('sha256').update(`pipstax-secret-box:${process.env.SECRET_BOX_KEY || env.jwt.secret}`).digest();

export const sealSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
};

export const openSecret = (sealed?: string | null): string | null => {
  if (!sealed) return null;
  try {
    const [v, iv, tag, ct] = sealed.split(':');
    if (v !== 'v1' || !iv || !tag || !ct) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

// For display only: "sk-ant-…a1b2".
export const maskSecret = (plain?: string | null) => (plain ? `${plain.slice(0, 7)}…${plain.slice(-4)}` : null);
