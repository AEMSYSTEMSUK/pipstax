import { Customer } from '../entities/customer.entity';
import { Quote } from '../entities/quote.entity';
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
  formatPdfDateTime,
  pageBottom,
  PdfTableColumn,
  usableWidth,
} from './pdf-layout.service';

type QuoteLineItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
};

const customerLines = (quote: Quote, customer?: Customer | null) => [
  quote.recipientName ?? customer?.name,
  quote.recipientEmail ?? customer?.email,
  customer?.phone,
  customer?.address,
];

export const buildQuotePdf = async (quote: Quote, tenant: Tenant, customer?: Customer | null) => {
  const { doc, chunks } = createPdfDocument();
  const primary = tenant.primaryColor;
  const quoteNumber = quote.quoteNumber ?? 'QT-PENDING';
  const issuedAt = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const validUntil = quote.validUntil ? new Date(quote.validUntil) : new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const items = (quote.lineItems ?? []) as QuoteLineItem[];
  const pageWidth = usableWidth(doc);

  drawDocumentHeader(doc, {
    title: 'Quotation',
    subtitle: quote.title,
    tenant,
    documentNumber: quoteNumber,
    status: quote.status,
    primary,
    meta: [
      { label: 'Quote No', value: quoteNumber },
      { label: 'Issued', value: formatPdfDate(issuedAt) },
      { label: 'Valid Until', value: formatPdfDate(validUntil) },
    ],
  });

  const panelY = doc.y + 4;
  drawInfoPanel(doc, 'Prepared For', customerLines(quote, customer), {
    x: doc.page.margins.left,
    y: panelY,
    width: pageWidth,
    primary,
  });
  doc.y = Math.max(doc.y, panelY + 92);

  drawSectionHeading(doc, 'Quote Items', primary);
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

  let subtotal = 0;
  let vatTotal = 0;
  if (items.length === 0) {
    ensurePdfSpace(doc, 38, renderHeader);
    drawTableRow(doc, columns, ['No line items added', '-', '-', '-', '-'], tableX, doc.y, { minHeight: 36 });
  } else {
    items.forEach((item, index) => {
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unitPrice ?? 0);
      const vatRate = Number(item.vatRate ?? 0);
      const lineNet = quantity * unitPrice;
      const lineVat = lineNet * (vatRate / 100);
      subtotal += lineNet;
      vatTotal += lineVat;
      const description = String(item.description ?? 'Item');
      const rowHeight = Math.max(34, doc.heightOfString(description, { width: columns[0].width - 16 }) + 18);
      ensurePdfSpace(doc, rowHeight + 8, renderHeader);
      drawTableRow(
        doc,
        columns,
        [
          description,
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

  const total = Number(quote.total ?? subtotal + vatTotal);
  drawTotalsPanel(
    doc,
    [
      { label: 'Subtotal', value: formatPdfCurrency(subtotal) },
      { label: 'VAT', value: formatPdfCurrency(vatTotal) },
      { label: 'Total GBP', value: formatPdfCurrency(total), strong: true },
    ],
    primary,
  );

  if (quote.notes) {
    ensurePdfSpace(doc, 132);
    drawSectionHeading(doc, 'Notes', primary);
    drawInfoPanel(doc, 'Additional Notes', [quote.notes], { primary });
  }
  if (quote.termsAndConditions) {
    ensurePdfSpace(doc, 132);
    drawSectionHeading(doc, 'Terms and Conditions', primary);
    drawInfoPanel(doc, 'Commercial Terms', [quote.termsAndConditions], { primary });
  }

  if (quote.signedAt) {
    ensurePdfSpace(doc, 94);
    drawSectionHeading(doc, 'Acceptance', primary);
    drawInfoPanel(
      doc,
      'Signed By',
      [
        quote.signedByName || 'Customer',
        quote.signedByEmail,
        `Signed at ${formatPdfDateTime(quote.signedAt)}`,
      ],
      { primary },
    );
  }

  if (doc.y > pageBottom(doc)) {
    doc.addPage();
  }
  addPageFooters(doc, `${quoteNumber} - ${tenant.tradingName || tenant.name || 'Quotation'}`, primary);
  return collectPdf(doc, chunks);
};
