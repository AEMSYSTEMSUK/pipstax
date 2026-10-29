import { NextRequest } from 'next/server';
import { BASE_URL, FLOW_COOKIE, SESSION_COOKIE, allowList, cookie, newSession, page, readCookie, unsign, verifyIdToken } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const denied = (why: string) => page('Not authorised', `<b>Not authorised</b><p>${esc(why)}</p><p>This demo is only open to invited accounts. If you think you should have access, contact AEM Systems.</p><a class="btn" href="/auth/logout">Try a different account</a>`, 403);

// Microsoft form_posts id_token + state here.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return denied('Sign-in response was not understood.');
  if (form.get('error')) return denied(String(form.get('error_description') || '').split('\n')[0] || 'Sign-in was cancelled.');
  const flow = unsign<{ state: string; nonce: string }>(readCookie(req.headers.get('cookie'), FLOW_COOKIE));
  if (!flow || flow.state !== String(form.get('state') || '')) return denied('Your sign-in expired - please start again.');

  let c: any;
  try { c = await verifyIdToken(String(form.get('id_token') || ''), flow.nonce); }
  catch { return denied('The sign-in could not be verified.'); }

  const tid = String(c.tid).toLowerCase();
  const email = String(c.preferred_username || c.email || '').toLowerCase();
  if (!allowList().some((a) => a.email === email && a.tid === tid)) return denied(`${email || 'This account'} is not on the list for this demo.`);

  // 303 so the browser follows with a GET
  const headers = new Headers({ Location: `${BASE_URL}/`, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, newSession(email, String(c.name || email), tid), 12 * 3600));
  headers.append('Set-Cookie', cookie(FLOW_COOKIE, '', 0, 'None'));
  return new Response(null, { status: 303, headers });
}

export async function GET() {
  return new Response(null, { status: 302, headers: { Location: `${BASE_URL}/auth/login` } });
}
