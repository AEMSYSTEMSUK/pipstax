'use client';
// The contents of each MDI child window. Every screen reads real HSP records through /api.
import { useState } from 'react';
import { F, Grid, ListBody, Status, Tabs, gbp, qty, ukDate, useApi } from './ui';

export type Open = (kind: string, id?: string) => void;
type P = { id?: string; open: Open; lists: any; toast: (s: string) => void };

const L = (open: Open, kind: string, label: string) => (v: string) => (v ? <span className="link" onClick={() => open(kind, v)}>{label || v}</span> : null);

// ---------------- lists ----------------
export function PartList({ open, lists }: P) {
  return <ListBody rows={lists.parts} keys={['id', 'desc', 'group']} placeholder="Part number or description" onOpen={(r) => open('part', r.id)}
    cols={[{ h: 'Part Number', k: 'id', w: 170 }, { h: 'Description', k: 'desc', w: 260 }, { h: 'Product Group', k: 'group' }, { h: 'UOM', k: 'uom' }, { h: 'Stocked', k: 'type' }, { h: 'ABC', k: 'abc' }]} />;
}
export function SOList({ open, lists }: P) {
  return <ListBody rows={lists.sos} keys={['id', 'name', 'cust', 'po']} placeholder="SO no, customer or their PO" onOpen={(r) => open('so', r.id)}
    cols={[{ h: 'SO No', k: 'id' }, { h: 'Date', f: (r) => ukDate(r.date) }, { h: 'Customer', k: 'cust' }, { h: 'Name', k: 'name', w: 240 }, { h: 'Customer PO', k: 'po' }, { h: 'Order Value', r: true, f: (r) => gbp(r.value) }]} />;
}
export function WOList({ open, lists }: P) {
  return <ListBody rows={lists.wos} keys={['id', 'part', 'so', 'status']} placeholder="WO no, part or SO" onOpen={(r) => open('wo', r.id)}
    cols={[{ h: 'WO No', k: 'id' }, { h: 'Part Number', k: 'part', w: 170 }, { h: 'Qty', r: true, f: (r) => qty(r.qty) }, { h: 'Start', f: (r) => ukDate(r.start) }, { h: 'End', f: (r) => ukDate(r.end) }, { h: 'SO No', k: 'so' }, { h: 'Status', f: (r) => <Status s={r.status} /> }]} />;
}
export function POList({ open, lists }: P) {
  return <ListBody rows={lists.pos} keys={['id', 'name', 'supp']} placeholder="PO no or supplier" onOpen={(r) => open('po', r.id)}
    cols={[{ h: 'PO No', k: 'id' }, { h: 'Date', f: (r) => ukDate(r.date) }, { h: 'Supplier', k: 'supp' }, { h: 'Name', k: 'name', w: 240 }, { h: 'Type', f: (r) => ({ P: 'Purchase', S: 'Subcontract', M: 'Consumable', C: 'Call-off' } as any)[r.type] || r.type }, { h: 'Value', r: true, f: (r) => gbp(r.value) }]} />;
}
export function GRNList({ open, lists }: P) {
  return <ListBody rows={lists.grns} keys={['id', 'po', 'part', 'cert']} placeholder="GRN, PO, part or cert ref" onOpen={(r) => open('po', r.po)}
    cols={[{ h: 'GRN No', k: 'id' }, { h: 'Received', f: (r) => ukDate(r.date) }, { h: 'PO No', k: 'po' }, { h: 'Part Number', k: 'part', w: 170 }, { h: 'Qty', r: true, f: (r) => qty(r.qty) }, { h: "Supplier's Cert", k: 'cert' }, { h: 'Received By', k: 'by' }]} />;
}
export function DNList({ open, lists }: P) {
  return <ListBody rows={lists.dns} keys={['id', 'name', 'cust']} placeholder="Delivery note or customer" onOpen={(r) => open('dn', r.id)}
    cols={[{ h: 'Del Note', k: 'id' }, { h: 'Date', f: (r) => ukDate(r.date) }, { h: 'Customer', k: 'cust' }, { h: 'Deliver To', k: 'name', w: 260 }, { h: 'Items', r: true, k: 'items' }, { h: 'Invoiced', f: (r) => <Status s={r.invoiced === 'Y' ? 'Invoiced' : 'Not invoiced'} /> }]} />;
}
export function InvList({ open, lists }: P) {
  return <ListBody rows={lists.invs} keys={['id', 'name', 'cust']} placeholder="Invoice or customer" onOpen={(r) => open('inv', r.id)}
    cols={[{ h: 'Invoice No', k: 'id' }, { h: 'Date', f: (r) => ukDate(r.date) }, { h: 'Customer', k: 'cust' }, { h: 'Name', k: 'name', w: 240 }, { h: 'Net', r: true, f: (r) => gbp(r.net) }, { h: 'VAT', r: true, f: (r) => gbp(r.vat) }, { h: 'Total', r: true, f: (r) => gbp(r.total) }]} />;
}
export function CoCList({ open, lists }: P) {
  return (
    <>
      <div className="hint">Pick a delivery note to raise its Certificate of Conformity. The certificate pulls the delivered parts, the works orders that made them and the suppliers&apos; material certificates from goods-in.</div>
      <ListBody rows={lists.dns} keys={['id', 'name', 'cust']} placeholder="Delivery note or customer" onOpen={(r) => window.open('/coc/' + encodeURIComponent(r.id), '_blank')}
        cols={[{ h: 'Del Note', k: 'id' }, { h: 'Date', f: (r) => ukDate(r.date) }, { h: 'Customer', k: 'name', w: 280 }, { h: 'Items', r: true, k: 'items' }, { h: '', f: (r) => <span className="link" onClick={() => window.open('/coc/' + encodeURIComponent(r.id), '_blank')}>Certificate…</span> }]} />
    </>
  );
}

