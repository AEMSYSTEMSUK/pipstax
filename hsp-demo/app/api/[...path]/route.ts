import { NextRequest, NextResponse } from 'next/server';
import * as D from '../../../lib/data';

export const dynamic = 'force-dynamic';

// GET /api/lists | /api/dashboard | /api/part/<id> | /api/so/<id> | /api/wo/<id> | /api/po/<id> | /api/dn/<id> | /api/inv/<id> | /api/stock?part=&store=
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const [kind, ...rest] = (await ctx.params).path;
  const id = decodeURIComponent(rest.join('/'));
  const q = req.nextUrl.searchParams;
  const fns: Record<string, () => any> = {
    lists: () => D.lists(),
    dashboard: () => D.dashboard(),
    part: () => D.part(id),
    so: () => D.so(id),
    wo: () => D.wo(id),
    po: () => D.po(id),
    dn: () => D.dn(id),
    inv: () => D.inv(id),
    stock: () => D.stock(q.get('part') || undefined, q.get('store') || undefined),
  };
  const fn = fns[kind];
  if (!fn) return NextResponse.json({ error: 'unknown' }, { status: 404 });
  const out = fn();
  return out == null ? NextResponse.json({ error: 'not found' }, { status: 404 }) : NextResponse.json(out);
}

// POST /api/book {wo,op,clock,good,scrap,mins} | /api/receive {po,line,qty,cert,advice}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const [kind] = (await ctx.params).path;
  const body = await req.json();
  try {
    if (kind === 'book') return NextResponse.json(D.bookOperation({ wo: String(body.wo), op: String(body.op), clock: String(body.clock || ''), good: Number(body.good) || 0, scrap: Number(body.scrap) || 0, mins: Number(body.mins) || 0 }));
    if (kind === 'receive') return NextResponse.json(D.receiveGoods({ po: String(body.po), line: String(body.line), qty: Number(body.qty) || 0, cert: String(body.cert || ''), advice: String(body.advice || '') }));
    return NextResponse.json({ error: 'unknown' }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
