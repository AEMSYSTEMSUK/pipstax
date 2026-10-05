const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const normalizeStatusKey = (status: string | null | undefined) =>
  String(status ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();

export const formatStatusLabel = (status: string | null | undefined) => {
  const normalized = normalizeStatusKey(status);
  if (!normalized) return "";
  return titleCase(normalized.replaceAll("_", " "));
};

export const formatJobStatus = (status: string | null | undefined) => {
  switch (normalizeStatusKey(status)) {
    case "CREATED":
    case "SCHEDULED":
    case "NOT_ASSIGNED":
    case "CANCELLED":
      return "Not Assigned";
    case "ASSIGNED":
      return "Assigned";
    case "LIVE":
    case "EN_ROUTE":
    case "ON_SITE":
      return "Live";
    case "REQUIRES_FOLLOW_UP":
      return "Needs Attention";
    case "FINISHED":
      return "Finished";
    case "COMPLETED":
      return "Closed";
    default:
      return formatStatusLabel(status);
  }
};

export const formatLeadStatus = (status: string | null | undefined) => {
  switch (normalizeStatusKey(status)) {
    case "NEW":
      return "New";
    case "CONTACTED":
      return "Contacted";
    case "QUALIFIED":
      return "Qualified";
    case "PROPOSAL":
      return "Proposal";
    case "WON":
    case "CONVERTED":
      return "Won";
    case "LOST":
      return "Lost";
    default:
      return formatStatusLabel(status);
  }
};

export const formatQuoteStatus = (status: string | null | undefined) => {
  switch (normalizeStatusKey(status)) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "VIEWED":
      return "Viewed";
    case "SIGNED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "EXPIRED":
      return "Expired";
    default:
      return formatStatusLabel(status);
  }
};

export const formatInvoiceStatus = (status: string | null | undefined) => {
  switch (normalizeStatusKey(status)) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "VIEWED":
      return "Viewed";
    case "PARTIALLY_PAID":
      return "Partially Paid";
    case "PAID":
      return "Paid";
    case "OVERDUE":
      return "Overdue";
    default:
      return formatStatusLabel(status);
  }
};

export const formatSplitInvoiceStatus = (status: string | null | undefined) => {
  switch (normalizeStatusKey(status)) {
    case "TO_SEND":
      return "To Send";
    case "INVOICED":
      return "Invoiced";
    case "PAID":
      return "Paid";
    default:
      return formatStatusLabel(status);
  }
};
