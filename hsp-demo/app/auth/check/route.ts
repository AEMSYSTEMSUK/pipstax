import { sessionFrom } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// nginx auth_request target: 204 when the session cookie is valid and still on the allow-list, else 401.
export async function GET(req: Request) {
  const s = sessionFrom(req.headers.get('cookie'));
  return new Response(null, { status: s ? 204 : 401, headers: s ? { 'X-User': s.email } : {} });
}
