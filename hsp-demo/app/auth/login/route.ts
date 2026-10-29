import { BASE_URL, CLIENT_ID, FLOW_COOKIE, cookie, randomToken, sign } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Start Microsoft sign-in (secretless id_token flow): remember state + nonce in a short-lived signed cookie, then
// redirect. Microsoft posts the id_token back to /auth/callback (form_post).
export async function GET() {
  const state = randomToken(), nonce = randomToken();
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'id_token',
    redirect_uri: `${BASE_URL}/auth/callback`,
    response_mode: 'form_post',
    scope: 'openid profile email',
    state,
    nonce,
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?${q}`,
      'Set-Cookie': cookie(FLOW_COOKIE, sign({ state, nonce, exp: Date.now() + 10 * 60e3 }), 600, 'None'),
      'Cache-Control': 'no-store',
    },
  });
}
