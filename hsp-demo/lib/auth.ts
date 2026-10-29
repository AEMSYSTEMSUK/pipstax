// Microsoft sign-in for the hosted demo: secretless OIDC id_token flow (response_type=id_token, form_post) on the
// multi-tenant "organizations" endpoint; the id_token's RS256 signature is checked against the issuing tenant's JWKS.
// Only the addresses in HSP_DEMO_ALLOW ("email|tenantId,email|tenantId") get a session; everyone else is refused.
// The session key comes from a root-only file handed to the service by systemd (LoadCredential=hsp-demo-secrets) -
// never from the repo or a hand-edited .env. The client id is not secret (HSP_DEMO_CLIENT_ID).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const AUTH_ON = process.env.HSP_DEMO_AUTH === '1';
export const BASE_URL = (process.env.HSP_DEMO_URL || 'http://localhost:3333').replace(/\/$/, '');
export const SESSION_COOKIE = 'hspd_session';
export const FLOW_COOKIE = 'hspd_flow';
const SESSION_HOURS = 12;

export const CLIENT_ID = process.env.HSP_DEMO_CLIENT_ID || '';

type Secrets = { sessionKey: string };
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

// sameSite 'None' for the flow cookie: Microsoft's form_post back to /auth/callback is a cross-site POST, which
// would not carry a Lax cookie.
export function cookie(name: string, value: string, maxAgeSec: number, sameSite: 'Lax' | 'None' = 'Lax') {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAgeSec}`;
}

export const randomToken = () => crypto.randomBytes(24).toString('base64url');

// ---- id_token verification (RS256 against the issuing tenant's published keys) ----
const jwksCache = new Map<string, { at: number; keys: any[] }>();
async function tenantKeys(tid: string, force = false): Promise<any[]> {
  const c = jwksCache.get(tid);
  if (c && !force && Date.now() - c.at < 6 * 3600e3) return c.keys;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tid)}/discovery/v2.0/keys`);
  if (!r.ok) throw new Error('keys fetch failed');
  const keys = (await r.json()).keys || [];
  jwksCache.set(tid, { at: Date.now(), keys });
  return keys;
}
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Returns the verified claims, or throws with a reason. Checks: structure, alg RS256, signature (kid from the
// tenant's JWKS, refetched once if the kid is unknown), aud = our client id, iss = that tenant's v2 issuer,
// nonce, exp/nbf (2 min skew).
export async function verifyIdToken(idToken: string, nonce: string): Promise<any> {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  let header: any, claims: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw new Error('malformed token'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected token type');
  const tid = String(claims.tid || '').toLowerCase();
  if (!GUID.test(tid)) throw new Error('no tenant');
  let jwk = (await tenantKeys(tid)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await tenantKeys(tid, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  const now = Date.now() / 1000;
  if (!CLIENT_ID || claims.aud !== CLIENT_ID) throw new Error('wrong audience');
  if (claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new Error('wrong issuer');
  if (!nonce || claims.nonce !== nonce) throw new Error('nonce mismatch');
  if (!(claims.exp > now - 120) || (claims.nbf && claims.nbf > now + 120)) throw new Error('token expired');
  return claims;
}

export const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#ababab;font:14px "Segoe UI",Tahoma,Arial,sans-serif;display:grid;place-items:center;height:100vh}
.b{background:#f0f0f0;border:1px solid #7a7a7a;box-shadow:3px 3px 10px rgba(0,0,0,.35);width:420px}
.t{background:#fff;border-bottom:1px solid #ddd;padding:6px 10px;font-size:12px}.c{padding:18px 20px}
a.btn{display:inline-block;margin-top:14px;padding:5px 16px;background:#e1e1e1;border:1px solid #adadad;color:#000;text-decoration:none}</style></head>
<body><div class="b"><div class="t">HSP Production Control (cloud demo)</div><div class="c">${body}</div></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
