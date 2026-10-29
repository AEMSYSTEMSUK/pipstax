'use client';
// Small classic-form building blocks shared by every window.
import { ReactNode, useEffect, useMemo, useState } from 'react';

export const gbp = (v: number) => (v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (v: number) => (v || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 });
export const ukDate = (s: string) => (s && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || '');

export function useApi<T = any>(url: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url).then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.error || 'Not found'); else setData(j); }).catch((e) => live && setErr(String(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  return { data, err, reload: () => setTick((t) => t + 1) };
}

export function F({ label, value, num, wide }: { label: string; value: any; num?: boolean; wide?: boolean }) {
  return (
    <div className="fld" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <div className={'box ro' + (num ? ' num' : '')} title={String(value ?? '')}>{value ?? ''}</div>
    </div>
  );
}

export function Tabs({ tabs }: { tabs: { name: string; body: ReactNode }[] }) {
  const [on, setOn] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="tabs">{tabs.map((t, i) => <div key={t.name} className={'tab' + (i === on ? ' on' : '')} onClick={() => setOn(i)}>{t.name}</div>)}</div>
      <div className="tabpane">{tabs[on]?.body}</div>
    </div>
  );
}

export type Col = { h: string; k?: string; r?: boolean; w?: number; f?: (row: any) => ReactNode };
export function Grid({ rows, cols, onOpen, rowClass, height }: { rows: any[]; cols: Col[]; onOpen?: (r: any) => void; rowClass?: (r: any) => string; height?: number }) {
  const [sel, setSel] = useState(-1);
  return (
    <div className="gridwrap" style={height ? { flex: 'none', height } : undefined}>
      <table className="g">
        <thead><tr>{cols.map((c) => <th key={c.h} className={c.r ? 'r' : ''} style={c.w ? { width: c.w } : undefined}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={(i === sel ? 'sel ' : '') + (rowClass ? rowClass(row) : '')} onClick={() => setSel(i)} onDoubleClick={() => onOpen?.(row)}>
              {cols.map((c) => <td key={c.h} className={c.r ? 'r' : ''}>{c.f ? c.f(row) : String(row[c.k as string] ?? '')}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length} style={{ color: '#888', padding: 8 }}>No records</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Searchable list window body (the Javelin-style "Enquiry" grids): type to filter, double-click to open.
export function ListBody({ rows, cols, onOpen, keys, placeholder }: { rows: any[]; cols: Col[]; onOpen: (r: any) => void; keys: string[]; placeholder: string }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? rows.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(s))) : rows).slice(0, 500);
  }, [q, rows, keys]);
  return (
    <>
      <div className="find">
        <span>Find:</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus />
        <span className="hint">{shown.length} of {rows.length} records - double-click a line to open it</span>
      </div>
      <Grid rows={shown} cols={cols} onOpen={onOpen} />
    </>
  );
}

export function Status({ s }: { s: string }) {
  const cls = /complete|yes|y$|passed|invoiced/i.test(s) ? 'g' : /progress|part/i.test(s) ? 'a' : /late|held|no$/i.test(s) ? 'r' : 'b';
  return <span className={'pill ' + cls}>{s}</span>;
}
