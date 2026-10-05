import PDFDocument from 'pdfkit';
import { Tenant } from '../entities/tenant.entity';

export type PdfDocument = PDFKit.PDFDocument;

export type PdfMetaItem = {
  label: string;
  value?: string | number | null;
};

export type PdfTableColumn = {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
};

const PAGE_MARGIN = 44;
const FOOTER_HEIGHT = 34;
const DEFAULT_PRIMARY = '#0F766E';
const TEXT = '#172033';
const MUTED = '#64748B';
const BORDER = '#D8E1EA';
const PANEL = '#F6F9FB';

export const formatPdfCurrency = (value: number | string | null | undefined, currency = 'GBP') => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const formatPdfDate = (value?: Date | string | null) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatPdfDateTime = (value?: Date | string | null) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const normaliseHexColor = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return DEFAULT_PRIMARY;
};

export const collectPdf = async (doc: PdfDocument, chunks: Buffer[]) => {
  doc.end();
  await new Promise<void>((resolve) => doc.on('end', () => resolve()));
  return Buffer.concat(chunks);
};

export const createPdfDocument = () => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    autoFirstPage: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  return { doc, chunks };
};

export const usableWidth = (doc: PdfDocument) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

export const pageBottom = (doc: PdfDocument) => doc.page.height - doc.page.margins.bottom - FOOTER_HEIGHT;

export const ensurePdfSpace = (doc: PdfDocument, height: number, onNewPage?: () => void) => {
  if (doc.y + height <= pageBottom(doc)) return;
  doc.addPage();
  if (onNewPage) onNewPage();
};

export const drawDocumentHeader = (
  doc: PdfDocument,
  params: {
    title: string;
    subtitle?: string;
    tenant?: Tenant | null;
    documentNumber?: string | null;
    status?: string | null;
    meta?: PdfMetaItem[];
    primary?: string;
  },
) => {
  const primary = normaliseHexColor(params.primary ?? params.tenant?.primaryColor);
  const left = doc.page.margins.left;
  const width = usableWidth(doc);
  const top = 30;
  const brandName = params.tenant?.tradingName || params.tenant?.name || 'AEM Systems';

  doc.rect(0, 0, doc.page.width, 124).fill(PANEL);
  doc.rect(0, 0, 9, 124).fill(primary);
  doc.fillColor(primary).font('Helvetica-Bold').fontSize(17).text(brandName, left, top, { width: width * 0.54 });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  [
    params.tenant?.address,
    params.tenant?.vatNumber ? `VAT Number: ${params.tenant.vatNumber}` : null,
    params.tenant?.companyNumber ? `Company Number: ${params.tenant.companyNumber}` : null,
    params.tenant?.contactEmail,
    params.tenant?.contactPhone,
  ]
    .filter(Boolean)
    .forEach((line) => doc.text(String(line), left, doc.y, { width: width * 0.5 }));

  const rightX = left + width * 0.55;
  doc.font('Helvetica-Bold').fontSize(25).fillColor(TEXT).text(params.title, rightX, top - 2, {
    width: width * 0.45,
    align: 'right',
  });
  if (params.subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(params.subtitle, rightX, doc.y + 2, {
      width: width * 0.45,
      align: 'right',
    });
  }
  if (params.documentNumber) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(primary).text(params.documentNumber, rightX, doc.y + 8, {
      width: width * 0.45,
      align: 'right',
    });
  }
  if (params.status) {
    const statusText = params.status.replace(/_/g, ' ');
    const pillWidth = Math.max(72, doc.widthOfString(statusText) + 22);
    const pillX = left + width - pillWidth;
    const pillY = doc.y + 8;
    doc.roundedRect(pillX, pillY, pillWidth, 22, 11).fill(primary);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(statusText, pillX, pillY + 7, {
      width: pillWidth,
      align: 'center',
    });
  }

  doc.y = 146;
  if (params.meta?.length) {
    drawMetaGrid(doc, params.meta, primary);
  }
};

export const drawMetaGrid = (doc: PdfDocument, items: PdfMetaItem[], primary?: string) => {
  const left = doc.page.margins.left;
  const width = usableWidth(doc);
  const gap = 8;
  const columns = Math.min(3, Math.max(1, items.length));
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const top = doc.y;
  const height = 52;
  const accent = normaliseHexColor(primary);

  items.forEach((item, index) => {
    const x = left + (index % columns) * (cardWidth + gap);
    const y = top + Math.floor(index / columns) * (height + gap);
    doc.roundedRect(x, y, cardWidth, height, 10).fill(PANEL).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(item.label.toUpperCase(), x + 12, y + 11, {
      width: cardWidth - 24,
    });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(index === 0 ? accent : TEXT).text(String(item.value ?? '-'), x + 12, y + 27, {
      width: cardWidth - 24,
      ellipsis: true,
    });
  });

  doc.y = top + Math.ceil(items.length / columns) * (height + gap) + 8;
};

