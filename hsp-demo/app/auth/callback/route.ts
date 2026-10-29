import { NextRequest } from 'next/server';
import { BASE_URL, FLOW_COOKIE, SESSION_COOKIE, allowList, cookie, decodeIdToken, getSecrets, newSession, page, readCookie, unsign } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const denied = (why: string) => page('Not authorised', `<b>Not authorised</b><p>${esc(why)}</p><p>This demo is only open to invited accounts. If you think you should have access, contact AEM Systems.</p><a class="btn" href="/auth/logout">Try a different account</a>`, 403);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get('error')) return denied(sp.get('error_description')?.split('\n')[0] || 'Sign-in was cancelled.');
  const flow = unsign<{ state: string; nonce: string }>(readCookie(req.headers.get('cookie'), FLOW_COOKIE));
  if (!flow || flow.state !== sp.get('state') || !sp.get('code')) return denied('Your sign-in expired - please start again.');

  const { clientId, clientSecret } = getSecrets();
  const r = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: sp.get('code')!, redirect_uri: `${BASE_URL}/auth/callback`, scope: 'openid profile email' }),
  });
  const tok = await r.json().catch(() => ({}));
  if (!r.ok || !tok.id_token) return denied('Microsoft did not complete the sign-in.');

  const c = decodeIdToken(tok.id_token);
  const tid = String(c.tid || '').toLowerCase();
  const email = String(c.preferred_username || c.email || c.upn || '').toLowerCase();
  if (c.aud !== clientId || c.nonce !== flow.nonce || !(c.exp * 1000 > Date.now()) || String(c.iss || '') !== `https://login.microsoftonline.com/${tid}/v2.0`) return denied('The sign-in could not be verified.');
  if (!allowList().some((a) => a.email === email && a.tid === tid)) return denied(`${email || 'This account'} is not on the list for this demo.`);

  const headers = new Headers({ Location: `${BASE_URL}/`, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, newSession(email, String(c.name || email), tid), 12 * 3600));
  headers.append('Set-Cookie', cookie(FLOW_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}
