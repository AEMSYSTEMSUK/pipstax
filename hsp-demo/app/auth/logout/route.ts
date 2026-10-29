import { BASE_URL, SESSION_COOKIE, cookie } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://login.microsoftonline.com/organizations/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(BASE_URL + '/auth/login')}`,
      'Set-Cookie': cookie(SESSION_COOKIE, '', 0),
      'Cache-Control': 'no-store',
    },
  });
}
