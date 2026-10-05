import { Customer } from '../entities/customer.entity';
import { Invoice } from '../entities/invoice.entity';
import { Tenant } from '../entities/tenant.entity';
import {
  addPageFooters,
  collectPdf,
  createPdfDocument,
  drawDocumentHeader,
  drawInfoPanel,
  drawSectionHeading,
  drawTableHeader,
  drawTableRow,
  drawTotalsPanel,
  ensurePdfSpace,
  formatPdfCurrency,
  formatPdfDate,
  PdfTableColumn,
  usableWidth,
} from './pdf-layout.service';

type InvoiceLineItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
};

export const calculateInvoiceTotals = (invoice: Invoice) => {
  const normalizedItems = (invoice.lineItems ?? []).map((item) => ({
    ...item,
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? 0),
    vatRate: Number(item.vatRate ?? 0),
  }));
  invoice.lineItems = normalizedItems;
  const subTotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vatTotal = invoice.lineItems.reduce((sum, item) => {
    const rate = Number(item.vatRate ?? 0);
    return sum + item.quantity * item.unitPrice * (rate / 100);
  }, 0);
  const total = subTotal + vatTotal;
  invoice.subTotal = Number(subTotal.toFixed(2));
  invoice.vatTotal = Number(vatTotal.toFixed(2));
  invoice.total = Number(total.toFixed(2));
};

const customerLines = (invoice: Invoice, customer?: Customer | null) => [
  customer?.name,
  customer?.email,
  customer?.phone,
  customer?.address,
  invoice.customerId && !customer ? `Customer ID: ${invoice.customerId}` : null,
];

const paymentLines = (invoice: Invoice, tenant: Tenant) => [
  invoice.dueDate ? `Due Date: ${formatPdfDate(invoice.dueDate)}` : 'Due Date: Not set',
  invoice.accountingProvider ? `Accounting Provider: ${invoice.accountingProvider}` : null,
];

export const buildInvoicePdf = async (invoice: Invoice, tenant: Tenant, customer?: Customer | null) => {
  calculateInvoiceTotals(invoice);
  const { doc, chunks } = createPdfDocument();
  const primary = tenant.primaryColor ?? '#1F3A5F';
  const invoiceNumber = invoice.invoiceNumber ?? 'INV-PENDING';
  const issuedAt = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
  const items = (invoice.lineItems ?? []) as InvoiceLineItem[];
  const pageWidth = usableWidth(doc);

  drawDocumentHeader(doc, {
    title: 'Invoice',
    subtitle: invoice.title,
    tenant,
    documentNumber: invoiceNumber,
    status: invoice.status,
    primary,
    meta: [
      { label: 'Invoice No', value: invoiceNumber },
      { label: 'Issue Date', value: formatPdfDate(issuedAt) },
      { label: 'Due Date', value: invoice.dueDate ? formatPdfDate(invoice.dueDate) : 'Not set' },
    ],
  });

  const panelGap = 12;
  const panelWidth = (pageWidth - panelGap) / 2;
  const panelY = doc.y + 4;
  drawInfoPanel(doc, 'Bill To', customerLines(invoice, customer), {
    x: doc.page.margins.left,
    y: panelY,
    width: panelWidth,
    primary,
  });
  drawInfoPanel(doc, 'Invoice Details', paymentLines(invoice, tenant), {
    x: doc.page.margins.left + panelWidth + panelGap,
    y: panelY,
    width: panelWidth,
    primary,
  });
  doc.y = Math.max(doc.y, panelY + 92);

  drawSectionHeading(doc, 'Line Items', primary);
  const columns: PdfTableColumn[] = [
    { label: 'Description', width: pageWidth * 0.48 },
    { label: 'Qty', width: pageWidth * 0.09, align: 'center' },
    { label: 'Unit Price', width: pageWidth * 0.16, align: 'right' },
    { label: 'VAT', width: pageWidth * 0.1, align: 'right' },
    { label: 'Line Total', width: pageWidth * 0.17, align: 'right' },
  ];
  const tableX = doc.page.margins.left;
  const renderHeader = () => drawTableHeader(doc, columns, tableX, doc.y, primary);
  renderHeader();

  if (items.length === 0) {
    ensurePdfSpace(doc, 38, renderHeader);
    drawTableRow(doc, columns, ['No line items added', '-', '-', '-', '-'], tableX, doc.y, { minHeight: 36 });
  } else {
    items.forEach((item, index) => {
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unitPrice ?? 0);
      const vatRate = Number(item.vatRate ?? 0);
      const lineNet = quantity * unitPrice;
      const rowHeight = Math.max(34, doc.heightOfString(String(item.description ?? 'Item'), { width: columns[0].width - 16 }) + 18);
      ensurePdfSpace(doc, rowHeight + 8, renderHeader);
      drawTableRow(
        doc,
        columns,
        [
          String(item.description ?? 'Item'),
          quantity.toLocaleString('en-GB'),
          formatPdfCurrency(unitPrice),
          `${vatRate.toLocaleString('en-GB')}%`,
          formatPdfCurrency(lineNet),
        ],
        tableX,
        doc.y,
        { zebra: index % 2 === 1, minHeight: rowHeight },
      );
    });
  }

  drawTotalsPanel(
    doc,
    [
      { label: 'Subtotal', value: formatPdfCurrency(invoice.subTotal) },
      { label: 'VAT', value: formatPdfCurrency(invoice.vatTotal) },
      { label: 'Amount Due', value: formatPdfCurrency(invoice.total), strong: true },
    ],
    primary,
  );

  if (invoice.isMtdCompliant || invoice.accountingSyncStatus) {
    ensurePdfSpace(doc, 132);
    drawSectionHeading(doc, 'Compliance and Accounting', primary);
    drawInfoPanel(
      doc,
      'Status',
      [
        invoice.isMtdCompliant ? 'MTD VAT compliant invoice structure applied.' : null,
        invoice.accountingSyncStatus ? `Accounting sync: ${invoice.accountingSyncStatus.replace(/_/g, ' ')}` : null,
        invoice.accountingExternalReference ? `External reference: ${invoice.accountingExternalReference}` : null,
      ],
      { primary },
    );
  }

  addPageFooters(doc, `${invoiceNumber} - ${tenant.tradingName || tenant.name || 'Invoice'}`, primary);
  return collectPdf(doc, chunks);
};
