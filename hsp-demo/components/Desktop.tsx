'use client';
// MDI shell: title bar, menu bar, toolbar, workspace of draggable child windows, status bar.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as W from './Windows';
import { useApi } from './ui';

type Win = { key: string; kind: string; id?: string; title: string; x: number; y: number; w: number; h: number; z: number; max?: boolean };

const KINDS: Record<string, { title: (id?: string) => string; w: number; h: number; C: any }> = {
  dashboard: { title: () => 'Desktop', w: 1100, h: 640, C: W.Dashboard },
  partList: { title: () => 'Part Enquiry', w: 820, h: 480, C: W.PartList },
  part: { title: (id) => `Part Maintenance - ${id}`, w: 900, h: 560, C: W.PartWin },
  soList: { title: () => 'Sales Order Enquiry', w: 860, h: 480, C: W.SOList },
  so: { title: (id) => `Sales Order - ${id}`, w: 980, h: 560, C: W.SOWin },
  woList: { title: () => 'Works Order Enquiry', w: 820, h: 480, C: W.WOList },
  wo: { title: (id) => `Works Order - ${id}`, w: 980, h: 600, C: W.WOWin },
  poList: { title: () => 'Purchase Order Enquiry', w: 860, h: 480, C: W.POList },
  po: { title: (id) => `Purchase Order - ${id}`, w: 980, h: 580, C: W.POWin },
  grnList: { title: () => 'Goods Received Enquiry', w: 900, h: 480, C: W.GRNList },
  stock: { title: () => 'Stock Enquiry', w: 960, h: 540, C: W.StockWin },
  dnList: { title: () => 'Delivery Note Enquiry', w: 820, h: 480, C: W.DNList },
  dn: { title: (id) => `Delivery Note - ${id}`, w: 940, h: 540, C: W.DNWin },
  invList: { title: () => 'Invoice Enquiry', w: 860, h: 480, C: W.InvList },
  inv: { title: (id) => `Sales Invoice - ${id}`, w: 940, h: 520, C: W.InvWin },
  cocList: { title: () => 'Certificates of Conformity', w: 820, h: 480, C: W.CoCList },
  about: { title: () => 'About HSP Production Control', w: 520, h: 220, C: W.About },
};

const MENUS: { name: string; ico?: string; items: ([string, string, string?] | '-')[] }[] = [
  { name: 'File', items: [['Desktop', 'dashboard', 'D'], '-', ['Printer Setup…', '', ''], ['Change Company…', '', ''], '-', ['Exit System', 'exit', '']] },
  { name: 'Sales', items: [['Sales Order Enquiry', 'soList', 'S'], ['Customer Price Books', '', ''], ['Quotations', '', ''], '-', ['Delivery Notes', 'dnList', ''], ['Certificates of Conformity', 'cocList', '']] },
  { name: 'Production', items: [['Part Enquiry', 'partList', 'P'], ['Works Order Enquiry', 'woList', 'W'], ['Shop Floor Booking', 'woList', ''], '-', ['Bills of Materials', 'partList', ''], ['Routings', 'partList', ''], ['MRP', '', '']] },
  { name: 'Purchasing', items: [['Purchase Order Enquiry', 'poList', 'O'], ['Goods Received', 'grnList', 'G'], ['Subcontract', 'poList', ''], ['Suppliers', '', '']] },
  { name: 'Stock', items: [['Stock Enquiry', 'stock', 'K'], ['Stock Movements', 'stock', ''], ['Stock Check', '', '']] },
  { name: 'Accounts', items: [['Sales Invoices', 'invList', 'I'], ['Credit Notes', '', ''], ['Accounts Export', '', '']] },
  { name: 'Quality', items: [['Certificates of Conformity', 'cocList', 'C'], ['Release Notes', 'dnList', ''], ['Non-Conformance', '', ''], ['Traceability', 'grnList', '']] },
  { name: 'Enquiries', ico: '🔍', items: [['Parts', 'partList', ''], ['Sales Orders', 'soList', ''], ['Works Orders', 'woList', ''], ['Purchase Orders', 'poList', ''], ['Stock', 'stock', ''], ['Goods Received', 'grnList', '']] },
  { name: 'Reports', ico: '📄', items: [['Sales Order Book', 'dashboard', ''], ['Certificates of Conformity', 'cocList', ''], ['Invoice Listing', 'invList', '']] },
  { name: 'Desktop', ico: '🖥', items: [['Show Desktop', 'dashboard', '']] },
  { name: 'Windows', items: [['Cascade', 'cascade', ''], ['Close All', 'closeAll', '']] },
  { name: 'Help', items: [['About', 'about', '']] },
];

