// HSP demo data layer. Reads the extracted Javelin subset (JSON, kept OUTSIDE git) once, trims Javelin's
// fixed-width nchar padding, indexes it, and builds the view models the screens use. Demo actions (shop-floor
// bookings, goods-in) are appended to a small overlay file next to the data so they survive a restart.
import fs from 'fs';
import path from 'path';

type Row = Record<string, any>;
type DB = Record<string, Row[]>;

const DATA = process.env.HSP_DEMO_DATA || 'C:\\Users\\AndyMaxey\\hsp-javelin-demo-data\\hsp-demo-data.json';
const OVERLAY = path.join(path.dirname(DATA), 'hsp-demo-actions.json');

const clean = (v: any): any => {
  if (typeof v === 'string') return v.replace(/\s+$/, '').replace(/\r\n/g, '\n');
  return v;
};

let cache: { db: DB; at: number } | null = null;
export function db(): DB {
  if (cache) return cache.db;
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as DB;
  const out: DB = {};
  // Javelin keys (SO_No, WO_No, Customer_No...) come back as numbers on some tables and padded strings on
  // others - normalise them to trimmed strings so joins match.
  const isKey = (k: string) => /(_No|_Code|_Clock_No)$/.test(k);
  for (const [t, rows] of Object.entries(raw)) out[t] = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, isKey(k) && v != null ? String(clean(v)).trim() : clean(v)])));
  cache = { db: out, at: Date.now() };
  return out;
}

type Overlay = { bookings: Row[]; grns: Row[] };
export function overlay(): Overlay {
  try { return JSON.parse(fs.readFileSync(OVERLAY, 'utf8')); } catch { return { bookings: [], grns: [] }; }
}
function saveOverlay(o: Overlay) { fs.writeFileSync(OVERLAY, JSON.stringify(o, null, 1)); }

const by = (t: string, k: string) => {
  const m = new Map<string, Row[]>();
  for (const r of db()[t] || []) { const key = String(r[k] ?? ''); if (!m.has(key)) m.set(key, []); m.get(key)!.push(r); }
  return m;
};
const one = (t: string, k: string, v: string) => (db()[t] || []).find((r) => String(r[k]) === String(v));
const d = (v: any) => (v ? String(v).slice(0, 10) : '');
const n = (v: any) => (v == null || v === '' ? 0 : Number(v));

export const COMPANY = {
  name: 'Hydraulic System Products Ltd',
  short: 'HSP',
  vat: 'GB 170 9419 55',
  web: 'www.h-s-p.co.uk',
};

export function customerName(no: string) { return one('Customer', 'Customer_No', no)?.Customer_Name || ''; }
export function supplierName(code: string) { return one('Supplier', 'Supplier_Code', code)?.Supplier_Name || ''; }
export function employeeName(clock: string) { return one('Employees', 'Employee_Clock_No', clock)?.Employee_Name || clock; }
export function partDesc(p: string) { return one('Part', 'Part_No', p)?.Part_Prim_Desc || ''; }

export function woStatus(w: Row) {
  if (String(w.WO_Complete) === '1') return 'Complete';
  if (n(w.Count_Started_Ops) > 0) return 'In Progress';
  return 'Released';
}

