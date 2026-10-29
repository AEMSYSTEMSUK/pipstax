// Printable Certificate of Conformity for one delivery note (Steve's must-have - their current ones are Word docs).
import { notFound } from 'next/navigation';
import { COMPANY, coc } from '../../../lib/data';
import PrintButton from '../../../components/PrintButton';
import './coc.css';

export const dynamic = 'force-dynamic';

const ukDate = (s: string) => (s && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || '');
const q = (v: number) => (v || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 });

export default async function CocPage({ params }: { params: Promise<{ dn: string }> }) {
  const { dn } = await params;
  const c = coc(decodeURIComponent(dn));
  if (!c) notFound();
  const pos = [...new Set(c.lines.map((l) => l.custPo).filter(Boolean))].join(', ');
  return (
    <div className="coc-wrap">
      <div className="coc-actions noprint"><PrintButton /><span>Demo certificate generated from HSP&apos;s real delivery, works order and goods-in records.</span></div>
      <div className="sheet">
        <header>
          <div className="brand">
            <div className="mark">HSP</div>
            <div>
              <div className="co">{COMPANY.name}</div>
              <div className="sub">Hydraulic components &middot; precision manufacture</div>
              <div className="sub">{COMPANY.web} &middot; VAT {COMPANY.vat}</div>
            </div>
          </div>
          <div className="doc">
            <div className="dt">Certificate of Conformity</div>
            <table className="meta"><tbody>
              <tr><th>Certificate No</th><td>{c.certNo}</td></tr>
              <tr><th>Date</th><td>{ukDate(c.date)}</td></tr>
              <tr><th>Delivery Note</th><td>{c.id}</td></tr>
              <tr><th>Your Order</th><td>{pos || '-'}</td></tr>
            </tbody></table>
          </div>
        </header>

        <section className="parties">
          <div><h5>Customer</h5><div className="addr"><b>{c.name}</b>{'\n'}{c.adds}{c.post ? '\n' + c.post : ''}</div></div>
          <div><h5>Account</h5><div className="addr">{c.cust}{'\n'}Despatch method: {c.method || '-'}</div></div>
        </section>

        <table className="lines">
          <thead><tr><th>Line</th><th>Part Number / Description</th><th>Issue</th><th className="r">Quantity</th><th>Works Order</th><th>Material Traceability</th></tr></thead>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.so}/{l.line}</td>
                <td><b>{l.part}</b><div className="d">{l.desc}</div></td>
                <td>{l.issue || '-'}</td>
                <td className="r">{q(l.qty)}</td>
                <td>{l.wos.length ? l.wos.join(', ') : 'Ex stock'}</td>
                <td>{l.certs.length ? l.certs.map((x) => <div key={x.grn} className="d">{x.part}: {x.supplier} cert {x.cert} ({x.grn})</div>) : <span className="d">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="stmt">
          We hereby certify that the goods detailed above have been manufactured, inspected and tested in accordance with the
          requirements of the order, the relevant drawings and specifications at the issue stated, and conform in all respects.
          Full traceability records, including material certificates and inspection results, are retained by {COMPANY.name} and
          are available on request.
        </p>

        <section className="sign">
          <div><div className="line" /><div className="lbl">Signed for and on behalf of {COMPANY.name}</div></div>
          <div><div className="line" /><div className="lbl">Name / Position (Quality)</div></div>
          <div><div className="line">{ukDate(c.date)}</div><div className="lbl">Date</div></div>
        </section>
        <footer>{COMPANY.name} &middot; Certificate {c.certNo} &middot; Page 1 of 1</footer>
      </div>
    </div>
  );
}
