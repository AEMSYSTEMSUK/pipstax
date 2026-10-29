// Microsoft sign-in for the hosted demo (OIDC auth-code flow, multi-tenant "organizations" endpoint).
// Only the addresses in HSP_DEMO_ALLOW ("email|tenantId,email|tenantId") get a session; everyone else is refused.
// Secrets (client secret + session key) come from a root-only file handed to the service by systemd
// (LoadCredential=hsp-demo-secrets) - never from the repo or a hand-edited .env.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const AUTH_ON = process.env.HSP_DEMO_AUTH === '1';
export const BASE_URL = (process.env.HSP_DEMO_URL || 'http://localhost:3333').replace(/\/$/, '');
export const SESSION_COOKIE = 'hspd_session';
export const FLOW_COOKIE = 'hspd_flow';
const SESSION_HOURS = 12;

type Secrets = { clientId: string; clientSecret: string; sessionKey: string };
let secrets: Secrets | null = null;
export function getSecrets(): Secrets {
  if (secrets) return secrets;
  const dir = process.env.CREDENTIALS_DIRECTORY;
  const file = dir ? path.join(dir, 'hsp-demo-secrets') : process.env.HSP_DEMO_SECRETS || '';
  if (!file) throw new Error('No secrets file');
  secrets = JSON.parse(fs.readFileSync(file, 'utf8'));
  return secrets!;
}

export function allowList(): { email: string; tid: string }[] {
  return (process.env.HSP_DEMO_ALLOW || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [email, tid] = x.split('|');
    return { email: email.toLowerCase(), tid: (tid || '').toLowerCase() };
  });
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const hmac = (data: string) => crypto.createHmac('sha256', getSecrets().sessionKey).update(data).digest('base64url');

export function sign(obj: object): string {
  const body = b64u(JSON.stringify(obj));
  return `${body}.${hmac(body)}`;
}
export function unsign<T = any>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = hmac(body);
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof v.exp === 'number' && v.exp < Date.now()) return null;
    return v;
  } catch { return null; }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export type Session = { email: string; name: string; tid: string; exp: number };
export function sessionFrom(cookieHeader: string | null): Session | null {
  if (!AUTH_ON) return { email: 'local', name: 'Local', tid: '', exp: Date.now() + 3600e3 };
  const s = unsign<Session>(readCookie(cookieHeader, SESSION_COOKIE));
  if (!s) return null;
  // re-check the allow-list on every request, so removing someone takes effect immediately
  return allowList().some((a) => a.email === s.email && a.tid === s.tid) ? s : null;
}

export const newSession = (email: string, name: string, tid: string) => sign({ email, name, tid, exp: Date.now() + SESSION_HOURS * 3600e3 });

export function cookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export const randomToken = () => crypto.randomBytes(24).toString('base64url');

// id_token payload. It comes straight from Microsoft's token endpoint over TLS in exchange for our code + client
// secret, so per OIDC core 3.1.3.7 the TLS check stands in for the signature check; we still verify aud, iss,
// tid, nonce and expiry.
export function decodeIdToken(idToken: string): any {
  const part = idToken.split('.')[1];
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#ababab;font:14px "Segoe UI",Tahoma,Arial,sans-serif;display:grid;place-items:center;height:100vh}
.b{background:#f0f0f0;border:1px solid #7a7a7a;box-shadow:3px 3px 10px rgba(0,0,0,.35);width:420px}
.t{background:#fff;border-bottom:1px solid #ddd;padding:6px 10px;font-size:12px}.c{padding:18px 20px}
a.btn{display:inline-block;margin-top:14px;padding:5px 16px;background:#e1e1e1;border:1px solid #adadad;color:#000;text-decoration:none}</style></head>
<body><div class="b"><div class="t">HSP Production Control (cloud demo)</div><div class="c">${body}</div></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