// ---------- lists ----------
export function lists() {
  const D = db();
  return {
    parts: D.Part.map((p) => ({ id: p.Part_No, desc: p.Part_Prim_Desc, group: p.Product_Grp, uom: p.Stocking_UOM, type: p.Stocked_or_Not === 'S' ? 'Stocked' : 'Non-stock', abc: p.ABC_Code })),
    sos: D.SO_Header.map((s) => ({ id: s.SO_No, date: d(s.Date_of_Order), cust: s.Customer_No, name: customerName(s.Customer_No) || s.Del_Name, po: s.Customer_PO_No, value: n(s.Order_Value) })).sort((a, b) => b.date.localeCompare(a.date)),
    wos: D.WO.map((w) => ({ id: w.WO_No, part: w.Part_No, qty: n(w.Qty), start: d(w.Start_Date), end: d(w.End_Date), so: w.SO_No, status: woStatus(w) })).sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true })),
    pos: D.PO_Header.map((p) => ({ id: p.PO_No, date: d(p.Date_of_Order), supp: p.Supplier_Code, name: supplierName(p.Supplier_Code), type: p.Order_Type_P_or_S_or_C, value: n(p.Order_Value) })).sort((a, b) => b.date.localeCompare(a.date)),
    grns: [...D.GRN, ...overlay().grns].map((g) => ({ id: g.GRN_No, po: g.PO_No, part: g.Part_No, date: d(g.Date_Received), qty: n(g.Qty_Received), cert: g.Suppliers_Cert_Ref, by: g.Received_By })).sort((a, b) => b.date.localeCompare(a.date)),
    dns: D.Del_Note_Header.map((h) => ({ id: h.Del_Note_No, date: d(h.Del_Date), cust: h.Customer_No, name: h.Del_Name, items: n(h.No_of_Items), invoiced: h.Invoiced_YN })).sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true })),
    invs: D.Invoice_Header.map((i) => ({ id: i.Invoice_No, date: d(i.Date_of_Invoice), cust: i.Customer_No, name: i.Invoice_Name || i.Del_Name, net: n(i.Invoice_Value_Total) - n(i.Invoice_Total_VAT), vat: n(i.Invoice_Total_VAT), total: n(i.Invoice_Value_Total) })).sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true })),
    stores: D.Store.map((s) => ({ id: s.Store_Code, desc: s.Store_Desc })),
  };
}

// ---------- details ----------
export function part(id: string) {
  const p = one('Part', 'Part_No', id);
  if (!p) return null;
  const bom = (by('Components', 'Parent_Part_No').get(id) || []).map((c) => ({ item: c.BOM_Item_No, part: c.Component_Part_No, desc: partDesc(c.Component_Part_No), qty: n(c.Qty_Var) || n(c.Qty_Fix), uom: one('Part', 'Part_No', c.Component_Part_No)?.Stocking_UOM || '', issue: c.Component_Issue }));
  const wc = by('Work_Centre', 'WC_Code');
  const routing = (by('Routes', 'Part_No').get(id) || []).sort((a, b) => n(a.Op_No) - n(b.Op_No)).map((r) => ({ op: r.Op_No, wc: r.WC_Code, wcDesc: wc.get(r.WC_Code)?.[0]?.Description || '', setup: n(r.Setup_Time_Mins), run: n(r.Labr_Time_Mins_Ea), supplier: r.Prefered_Supplier, spec: r.Process_Spec, key: r.Key_Op_YN }));
  const stock = (by('Stock_Details', 'Part_No').get(id) || []).map((s) => ({ store: s.Store_Code, row: s.Row, bin: s.Bin, roo: s.ROO, qty: n(s.Qty) }));
  const whereUsed = (db().Components || []).filter((c) => c.Component_Part_No === id).map((c) => ({ parent: c.Parent_Part_No, desc: partDesc(c.Parent_Part_No), qty: n(c.Qty_Var) }));
  return {
    id, desc: p.Part_Prim_Desc, desc2: p.Part_Secd_Desc, group: p.Product_Grp, issue: p.Part_Issue || p.Drg_Iss || '', drawing: p.Drawing_No || '',
    uom: { buy: p.Buying_UOM, stock: p.Stocking_UOM, sell: p.Selling_UOM }, lead: n(p.Lead_Time_Days), batch: n(p.Norm_Batch_Qty), reorderQty: n(p.Reorder_Qty), reorderPoint: p.Reorder_Point_Part,
    minOrder: n(p.Minimum_Order_Qty), abc: p.ABC_Code, mbf: p.MBF_Code, store: p.Normal_Store_Code, row: p.Normal_Row, weight: n(p.Weight___KG), stocked: p.Stocked_or_Not, narr: p.Part_Narr || '',
    method: p.Method_Of_Manufacture, bom, routing, stock, whereUsed, onHand: stock.reduce((a, s) => a + s.qty, 0),
  };
}

