# HSP Production Control - cloud demo

A browser version of HSP's production control system: their current Windows desktop look (menu bar, MDI child
windows, grey forms, grids, Favourites / Refresh / Exit System, "Query" status bar), running on HSP's own records.
Part of the Pipstax Manufacturing work (see `HSP-Javelin-Rebuild-Assessment.md` and
`HSP-Javelin-Pipstax-Data-Model.md` in OneDrive `Documents\AEM`).

**No HSP data is in this repo.** The app reads a JSON extract from the path in `HSP_DEMO_DATA`
(default `C:\Users\AndyMaxey\hsp-javelin-demo-data\hsp-demo-data.json`). Demo actions are written to
`hsp-demo-actions.json` in the same folder; delete that file to reset the demo.

## Run

```
cd pipstax/hsp-demo
npm install
npx next build
npx next start -p 3333        # http://localhost:3333
```

Deep links: `/?open=wo:100053948&max=1`, `/?open=soList,so:22196`, `/coc/55013` (printable certificate).

## Screens

| Menu | Screen | Real data | Works |
|---|---|---|---|
| Desktop | KPIs, sales order book, sales by product group, delivery performance gauges | yes | read |
| Production | Part enquiry + part (general, BOM, routing, stock, where used) | yes | read |
| Sales | Sales order enquiry + order (lines, addresses, works orders, deliveries) | yes | read |
| Production | Works order enquiry + WO (operations, materials, shop-floor bookings) | yes | **book an operation** |
| Purchasing | PO enquiry + PO (lines, goods in, notes), goods received enquiry | yes | **receive goods (GRN)** |
| Stock | Stock enquiry: balances by store/row/bin/batch + movements | yes | read |
| Sales | Delivery note enquiry + delivery note | yes | read |
| Accounts | Invoice enquiry + invoice | yes | read |
| Quality | Certificate of Conformity (A4, print / save as PDF) with works order + supplier material cert traceability | yes | print |

Menu items shown greyed out (MRP, quotations, price books, non-conformance, accounts export...) are not in this demo.

## Data extract

From the sealed lab copy of `Javelin210_Live` (container `aem-sql-lab` on urbackup02, no network): sales orders from
the last 120 days before the copy date and everything linked to them (works orders, ops, materials, bookings,
deliveries, invoices), works orders started in the last 60 days, purchase orders from the last 90 days with their
goods-in, all parts referenced (plus one level of BOM components), their routings and stock, work centres, stores,
operators, and up to 3,000 recent stock movements. Copies are kept only on this PC
(`C:\Users\AndyMaxey\hsp-javelin-demo-data\`) and the bastion (`/root/hsp-demo/`, root-only).
