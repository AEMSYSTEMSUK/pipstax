import {
  addPageFooters,
  collectPdf,
  createPdfDocument,
  drawDocumentHeader,
  drawInfoPanel,
  drawMetaGrid,
  drawSectionHeading,
  drawTableHeader,
  drawTableRow,
  formatPdfCurrency,
  formatPdfDate,
  PdfTableColumn,
  usableWidth,
} from './pdf-layout.service';

type SummaryMetrics = {
  leads: number | null;
  jobs: number;
  quotes: number;
  invoices: number;
  revenueTotal: number;
  overdueCount: number;
  leadMetricsAvailable?: boolean;
  splitBilling?: {
    totalLines: number;
    toSendValue: number;
    invoicedValue: number;
    paidValue: number;
    linkedCount: number;
    unlinkedCount: number;
  };
  reportScope?: {
    splitBillingAvailable?: boolean;
  };
};

const PRIMARY = '#0F766E';

export const buildSummaryPdf = async (metrics: SummaryMetrics) => {
  const { doc, chunks } = createPdfDocument();
  const reportDate = new Date();
  const pageWidth = usableWidth(doc);

  drawDocumentHeader(doc, {
    title: 'Business Summary',
    subtitle: 'Operational performance overview',
    documentNumber: `Generated ${formatPdfDate(reportDate)}`,
    primary: PRIMARY,
    meta: [
      { label: 'Revenue', value: formatPdfCurrency(metrics.revenueTotal) },
      { label: 'Invoices', value: metrics.invoices },
      { label: 'Overdue', value: metrics.overdueCount },
    ],
  });

  drawSectionHeading(doc, 'Core Metrics', PRIMARY);
  drawMetaGrid(
    doc,
    [
      {
        label: 'Leads',
        value: metrics.leadMetricsAvailable === false ? 'N/A' : metrics.leads ?? 0,
      },
      { label: 'Jobs', value: metrics.jobs },
      { label: 'Quotes', value: metrics.quotes },
      { label: 'Invoices', value: metrics.invoices },
      { label: 'Revenue Total', value: formatPdfCurrency(metrics.revenueTotal) },
      { label: 'Overdue Invoices', value: metrics.overdueCount },
    ],
    PRIMARY,
  );

  if (metrics.reportScope?.splitBillingAvailable) {
    drawSectionHeading(doc, 'Split Billing', PRIMARY);
    const columns: PdfTableColumn[] = [
      { label: 'Metric', width: pageWidth * 0.5 },
      { label: 'Value', width: pageWidth * 0.5, align: 'right' },
    ];
    const tableX = doc.page.margins.left;
    drawTableHeader(doc, columns, tableX, doc.y, PRIMARY);
    [
      ['Total split lines', String(metrics.splitBilling?.totalLines ?? 0)],
      ['Ready to send', formatPdfCurrency(metrics.splitBilling?.toSendValue ?? 0)],
      ['Invoiced value', formatPdfCurrency(metrics.splitBilling?.invoicedValue ?? 0)],
      ['Paid value', formatPdfCurrency(metrics.splitBilling?.paidValue ?? 0)],
      ['Linked lines', String(metrics.splitBilling?.linkedCount ?? 0)],
      ['Unlinked lines', String(metrics.splitBilling?.unlinkedCount ?? 0)],
    ].forEach(([label, value], index) => {
      drawTableRow(doc, columns, [label, value], tableX, doc.y, { zebra: index % 2 === 1 });
    });
  }

  drawSectionHeading(doc, 'Notes', PRIMARY);
  drawInfoPanel(
    doc,
    'Report Scope',
    [
      metrics.leadMetricsAvailable === false
        ? 'Lead conversion and source metrics are hidden in customer/site scoped exports because lead scoping is not reliable for filtered reporting.'
        : 'Lead metrics are included in this export.',
      metrics.reportScope?.splitBillingAvailable
        ? 'Split billing metrics are included for this scope.'
        : 'Split billing metrics are not included for this scope.',
    ],
    { primary: PRIMARY },
  );

  addPageFooters(doc, 'Business Summary Report', PRIMARY);
  return collectPdf(doc, chunks);
};