export function so(id: string) {
  const h = one('SO_Header', 'SO_No', id);
  if (!h) return null;
  const lines = (by('SO_Items', 'SO_No').get(id) || []).sort((a, b) => n(a.SO_Line_No) - n(b.SO_Line_No)).map((l) => ({ line: l.SO_Line_No, part: l.Part_No, desc: partDesc(l.Part_No), qty: n(l.Qty), del: n(l.Qty_Del), due: d(l.Due_Date), promise: d(l.Promise_Date), price: n(l.Selling_Price), value: n(l.SO_Line_Value), full: l.Fully_Del }));
  const wos = (db().WO || []).filter((w) => w.SO_No === id).map((w) => ({ id: w.WO_No, part: w.Part_No, qty: n(w.Qty), status: woStatus(w) }));
  const dns = [...new Set((db().Del_Note_Detail || []).filter((x) => x.SO_No === id).map((x) => x.Del_Note_No))];
  return { id, cust: h.Customer_No, name: customerName(h.Customer_No) || h.Del_Name, date: d(h.Date_of_Order), po: h.Customer_PO_No, salesPerson: h.Sales_Person, terms: h.Terms_Code, value: n(h.Order_Value), delName: h.Del_Name, delAdds: h.Del_Adds, delPost: h.Del_Adds_Postcode, invName: h.Invoice_Name, invAdds: h.Invoice_Adds, email: h.Email, comments: h.SO_Comments || '', revision: h.Revision, lines, wos, dns };
}

export function wo(id: string) {
  const w = one('WO', 'WO_No', id);
  if (!w) return null;
  const wc = by('Work_Centre', 'WC_Code');
  const ov = overlay().bookings.filter((b) => b.WO_No === id);
  const books = [...(by('WIP_Book_Trans', 'WO_No').get(id) || []), ...ov];
  const ops = (by('Ops', 'WO_No').get(id) || []).sort((a, b) => n(a.Op_No) - n(b.Op_No)).map((o) => {
    const extra = ov.filter((b) => String(b.Op_No) === String(o.Op_No)).reduce((a, b) => a + n(b.Qty_Good), 0);
    return { op: o.Op_No, wc: o.WC_Code, wcDesc: wc.get(o.WC_Code)?.[0]?.Description || '', setup: n(o.Std_Setup_Time), run: n(o.Std_Labr_Time_Ea), done: n(o.Qty_Complete) + extra, complete: o.Completion_Ind_YN === 'Y' };
  });
  const mats = (by('Materials', 'WO_No').get(id) || []).map((m) => ({ part: m.Part_No, desc: partDesc(m.Part_No), req: n(m.Qty_Required), issued: n(m.Qty_Issd), due: d(m.Due_Date), complete: m.Completely_Issd === 'Y' }));
  const bookings = books.map((b) => ({ date: d(b.Effective_Date || b.Date_of_Trans), op: b.Op_No, clock: b.Employee_Clock_No, name: employeeName(b.Employee_Clock_No), good: n(b.Qty_Good), scrap: n(b.Qty_Scrap), mins: n(b.Labr_Time_Booked), user: b.UserId, demo: !!b.demo }));
  return { id, part: w.Part_No, desc: partDesc(w.Part_No), qty: n(w.Qty), start: d(w.Start_Date), end: d(w.End_Date), so: w.SO_No, status: woStatus(w), priority: w.Priority, planner: w.Planner, created: d(w.Created_Date), createdBy: w.Created_User_ID, stored: n(w.Qty_Stored), scrapped: n(w.Qty_Scrapped), ops, mats, bookings, operators: (db().Employees || []).filter((e) => !['1', 'true'].includes(String(e.HasLeft).toLowerCase())).map((e) => ({ clock: e.Employee_Clock_No, name: e.Employee_Name })) };
}

export function po(id: string) {
  const h = one('PO_Header', 'PO_No', id);
  if (!h) return null;
  const grns = [...(by('GRN', 'PO_No').get(id) || []), ...overlay().grns.filter((g) => g.PO_No === id)];
  const lines = (by('PO_Detail', 'PO_No').get(id) || []).sort((a, b) => n(a.PO_Line_No) - n(b.PO_Line_No)).map((l) => {
    const extra = overlay().grns.filter((g) => g.PO_No === id && String(g.PO_Line_No) === String(l.PO_Line_No)).reduce((a, g) => a + n(g.Qty_Received), 0);
    return { line: l.PO_Line_No, part: l.Part_No, desc: partDesc(l.Part_No) || (l.Extended_Desc || '').split('\n')[0], due: d(l.Due_Date), ordered: n(l.Qty_Ordered), received: n(l.Qty_Received) + extra, price: n(l.Price_Base), value: n(l.Value_Base) };
  });
  const type = ({ P: 'Purchase', S: 'Subcontract', C: 'Call-off', M: 'Consumable' } as any)[h.Order_Type_P_or_S_or_C] || h.Order_Type_P_or_S_or_C;
  return { id, supp: h.Supplier_Code, name: supplierName(h.Supplier_Code), date: d(h.Date_of_Order), amended: d(h.Date_Last_Amended), type, buyer: h.Buyer_Code, authoriser: h.Authoriser, rev: h.Rev_No, value: n(h.Order_Value), email: h.Email, comments: h.Order_Comments || '', lines, grns: grns.map((g) => ({ id: g.GRN_No, line: g.PO_Line_No, part: g.Part_No, date: d(g.Date_Received), qty: n(g.Qty_Received), passed: n(g.Qty_Passed_Insp), cert: g.Suppliers_Cert_Ref, advice: g.Advice_Note, by: g.Received_By, demo: !!g.demo })) };
}