// ---------------- details ----------------
export function PartWin({ id, open }: P) {
  const { data: p, err } = useApi<any>('/api/part/' + encodeURIComponent(id!));
  if (err) return <div>{err}</div>;
  if (!p) return <div className="hint">Loading…</div>;
  return (
    <>
      <div className="grid2">
        <F label="Part Number" value={p.id} /><F label="Issue" value={p.issue} />
        <F label="Description" value={p.desc} wide /><F label="Secondary Desc" value={p.desc2} wide />
      </div>
      <Tabs tabs={[
        { name: 'General', body: (
          <div className="grid3">
            <F label="Product Group" value={p.group} /><F label="Make/Buy" value={p.mbf} /><F label="ABC Code" value={p.abc} />
            <F label="Stocking UOM" value={p.uom.stock} /><F label="Buying UOM" value={p.uom.buy} /><F label="Selling UOM" value={p.uom.sell} />
            <F label="Lead Time (days)" value={p.lead} num /><F label="Normal Batch" value={qty(p.batch)} num /><F label="Min Order Qty" value={qty(p.minOrder)} num />
            <F label="Reorder Qty" value={qty(p.reorderQty)} num /><F label="Normal Store" value={p.store} /><F label="Row" value={p.row} />
            <F label="Weight (kg)" value={p.weight} num /><F label="Method" value={p.method} /><F label="Free Stock" value={qty(p.onHand)} num />
            <div style={{ gridColumn: '1 / -1' }} className="fld"><label>Narrative</label><textarea className="box ro" readOnly value={p.narr} /></div>
          </div>) },
        { name: `Bill of Materials (${p.bom.length})`, body: <Grid rows={p.bom} onOpen={(r: any) => open('part', r.part)} cols={[{ h: 'Item', k: 'item' }, { h: 'Component', k: 'part', w: 170 }, { h: 'Description', k: 'desc', w: 240 }, { h: 'Qty Per', r: true, f: (r: any) => qty(r.qty) }, { h: 'UOM', k: 'uom' }, { h: 'Issue', k: 'issue' }]} /> },
        { name: `Routing (${p.routing.length})`, body: <Grid rows={p.routing} cols={[{ h: 'Op', k: 'op' }, { h: 'Work Centre', k: 'wc' }, { h: 'Description', k: 'wcDesc', w: 200 }, { h: 'Setup (mins)', r: true, f: (r: any) => qty(r.setup) }, { h: 'Run (mins ea)', r: true, f: (r: any) => qty(r.run) }, { h: 'Subcon Supplier', k: 'supplier' }, { h: 'Process Spec', k: 'spec' }]} /> },
        { name: `Stock (${p.stock.length})`, body: <Grid rows={p.stock} cols={[{ h: 'Store', k: 'store' }, { h: 'Row', k: 'row' }, { h: 'Bin', k: 'bin' }, { h: 'Batch / ROO', k: 'roo' }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }]} /> },
        { name: `Where Used (${p.whereUsed.length})`, body: <Grid rows={p.whereUsed} onOpen={(r: any) => open('part', r.parent)} cols={[{ h: 'Parent Part', k: 'parent', w: 200 }, { h: 'Description', k: 'desc', w: 260 }, { h: 'Qty Per', r: true, f: (r: any) => qty(r.qty) }]} /> },
      ]} />
    </>
  );
}

