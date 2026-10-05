import { Job } from '../entities/job.entity';
import { Tenant } from '../entities/tenant.entity';
import {
  addPageFooters,
  collectPdf,
  createPdfDocument,
  drawDocumentHeader,
  drawInfoPanel,
  drawSectionHeading,
  formatPdfDateTime,
  usableWidth,
} from './pdf-layout.service';

type JobClosurePdfParams = {
  job: Job;
  tenant: Tenant | null;
  workerName: string;
  workDone: string;
  productsUsed?: string;
  notes?: string;
  customerSignatureData: string;
  customerSignatureName?: string;
  completedAt: Date;
};

const drawSignature = (params: {
  doc: PDFKit.PDFDocument;
  signatureData: string;
  customerName?: string;
  primary?: string;
}) => {
  const { doc, signatureData, customerName, primary } = params;
  drawSectionHeading(doc, 'Customer Sign-Off', primary);
  const left = doc.page.margins.left;
  const width = usableWidth(doc);
  const y = doc.y;
  doc.roundedRect(left, y, width, 124, 12).fill('#F6F9FB').strokeColor('#D8E1EA').lineWidth(0.5).stroke();
  try {
    const base64 = signatureData.replace(/^data:image\/\w+;base64,/, '');
    const signatureBuffer = Buffer.from(base64, 'base64');
    doc.image(signatureBuffer, left + 14, y + 16, { fit: [240, 70] });
  } catch {
    doc.font('Helvetica').fontSize(9).fillColor('#64748B').text('Signature image could not be embedded.', left + 14, y + 24);
  }
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748B').text('CUSTOMER NAME', left + 280, y + 26, {
    width: width - 300,
  });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#172033').text(customerName?.trim() || 'Not provided', left + 280, y + 43, {
    width: width - 300,
  });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748B').text('SIGNED AT', left + 280, y + 72, {
    width: width - 300,
  });
  doc.font('Helvetica').fontSize(10).fillColor('#172033').text(formatPdfDateTime(new Date()), left + 280, y + 89, {
    width: width - 300,
  });
  doc.y = y + 140;
};

export const buildJobClosurePdf = async (params: JobClosurePdfParams) => {
  const { doc, chunks } = createPdfDocument();
  const primary = params.tenant?.primaryColor;
  const reference = params.job.jobNumber ?? params.job.id;

  drawDocumentHeader(doc, {
    title: 'Job Closure Report',
    subtitle: params.job.title,
    tenant: params.tenant,
    documentNumber: reference,
    status: 'Closed',
    primary,
    meta: [
      { label: 'Job Number', value: reference },
      { label: 'Closed By', value: params.workerName },
      { label: 'Closed At', value: formatPdfDateTime(params.completedAt) },
    ],
  });

  drawSectionHeading(doc, 'Job Details', primary);
  drawInfoPanel(
    doc,
    'Job Information',
    [
      `Title: ${params.job.title}`,
      `Address: ${params.job.location || [params.job.addressLine1, params.job.addressLine2, params.job.city, params.job.state, params.job.postalCode, params.job.country].filter(Boolean).join(', ') || '-'}`,
      `Scheduled: ${formatPdfDateTime(params.job.scheduledAt)}`,
    ],
    { primary },
  );

  drawSectionHeading(doc, 'Closure Details', primary);
  drawInfoPanel(doc, 'Work Done', [params.workDone], { primary });
  drawInfoPanel(doc, 'Products Used', [params.productsUsed?.trim() || 'None recorded'], { primary });
  drawInfoPanel(doc, 'Additional Notes', [params.notes?.trim() || 'None recorded'], { primary });

  drawSignature({
    doc,
    signatureData: params.customerSignatureData,
    customerName: params.customerSignatureName,
    primary,
  });

  addPageFooters(doc, `Job closure report • ${reference}`, primary);
  return collectPdf(doc, chunks);
};