export function dn(id: string) {
  const h = one('Del_Note_Header', 'Del_Note_No', id);
  if (!h) return null;
  const items = by('SO_Items', 'SO_No');
  const lines = (by('Del_Note_Detail', 'Del_Note_No').get(id) || []).map((l) => {
    const sl = (items.get(l.SO_No) || []).find((x) => String(x.SO_Line_No) === String(l.SO_Line_No));
    return { so: l.SO_No, line: l.SO_Line_No, part: sl?.Part_No || '', desc: partDesc(sl?.Part_No || ''), qty: n(l.Qty_Selling_UOM), issue: l.Part_Issue || '', custPo: one('SO_Header', 'SO_No', l.SO_No)?.Customer_PO_No || '', rn: l.Release_Note_No };
  });
  return { id, date: d(h.Del_Date), cust: h.Customer_No, name: h.Del_Name, adds: h.Del_Adds, post: h.Del_Adds_Postcode, invoiced: h.Invoiced_YN, method: h.Method_of_Shipment, email: h.Email, lines };
}

export function inv(id: string) {
  const h = one('Invoice_Header', 'Invoice_No', id);
  if (!h) return null;
  const lines = (by('Invoice_Detail', 'Invoice_No').get(id) || []).map((l) => ({ dn: l.Del_Note_No, so: l.SO_No, part: l.Part_No, desc: partDesc(l.Part_No), qty: n(l.Qty), price: n(l.Price_Each), value: n(l.Line_Value), vatRate: n(l.VAT_Rate), vat: n(l.VAT_Amount) }));
  return { id, date: d(h.Date_of_Invoice), cust: h.Customer_No, name: h.Invoice_Name || h.Del_Name, adds: h.Invoice_Adds, post: h.Invoice_Adds_Postcode, status: h.Status, net: n(h.Invoice_Value_Total) - n(h.Invoice_Total_VAT), vat: n(h.Invoice_Total_VAT), total: n(h.Invoice_Value_Total), footer: h.Invoice_Footer_Thang || '', lines };
}

export function stock(partNo?: string, store?: string) {
  const D = db();
  const bal = D.Stock_Details.filter((s) => (!partNo || s.Part_No === partNo) && (!store || s.Store_Code === store)).map((s) => ({ part: s.Part_No, desc: partDesc(s.Part_No), store: s.Store_Code, row: s.Row, bin: s.Bin, roo: s.ROO, qty: n(s.Qty), lastCheck: d(s.Date_Last_Stock_Chec) }));
  const moves = D.Stock_Trans_Log.filter((m) => (!partNo || m.Part_No === partNo) && (!store || m.Store_Code === store)).slice(0, partNo ? 300 : 200).map((m) => ({ date: String(m.Trans_Date || '').replace('T', ' ').slice(0, 16), part: m.Part_No, store: m.Store_Code, bin: m.Bin, qty: n(m.Qty_Change), type: String(m.Prog || m.Tran_Type || '').split('\\')[0].trim(), ref: m.WO_No || m.SO_No || m.PO_No || '', user: m.User_ID }));
  return { bal, moves };
}

// Certificate of conformity for one delivery note: delivery lines + the works orders that made them + the
// goods-in (supplier cert refs) for their materials - the traceability chain HSP sends with the goods.
export function coc(dnNo: string) {
  const note = dn(dnNo);
  if (!note) return null;
  const lines = note.lines.map((l) => {
    const wos = (db().WO || []).filter((w) => w.SO_No === l.so && w.Part_No === l.part).map((w) => w.WO_No);
    const matParts = (db().Materials || []).filter((m) => wos.includes(m.WO_No)).map((m) => m.Part_No);
    const certs = (db().GRN || []).filter((g) => matParts.includes(g.Part_No) && g.Suppliers_Cert_Ref).slice(0, 3).map((g) => ({ part: g.Part_No, grn: g.GRN_No, cert: g.Suppliers_Cert_Ref, supplier: supplierName(g.Supplier_Code) }));
    return { ...l, wos, certs };
  });
  return { ...note, lines, certNo: 'CoC-' + dnNo };
}