export function SOWin({ id, open }: P) {
  const { data: s, err } = useApi<any>('/api/so/' + encodeURIComponent(id!));
  if (err) return <div>{err}</div>;
  if (!s) return <div className="hint">Loading…</div>;
  return (
    <>
      <div className="grid3">
        <F label="SO Number" value={s.id} /><F label="Order Date" value={ukDate(s.date)} /><F label="Revision" value={s.revision} />
        <F label="Customer" value={s.cust} /><F label="Customer PO" value={s.po} /><F label="Terms" value={s.terms} />
        <F label="Name" value={s.name} wide />
      </div>
      <Tabs tabs={[
        { name: `Lines (${s.lines.length})`, body: <Grid rows={s.lines} onOpen={(r: any) => open('part', r.part)} cols={[{ h: 'Line', k: 'line' }, { h: 'Part Number', k: 'part', w: 160 }, { h: 'Description', k: 'desc', w: 200 }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Delivered', r: true, f: (r: any) => qty(r.del) }, { h: 'Due', f: (r: any) => ukDate(r.due) }, { h: 'Promise', f: (r: any) => ukDate(r.promise) }, { h: 'Price', r: true, f: (r: any) => gbp(r.price) }, { h: 'Value', r: true, f: (r: any) => gbp(r.value) }, { h: 'Status', f: (r: any) => <Status s={r.full === 'Y' ? 'Complete' : r.del > 0 ? 'Part delivered' : 'Open'} /> }]} /> },
        { name: 'Addresses', body: (
          <div className="grid2">
            <fieldset><legend>Deliver To</legend><F label="Name" value={s.delName} /><div className="fld"><label>Address</label><textarea className="box ro" readOnly value={s.delAdds} /></div><F label="Postcode" value={s.delPost} /></fieldset>
            <fieldset><legend>Invoice To</legend><F label="Name" value={s.invName} /><div className="fld"><label>Address</label><textarea className="box ro" readOnly value={s.invAdds} /></div><F label="Email" value={s.email} /></fieldset>
          </div>) },
        { name: `Works Orders (${s.wos.length})`, body: <Grid rows={s.wos} onOpen={(r: any) => open('wo', r.id)} cols={[{ h: 'WO No', k: 'id' }, { h: 'Part', k: 'part', w: 170 }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Status', f: (r: any) => <Status s={r.status} /> }]} /> },
        { name: `Deliveries (${s.dns.length})`, body: <Grid rows={s.dns.map((x: string) => ({ id: x }))} onOpen={(r: any) => open('dn', r.id)} cols={[{ h: 'Delivery Note', k: 'id' }, { h: '', f: (r: any) => <span className="link" onClick={() => open('dn', r.id)}>Open</span> }]} /> },
      ]} />
      <div className="grid3"><div /><div /><F label="Order Value £" value={gbp(s.value)} num /></div>
    </>
  );
}

export function WOWin({ id, open, toast }: P) {
  const { data: w, err, reload } = useApi<any>('/api/wo/' + encodeURIComponent(id!));
  const [b, setB] = useState({ op: '', clock: '', good: '', scrap: '', mins: '' });
  if (err) return <div>{err}</div>;
  if (!w) return <div className="hint">Loading…</div>;
  const book = async () => {
    const r = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wo: w.id, ...b }) });
    const j = await r.json();
    if (!r.ok) return toast(j.error);
    toast(`Booked ${b.good || 0} good on op ${b.op}`); setB({ ...b, good: '', scrap: '', mins: '' }); reload();
  };
  return (
    <>
      <div className="grid3">
        <F label="WO Number" value={w.id} /><F label="Status" value={w.status} /><F label="Priority" value={w.priority} />
        <F label="Part Number" value={w.part} /><F label="Quantity" value={qty(w.qty)} num /><F label="Qty Stored" value={qty(w.stored)} num />
        <F label="Description" value={w.desc} wide />
        <F label="Start Date" value={ukDate(w.start)} /><F label="End Date" value={ukDate(w.end)} /><div className="fld"><label>Sales Order</label><div className="box ro">{L(open, 'so', w.so)(w.so)}</div></div>
      </div>
      <Tabs tabs={[
        { name: `Operations (${w.ops.length})`, body: <Grid rows={w.ops} cols={[{ h: 'Op', k: 'op' }, { h: 'Work Centre', k: 'wc' }, { h: 'Description', k: 'wcDesc', w: 190 }, { h: 'Setup', r: true, f: (r: any) => qty(r.setup) }, { h: 'Run Ea', r: true, f: (r: any) => qty(r.run) }, { h: 'Qty Done', r: true, f: (r: any) => qty(r.done) }, { h: 'Status', f: (r: any) => <Status s={r.complete ? 'Complete' : r.done > 0 ? 'In Progress' : 'Waiting'} /> }]} /> },
        { name: `Materials (${w.mats.length})`, body: <Grid rows={w.mats} onOpen={(r: any) => open('part', r.part)} cols={[{ h: 'Part', k: 'part', w: 170 }, { h: 'Description', k: 'desc', w: 200 }, { h: 'Required', r: true, f: (r: any) => qty(r.req) }, { h: 'Issued', r: true, f: (r: any) => qty(r.issued) }, { h: 'Due', f: (r: any) => ukDate(r.due) }, { h: 'Status', f: (r: any) => <Status s={r.complete ? 'Complete' : 'Open'} /> }]} /> },
        { name: `Shop Floor Bookings (${w.bookings.length})`, body: (
          <>
            <Grid rows={w.bookings} rowClass={(r: any) => (r.demo ? 'demo' : '')} cols={[{ h: 'Date', f: (r: any) => ukDate(r.date) }, { h: 'Op', k: 'op' }, { h: 'Clock', k: 'clock' }, { h: 'Operator', k: 'name' }, { h: 'Good', r: true, f: (r: any) => qty(r.good) }, { h: 'Scrap', r: true, f: (r: any) => qty(r.scrap) }, { h: 'Mins', r: true, f: (r: any) => qty(r.mins) }, { h: 'User', k: 'user' }]} />
            <fieldset><legend>Book Operation</legend>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Op</span><select className="box" value={b.op} onChange={(e) => setB({ ...b, op: e.target.value })}><option value="">-</option>{w.ops.map((o: any) => <option key={o.op} value={o.op}>{o.op} {o.wc}</option>)}</select>
                <span>Operator</span><select className="box" value={b.clock} onChange={(e) => setB({ ...b, clock: e.target.value })}><option value="">-</option>{w.operators.map((o: any) => <option key={o.clock} value={o.clock}>{o.clock} {o.name}</option>)}</select>
                <span>Good</span><input className="box" style={{ width: 60 }} value={b.good} onChange={(e) => setB({ ...b, good: e.target.value })} />
                <span>Scrap</span><input className="box" style={{ width: 50 }} value={b.scrap} onChange={(e) => setB({ ...b, scrap: e.target.value })} />
                <span>Mins</span><input className="box" style={{ width: 50 }} value={b.mins} onChange={(e) => setB({ ...b, mins: e.target.value })} />
                <button className="btn def" onClick={book} disabled={!b.op}>Book</button>
              </div>
            </fieldset>
          </>) },
      ]} />
      <div className="hint">Created {ukDate(w.created)} by {w.createdBy} - planner {w.planner}</div>
    </>
  );
}

export function POWin({ id, toast, open }: P) {
  const { data: p, err, reload } = useApi<any>('/api/po/' + encodeURIComponent(id!));
  const [g, setG] = useState({ line: '', qty: '', cert: '', advice: '' });
  if (err) return <div>{err}</div>;
  if (!p) return <div className="hint">Loading…</div>;
  const receive = async () => {
    const r = await fetch('/api/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ po: p.id, ...g }) });
    const j = await r.json();
    if (!r.ok) return toast(j.error);
    toast(`Goods received - ${j.grn}`); setG({ line: '', qty: '', cert: '', advice: '' }); reload();
  };
  return (
    <>
      <div className="grid3">
        <F label="PO Number" value={p.id} /><F label="Order Date" value={ukDate(p.date)} /><F label="Order Type" value={p.type} />
        <F label="Supplier" value={p.supp} /><F label="Revision" value={p.rev} /><F label="Authorised By" value={p.authoriser} />
        <F label="Name" value={p.name} wide />
      </div>
      <Tabs tabs={[
        { name: `Lines (${p.lines.length})`, body: <Grid rows={p.lines} onOpen={(r: any) => open('part', r.part)} cols={[{ h: 'Line', k: 'line' }, { h: 'Part Number', k: 'part', w: 150 }, { h: 'Description', k: 'desc', w: 200 }, { h: 'Due', f: (r: any) => ukDate(r.due) }, { h: 'Ordered', r: true, f: (r: any) => qty(r.ordered) }, { h: 'Received', r: true, f: (r: any) => qty(r.received) }, { h: 'Price', r: true, f: (r: any) => gbp(r.price) }, { h: 'Value', r: true, f: (r: any) => gbp(r.value) }]} /> },
        { name: `Goods In (${p.grns.length})`, body: (
          <>
            <Grid rows={p.grns} rowClass={(r: any) => (r.demo ? 'demo' : '')} cols={[{ h: 'GRN No', k: 'id' }, { h: 'Line', k: 'line' }, { h: 'Part', k: 'part', w: 150 }, { h: 'Received', f: (r: any) => ukDate(r.date) }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Passed', r: true, f: (r: any) => qty(r.passed) }, { h: "Supplier's Cert", k: 'cert' }, { h: 'Advice Note', k: 'advice' }, { h: 'By', k: 'by' }]} />
            <fieldset><legend>Goods Received</legend>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Line</span><select className="box" value={g.line} onChange={(e) => setG({ ...g, line: e.target.value })}><option value="">-</option>{p.lines.map((l: any) => <option key={l.line} value={l.line}>{l.line} {l.part}</option>)}</select>
                <span>Qty</span><input className="box" style={{ width: 60 }} value={g.qty} onChange={(e) => setG({ ...g, qty: e.target.value })} />
                <span>Supplier cert</span><input className="box" style={{ width: 120 }} value={g.cert} onChange={(e) => setG({ ...g, cert: e.target.value })} />
                <span>Advice note</span><input className="box" style={{ width: 100 }} value={g.advice} onChange={(e) => setG({ ...g, advice: e.target.value })} />
                <button className="btn def" onClick={receive} disabled={!g.line}>Receive</button>
              </div>
            </fieldset>
          </>) },
        { name: 'Notes', body: <textarea className="box ro" readOnly value={p.comments} style={{ flex: 1 }} /> },
      ]} />
      <div className="grid3"><F label="Email" value={p.email} /><div /><F label="Order Value £" value={gbp(p.value)} num /></div>
    </>
  );
}

export function DNWin({ id, open }: P) {
  const { data: n, err } = useApi<any>('/api/dn/' + encodeURIComponent(id!));
  if (err) return <div>{err}</div>;
  if (!n) return <div className="hint">Loading…</div>;
  return (
    <>
      <div className="grid3">
        <F label="Delivery Note" value={n.id} /><F label="Date" value={ukDate(n.date)} /><F label="Invoiced" value={n.invoiced === 'Y' ? 'Yes' : 'No'} />
        <F label="Customer" value={n.cust} /><F label="Method" value={n.method} /><F label="Email" value={n.email} />
      </div>
      <div className="grid2">
        <fieldset><legend>Deliver To</legend><F label="Name" value={n.name} /><div className="fld"><label>Address</label><textarea className="box ro" readOnly value={n.adds} /></div><F label="Postcode" value={n.post} /></fieldset>
        <fieldset><legend>Paperwork</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn" onClick={() => window.open('/coc/' + encodeURIComponent(n.id), '_blank')}>Certificate of Conformity…</button>
            <span className="hint">Prints the C of C for every line on this delivery, with works order and material cert traceability.</span>
          </div>
        </fieldset>
      </div>
      <Grid rows={n.lines} onOpen={(r: any) => open('so', r.so)} cols={[{ h: 'SO No', k: 'so' }, { h: 'Line', k: 'line' }, { h: 'Customer PO', k: 'custPo' }, { h: 'Part Number', k: 'part', w: 160 }, { h: 'Description', k: 'desc', w: 220 }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Issue', k: 'issue' }]} />
    </>
  );
}

export function InvWin({ id, open }: P) {
  const { data: v, err } = useApi<any>('/api/inv/' + encodeURIComponent(id!));
  if (err) return <div>{err}</div>;
  if (!v) return <div className="hint">Loading…</div>;
  return (
    <>
      <div className="grid3">
        <F label="Invoice No" value={v.id} /><F label="Date" value={ukDate(v.date)} /><F label="Status" value={v.status} />
        <F label="Customer" value={v.cust} /><F label="Name" value={v.name} wide />
      </div>
      <Grid rows={v.lines} onOpen={(r: any) => open('dn', r.dn)} cols={[{ h: 'Del Note', k: 'dn' }, { h: 'SO No', k: 'so' }, { h: 'Part Number', k: 'part', w: 150 }, { h: 'Description', k: 'desc', w: 200 }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Price', r: true, f: (r: any) => gbp(r.price) }, { h: 'Net', r: true, f: (r: any) => gbp(r.value) }, { h: 'VAT %', r: true, k: 'vatRate' }, { h: 'VAT', r: true, f: (r: any) => gbp(r.vat) }]} />
      <div className="grid3"><F label="Net £" value={gbp(v.net)} num /><F label="VAT £" value={gbp(v.vat)} num /><F label="Total £" value={gbp(v.total)} num /></div>
      <div className="hint">Ready to post to Sage / Xero / QuickBooks from the accounts link.</div>
    </>
  );
}

export function StockWin({ open, lists }: P) {
  const [part, setPart] = useState('');
  const [store, setStore] = useState('');
  const [q, setQ] = useState({ part: '', store: '' });
  const { data } = useApi<any>(`/api/stock?part=${encodeURIComponent(q.part)}&store=${encodeURIComponent(q.store)}`);
  return (
    <>
      <div className="find">
        <span>Part</span><input value={part} onChange={(e) => setPart(e.target.value)} list="partlist" placeholder="All parts" />
        <datalist id="partlist">{lists.parts.slice(0, 600).map((p: any) => <option key={p.id} value={p.id}>{p.desc}</option>)}</datalist>
        <span>Store</span><select className="box" value={store} onChange={(e) => setStore(e.target.value)}><option value="">All</option>{lists.stores.map((s: any) => <option key={s.id} value={s.id}>{s.id} - {s.desc}</option>)}</select>
        <button className="btn def" onClick={() => setQ({ part, store })}>Query</button>
      </div>
      <Tabs tabs={[
        { name: `Balances (${data?.bal.length ?? 0})`, body: <Grid rows={data?.bal || []} onOpen={(r: any) => open('part', r.part)} cols={[{ h: 'Part', k: 'part', w: 170 }, { h: 'Description', k: 'desc', w: 200 }, { h: 'Store', k: 'store' }, { h: 'Row', k: 'row' }, { h: 'Bin', k: 'bin' }, { h: 'Batch / ROO', k: 'roo' }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Last Check', f: (r: any) => ukDate(r.lastCheck) }]} /> },
        { name: `Movements (${data?.moves.length ?? 0})`, body: <Grid rows={data?.moves || []} onOpen={(r: any) => open('part', r.part)} cols={[{ h: 'Date', k: 'date' }, { h: 'Part', k: 'part', w: 160 }, { h: 'Store', k: 'store' }, { h: 'Bin', k: 'bin' }, { h: 'Qty', r: true, f: (r: any) => qty(r.qty) }, { h: 'Transaction', k: 'type', w: 160 }, { h: 'Ref', k: 'ref' }, { h: 'User', k: 'user' }]} /> },
      ]} />
    </>
  );
}

// ---------------- desktop dashboard (like the 2019 "desktop" graphs) ----------------
function Bars({ data, w = 520, h = 190 }: { data: { m: string; os: number; del: number }[]; w?: number; h?: number }) {
  const max = Math.max(1, ...data.map((d) => d.os + d.del));
  const bw = (w - 50) / Math.max(1, data.length);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={44} x2={w} y1={h - f * h + 4} y2={h - f * h + 4} stroke="#e5e5e5" /><text x={40} y={h - f * h + 8} fontSize="9" textAnchor="end" fill="#555">{Math.round((max * f) / 1000)}k</text></g>)}
      {data.map((d, i) => {
        const hd = (d.del / max) * h, ho = (d.os / max) * h, x = 48 + i * bw;
        return <g key={d.m}><rect x={x} y={h + 4 - hd} width={bw * 0.7} height={hd} fill="#4472c4" /><rect x={x} y={h + 4 - hd - ho} width={bw * 0.7} height={ho} fill="#c0504d" /><text x={x + bw * 0.35} y={h + 18} fontSize="9" textAnchor="middle" fill="#555">{d.m.slice(5)}/{d.m.slice(2, 4)}</text></g>;
      })}
    </svg>
  );
}
function Pie({ data }: { data: { g: string; v: number }[] }) {
  const total = data.reduce((a, d) => a + d.v, 0) || 1;
  const cols = ['#4472c4', '#c0504d', '#f0a030', '#2e8b57', '#8064a2', '#4bacc6'];
  let a0 = -Math.PI / 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="170" height="170" viewBox="-1 -1 2 2">
        {data.map((d, i) => { const a1 = a0 + (d.v / total) * Math.PI * 2; const p = `M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`; a0 = a1; return <path key={d.g} d={p} fill={cols[i % 6]} stroke="#fff" strokeWidth="0.01" />; })}
        <circle r="0.45" fill="#fff" />
      </svg>
      <div>{data.map((d, i) => <div key={d.g} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 5, background: cols[i % 6], display: 'inline-block' }} />{d.g} <span className="hint">{Math.round((d.v / total) * 100)}%</span></div>)}</div>
    </div>
  );
}
function Gauge({ label, pct }: { label: string; pct: number }) {
  const a = Math.PI * (0.75 + 1.5 * Math.min(1, Math.max(0, pct / 100)));
  return (
    <svg width="160" height="150" viewBox="-60 -60 120 110">
      <circle r="56" fill="#f7f7f7" stroke="#bbb" strokeWidth="2" />
      <path d={`M ${50 * Math.cos(Math.PI * 1.95)} ${50 * Math.sin(Math.PI * 1.95)} A50 50 0 0 1 ${50 * Math.cos(Math.PI * 2.25)} ${50 * Math.sin(Math.PI * 2.25)}`} stroke="#2e9d4a" strokeWidth="7" fill="none" />
      <path d={`M ${50 * Math.cos(Math.PI * 1.7)} ${50 * Math.sin(Math.PI * 1.7)} A50 50 0 0 1 ${50 * Math.cos(Math.PI * 1.95)} ${50 * Math.sin(Math.PI * 1.95)}`} stroke="#f0a030" strokeWidth="7" fill="none" />
      <text y="-14" textAnchor="middle" fontSize="13" fill="#333">{label}</text>
      <line x1="0" y1="0" x2={42 * Math.cos(a)} y2={42 * Math.sin(a)} stroke="#d9734a" strokeWidth="3" strokeLinecap="round" />
      <circle r="6" fill="#4472c4" />
      <text y="34" textAnchor="middle" fontSize="16" fill="#111">{Math.round(pct)}%</text>
    </svg>
  );
}
export function Dashboard({ open }: P) {
  const { data } = useApi<any>('/api/dashboard');
  if (!data) return <div className="hint">Loading…</div>;
  const o = data.otif; const tot = o.early + o.onTime + o.late || 1;
  const c = data.counts;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <div className="kpis">
        {[['Parts', c.parts, 'partList'], ['Sales Orders', c.sos, 'soList'], ['Works Orders', c.wos, 'woList'], ['Open WOs', c.openWo, 'woList'], ['Purchase Orders', c.pos, 'poList'], ['Deliveries', c.dns, 'dnList'], ['Invoices', c.invs, 'invList']].map(([k, v, w]) => (
          <div key={k as string} className="kpi" onDoubleClick={() => open(w as string)} title="Double-click to open"><span className="hint">{k}</span><b>{v as number}</b></div>
        ))}
      </div>
      <div className="dash">
        <div className="card"><h4>Sales Order Book</h4><Bars data={data.book} /><div className="hint"><span style={{ color: '#c0504d' }}>■</span> Outstanding value &nbsp; <span style={{ color: '#4472c4' }}>■</span> Delivered</div></div>
        <div className="card"><h4>Sales by Product Group</h4><Pie data={data.byGroup} /></div>
        <div className="card"><h4>Delivery Performance (OTIF)</h4><div style={{ display: 'flex', gap: 10 }}><Gauge label="Early" pct={(o.early / tot) * 100} /><Gauge label="On time" pct={(o.onTime / tot) * 100} /><Gauge label="Late" pct={(o.late / tot) * 100} /></div></div>
        <div className="card"><h4>About this data</h4><div className="hint">Real HSP records copied from the production database (orders up to {ukDate(data.maxDate)}): recent sales orders and everything linked to them - works orders, materials, purchasing, goods-in, stock, deliveries and invoices. Bookings and goods-in entered in this demo are kept separately and highlighted yellow.</div></div>
      </div>
    </div>
  );
}

export function About() {
  return (
    <div style={{ display: 'flex', gap: 14, padding: 6 }}>
      <div className="logo" style={{ width: 48, height: 48, borderRadius: 8, background: 'linear-gradient(135deg,#2e7d32,#66bb6a)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>HSP</div>
      <div>
        <b>HSP Production Control</b> - cloud demo<br />
        Built by AEM Systems on the Pipstax platform.<br />
        Runs in any browser, nothing to install, data hosted in the UK/EU and backed up off-site.<br /><br />
        <span className="hint">Demonstration build. Real HSP data, read-only except shop-floor bookings and goods-in, which are kept apart from the copied data.</span>
      </div>
    </div>
  );
}