export default function Desktop() {
  const { data: lists } = useApi<any>('/api/lists');
  const [wins, setWins] = useState<Win[]>([]);
  const [menu, setMenu] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState('');
  const zTop = useRef(10);
  const ws = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = () => setNow(new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })); t(); const i = setInterval(t, 30000); return () => clearInterval(i); }, []);
  const toast = useCallback((s: string) => { setMsg(s); setTimeout(() => setMsg(''), 3500); }, []);

  const open = useCallback((kind: string, id?: string) => {
    if (kind === 'exit') return toast('This is a demo - there is nothing to exit');
    if (kind === 'cascade') return setWins((ws0) => ws0.map((w, i) => ({ ...w, x: 20 + i * 26, y: 14 + i * 26, max: false })));
    if (kind === 'closeAll') return setWins([]);
    const def = KINDS[kind]; if (!def) return toast('Not part of this demo');
    const key = kind + ':' + (id || '');
    setWins((ws0) => {
      const ex = ws0.find((w) => w.key === key);
      if (ex) return ws0.map((w) => (w.key === key ? { ...w, z: ++zTop.current } : w));
      const n = ws0.length;
      const box = ws.current?.getBoundingClientRect();
      const bw = box?.width || 1200, bh = box?.height || 700;
      return [...ws0, { key, kind, id, title: def.title(id), x: Math.min(30 + n * 24, Math.max(0, bw - def.w - 10)), y: Math.min(14 + n * 24, Math.max(0, bh - def.h - 10)), w: Math.min(def.w, bw - 20), h: Math.min(def.h, bh - 20), z: ++zTop.current }];
    });
  }, [toast]);

  // ?open=wo:100053948,part:HSP2560-FS opens those windows on load (deep links for the demo script); ?max=1 maximises the last.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const list = (sp.get('open') || '').split(',').filter(Boolean);
    if (!list.length) return open('dashboard');
    for (const item of list) { const i = item.indexOf(':'); open(i < 0 ? item : item.slice(0, i), i < 0 ? undefined : item.slice(i + 1)); }
    if (sp.get('max')) setTimeout(() => setWins((ws0) => ws0.map((w, i) => (i === ws0.length - 1 ? { ...w, max: true } : w))), 0);
  }, [open]);
  useEffect(() => { const c = () => setMenu(null); window.addEventListener('click', c); return () => window.removeEventListener('click', c); }, []);

  const drag = (e: React.MouseEvent, key: string, mode: 'move' | 'size') => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const w0 = wins.find((w) => w.key === key)!;
    const mv = (ev: MouseEvent) => setWins((ws0) => ws0.map((w) => (w.key !== key ? w : mode === 'move' ? { ...w, x: Math.max(0, w0.x + ev.clientX - start.x), y: Math.max(0, w0.y + ev.clientY - start.y) } : { ...w, w: Math.max(380, w0.w + ev.clientX - start.x), h: Math.max(200, w0.h + ev.clientY - start.y) })));
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const focus = (key: string) => setWins((ws0) => ws0.map((w) => (w.key === key ? { ...w, z: ++zTop.current } : w)));
  const top = wins.reduce((a, w) => (w.z > (a?.z || 0) ? w : a), null as Win | null);

  return (
    <div className="app">
      <div className="titlebar">
        <div className="logo">HSP</div>
        <div className="t">Hydraulic System Products Ltd - CLOUD - HSP Production Control (cloud demo){top ? ` - [${top.title}]` : ''}</div>
        <div className="wb">—</div><div className="wb">☐</div><div className="wb x">✕</div>
      </div>
      <div className="menubar" onClick={(e) => e.stopPropagation()}>
        {MENUS.map((m, i) => (
          <div key={m.name} className={'mi' + (menu === i ? ' open' : '')} onClick={() => setMenu(menu === i ? null : i)} onMouseEnter={() => menu !== null && setMenu(i)}>
            {m.ico && <span className="ico">{m.ico}</span>}{m.name}
            {menu === i && (
              <div className="dropdown">
                {m.items.map((it, j) => it === '-' ? <div key={j} className="sep" /> : (
                  <div key={j} className={'di' + (it[1] ? '' : ' dis')} onClick={(e) => { e.stopPropagation(); setMenu(null); if (it[1]) open(it[1]); }}>{it[0]}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="toolbar">
        {[['🖥', 'Desktop', 'dashboard'], ['🧩', 'Parts', 'partList'], ['🧾', 'Sales Orders', 'soList'], ['⚙', 'Works Orders', 'woList'], ['🛒', 'Purchase Orders', 'poList'], ['📥', 'Goods In', 'grnList'], ['📦', 'Stock', 'stock'], ['🚚', 'Despatch', 'dnList'], ['💷', 'Invoices', 'invList'], ['✅', 'C of C', 'cocList']].map(([i, t, k], n) => (
          <span key={k} style={{ display: 'contents' }}>{n === 1 || n === 5 || n === 8 ? <span className="tb-sep" /> : null}<button className="tb" onClick={() => open(k)}><span className="ico">{i}</span>{t}</button></span>
        ))}
      </div>
      <div className="workspace" ref={ws}>
        {lists && wins.map((w) => {
          const C = KINDS[w.kind].C;
          return (
            <div key={w.key} className={'win' + (top?.key === w.key ? ' active' : '') + (w.max ? ' max' : '')} style={{ left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z }} onMouseDown={() => focus(w.key)}>
              <div className="wt" onMouseDown={(e) => drag(e, w.key, 'move')} onDoubleClick={() => setWins((ws0) => ws0.map((x) => (x.key === w.key ? { ...x, max: !x.max } : x)))}>
                <span className="t">{w.title}</span>
                <span className="wb" onMouseDown={(e) => e.stopPropagation()} onClick={() => setWins((ws0) => ws0.map((x) => (x.key === w.key ? { ...x, max: !x.max } : x)))}>☐</span>
                <span className="wb x" onMouseDown={(e) => e.stopPropagation()} onClick={() => setWins((ws0) => ws0.filter((x) => x.key !== w.key))}>✕</span>
              </div>
              <div className="wbody"><C id={w.id} open={open} lists={lists} toast={toast} /></div>
              <div className="resize" onMouseDown={(e) => drag(e, w.key, 'size')} />
            </div>
          );
        })}
        {msg && <div className="toast">{msg}</div>}
        <div className="banner">Demonstration - real HSP data, hosted by AEM Systems</div>
        <div className="cornerbtns">
          <button className="btn" disabled>Remove From Favourites</button>
          <button className="btn" onClick={() => toast('Added to Favourites')}>Add to Favourites</button>
          <button className="btn" onClick={() => location.reload()}>Refresh</button>
          <button className="btn" onClick={() => open('exit')}>Exit System</button>
        </div>
      </div>
      <div className="statusbar">
        <div className="cell">Query</div>
        <div className="cell">HSP</div>
        <div className="cell">DEMO.USER</div>
        <div className="cell grow" />
        <div className="cell">{lists ? `${lists.parts.length} parts · ${lists.sos.length} sales orders · ${lists.wos.length} works orders` : 'Loading…'}</div>
        <div className="cell">{now}</div>
      </div>
    </div>
  );
}
