import { BASE_URL, FLOW_COOKIE, cookie, getSecrets, randomToken, sign } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Start Microsoft sign-in: remember state + nonce in a short-lived signed cookie, then redirect.
export async function GET() {
  const state = randomToken(), nonce = randomToken();
  const q = new URLSearchParams({
    client_id: getSecrets().clientId,
    response_type: 'code',
    redirect_uri: `${BASE_URL}/auth/callback`,
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    nonce,
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?${q}`,
      'Set-Cookie': cookie(FLOW_COOKIE, sign({ state, nonce, exp: Date.now() + 10 * 60e3 }), 600),
      'Cache-Control': 'no-store',
    },
  });
}