export const drawSectionHeading = (doc: PdfDocument, title: string, primary?: string) => {
  ensurePdfSpace(doc, 34);
  const y = doc.y + 4;
  doc.rect(doc.page.margins.left, y + 12, 22, 2).fill(normaliseHexColor(primary));
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT).text(title.toUpperCase(), doc.page.margins.left + 30, y + 6);
  doc.y = y + 27;
};

export const drawInfoPanel = (
  doc: PdfDocument,
  title: string,
  lines: Array<string | null | undefined>,
  options?: { x?: number; y?: number; width?: number; primary?: string },
) => {
  const x = options?.x ?? doc.page.margins.left;
  const width = options?.width ?? usableWidth(doc);
  const cleanLines = lines.map((line) => String(line ?? '').trim()).filter(Boolean);
  const body = cleanLines.length ? cleanLines.join('\n') : '-';
  const bodyHeight = doc.heightOfString(body, { width: width - 24 });
  const height = Math.max(76, bodyHeight + 45);
  let y = options?.y ?? doc.y;

  if (y + height > pageBottom(doc)) {
    doc.addPage();
    y = doc.page.margins.top;
  } else if (!options?.y) {
    ensurePdfSpace(doc, height + 8);
    y = doc.y;
  }
  doc.roundedRect(x, y, width, height, 12).fill(PANEL).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(normaliseHexColor(options?.primary)).text(title.toUpperCase(), x + 12, y + 12, {
    width: width - 24,
  });
  doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(body, x + 12, y + 31, {
    width: width - 24,
    lineGap: 2,
  });
  doc.y = Math.max(doc.y, y + height + 12);
  return height;
};

export const drawTableHeader = (
  doc: PdfDocument,
  columns: PdfTableColumn[],
  x: number,
  y: number,
  primary?: string,
) => {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  doc.roundedRect(x, y, totalWidth, 26, 7).fill(normaliseHexColor(primary));
  let cursorX = x;
  columns.forEach((column) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(column.label.toUpperCase(), cursorX + 8, y + 9, {
      width: column.width - 16,
      align: column.align ?? 'left',
    });
    cursorX += column.width;
  });
  doc.y = y + 26;
};

export const drawTableRow = (
  doc: PdfDocument,
  columns: PdfTableColumn[],
  values: string[],
  x: number,
  y: number,
  options?: { zebra?: boolean; primary?: string; minHeight?: number },
) => {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const heights = columns.map((column, index) =>
    doc.heightOfString(values[index] ?? '', { width: column.width - 16, align: column.align ?? 'left' }),
  );
  const height = Math.max(options?.minHeight ?? 30, Math.max(...heights) + 16);
  if (options?.zebra) {
    doc.roundedRect(x, y, totalWidth, height, 7).fill('#FAFCFE');
  }
  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(x, y + height).lineTo(x + totalWidth, y + height).stroke();
  let cursorX = x;
  columns.forEach((column, index) => {
    doc.font(index === values.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8).fillColor(TEXT).text(
      values[index] ?? '',
      cursorX + 8,
      y + 9,
      {
        width: column.width - 16,
        align: column.align ?? 'left',
        lineGap: 1,
      },
    );
    cursorX += column.width;
  });
  doc.y = y + height;
  return height;
};

export const drawTotalsPanel = (
  doc: PdfDocument,
  rows: Array<{ label: string; value: string; strong?: boolean }>,
  primary?: string,
) => {
  const width = 224;
  const rowHeight = 22;
  const height = rows.length * rowHeight + 24;
  const x = doc.page.margins.left + usableWidth(doc) - width;
  const y = doc.y + 10;
  ensurePdfSpace(doc, height + 10);
  doc.roundedRect(x, y, width, height, 12).fill(PANEL).strokeColor(BORDER).lineWidth(0.5).stroke();
  rows.forEach((row, index) => {
    const rowY = y + 12 + index * rowHeight;
    const isLast = index === rows.length - 1 || row.strong;
    doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(isLast ? 10.5 : 9).fillColor(isLast ? normaliseHexColor(primary) : MUTED);
    doc.text(row.label, x + 14, rowY, { width: 92 });
    doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fillColor(isLast ? normaliseHexColor(primary) : TEXT).text(row.value, x + 106, rowY, {
      width: width - 120,
      align: 'right',
    });
  });
  doc.y = y + height + 14;
};

export const addPageFooters = (doc: PdfDocument, label: string, primary?: string) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const pageNumber = i - range.start + 1;
    const footerY = doc.page.height - 48;
    const left = doc.page.margins.left;
    const width = usableWidth(doc);
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(left, footerY - 8).lineTo(left + width, footerY - 8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, left, footerY, {
      width: width * 0.65,
      height: 10,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(normaliseHexColor(primary)).text(`Page ${pageNumber} of ${range.count}`, left, footerY, {
      width,
      height: 10,
      align: 'right',
      lineBreak: false,
    });
  }
};