// ---------- dashboard ----------
export function dashboard() {
  const D = db();
  const months = new Map<string, { os: number; del: number }>();
  for (const l of D.SO_Items) {
    const m = d(l.Due_Date).slice(0, 7); if (!m) continue;
    const e = months.get(m) || { os: 0, del: 0 };
    const unit = n(l.Selling_Price);
    e.del += n(l.Qty_Del) * unit; e.os += Math.max(0, n(l.Qty) - n(l.Qty_Del)) * unit;
    months.set(m, e);
  }
  const book = [...months.entries()].sort().map(([m, v]) => ({ m, ...v }));
  const groups = new Map<string, number>();
  for (const l of D.SO_Items) groups.set(l.Product_Grp || 'Other', (groups.get(l.Product_Grp || 'Other') || 0) + n(l.SO_Line_Value));
  const byGroup = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g, v]) => ({ g, v }));
  // OTIF: delivered lines where the delivery note date <= promise date
  const dnDate = new Map(D.Del_Note_Header.map((h) => [h.Del_Note_No, d(h.Del_Date)]));
  let onTime = 0, late = 0, early = 0;
  for (const x of D.Del_Note_Detail) {
    const sl = D.SO_Items.find((s) => s.SO_No === x.SO_No && String(s.SO_Line_No) === String(x.SO_Line_No));
    const dd = dnDate.get(x.Del_Note_No); const pd = d(sl?.Promise_Date || sl?.Due_Date);
    if (!dd || !pd) continue;
    if (dd < pd) early++; else if (dd === pd) onTime++; else late++;
  }
  const openWo = D.WO.filter((w) => woStatus(w) !== 'Complete').length;
  return { book, byGroup, otif: { early, onTime, late }, counts: { parts: D.Part.length, sos: D.SO_Header.length, wos: D.WO.length, openWo, pos: D.PO_Header.length, dns: D.Del_Note_Header.length, invs: D.Invoice_Header.length }, maxDate: D.meta?.[0]?.maxdate };
}

// ---------- demo actions ----------
export function bookOperation(b: { wo: string; op: string; clock: string; good: number; scrap: number; mins: number }) {
  const w = one('WO', 'WO_No', b.wo);
  if (!w) throw new Error('Works order not found');
  if (!(by('Ops', 'WO_No').get(b.wo) || []).some((o) => String(o.Op_No) === String(b.op))) throw new Error('Operation not on this works order');
  if (!(b.good > 0 || b.scrap > 0)) throw new Error('Enter a good or scrap quantity');
  const o = overlay();
  o.bookings.push({ WO_No: b.wo, Op_No: b.op, Employee_Clock_No: b.clock, Qty_Good: b.good, Qty_Scrap: b.scrap, Labr_Time_Booked: b.mins, Effective_Date: new Date().toISOString(), UserId: 'DEMO', demo: true });
  saveOverlay(o);
  return { ok: true };
}

export function receiveGoods(r: { po: string; line: string; qty: number; cert: string; advice: string }) {
  const l = (by('PO_Detail', 'PO_No').get(r.po) || []).find((x) => String(x.PO_Line_No) === String(r.line));
  if (!l) throw new Error('PO line not found');
  if (!(r.qty > 0)) throw new Error('Enter the quantity received');
  const o = overlay();
  const next = 'GRN/D' + String(o.grns.length + 1).padStart(5, '0');
  o.grns.push({ GRN_No: next, PO_No: r.po, PO_Line_No: r.line, Part_No: l.Part_No, Supplier_Code: one('PO_Header', 'PO_No', r.po)?.Supplier_Code, Date_Received: new Date().toISOString(), Qty_Received: r.qty, Qty_Passed_Insp: r.qty, Suppliers_Cert_Ref: r.cert, Advice_Note: r.advice, Received_By: 'DEMO', demo: true });
  saveOverlay(o);
  return { ok: true, grn: next };
}
