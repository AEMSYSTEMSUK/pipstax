const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = '/Users/hustlers/Ankit Chadoker/Node JS/AEM-CRM/CRM_Scope_Progress_Summary.pdf';
const doc = new PDFDocument({ margin: 48 });
doc.pipe(fs.createWriteStream(path));

doc.fontSize(18).text('CRM Platform Scope — Progress Summary', { align: 'left' });
doc.moveDown(0.5);
doc.fontSize(10).fillColor('#555').text('Generated: 2026-04-01', { align: 'left' });
doc.moveDown(1);

doc.fontSize(12).fillColor('#111').text('Pointwise Completion (Conservative)');
doc.moveDown(0.5);

const rows = [
  ['Platform Admin Panel', '65%'],
  ['3.1 CRM & Lead Pipeline', '70%'],
  ['3.2 Scheduling & Dispatch', '60%'],
  ['3.3 Sub-Contractor Onboarding', '55%'],
  ['3.4 Quote & Proposal Engine', '70%'],
  ['3.5 Financials & Invoicing', '20%'],
  ['3.6 Document Shadowing', '10%'],
  ['4.1 Customer-Facing Portal', '10%'],
  ['4.2 Support Ticket System', '15%'],
  ['4.3 HR & Payroll', '5%'],
  ['4.4 Reporting & BI', '25%'],
  ['5 RBAC', '40%'],
  ['6 White-Label & Branding', '25%'],
  ['7 Integrations', '10%'],
];

const tableX = 48;
let y = doc.y;
doc.fontSize(11);
doc.fillColor('#0f766e').rect(tableX, y, 516, 18).fill();
doc.fillColor('#fff').text('Section', tableX + 6, y + 4);
doc.text('Completion', tableX + 380, y + 4);
y += 22;

doc.fillColor('#111');
rows.forEach((r, i) => {
  if (i % 2 === 0) {
    doc.fillColor('#f3f4f6').rect(tableX, y, 516, 18).fill();
  }
  doc.fillColor('#111').text(r[0], tableX + 6, y + 4);
  doc.text(r[1], tableX + 380, y + 4);
  y += 20;
});

doc.moveDown(1.5);
doc.fillColor('#111').fontSize(12).text('Overall Completion (Conservative): 44%');

doc.moveDown(1);
doc.fontSize(11).fillColor('#111').text('Brief Coverage Summary');
doc.moveDown(0.5);
doc.fontSize(10).fillColor('#333');
const brief = [
  'Platform Admin panel is implemented as a separate code path with its own login, RBAC, and tenant management views.',
  'Client Admin portal includes dynamic CRM/Leads, Scheduling (with drag & drop), Contractors, and Quotes modules wired to backend data with validation and toasts.',
  'Quote generation includes PDF rendering with branding, line items, VAT, totals, and preview/download flows.',
  'Multi-tenant data separation is enforced at API level and client views only show tenant-scoped data.',
  'Several scope areas remain partial or pending: financials/invoicing, document shadowing, support tickets, HR/payroll, reporting depth, white-labeling and integrations.',
];
brief.forEach((line) => {
  doc.text('• ' + line, { indent: 12 });
});

doc.moveDown(0.5);
doc.fillColor('#555').text('Note: Percentages reflect current functionality vs. full scope in the provided PDF, deliberately conservative as requested.');

doc.end();
