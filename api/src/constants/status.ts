export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST'
}

export enum JobStatus {
  CREATED = 'CREATED',
  SCHEDULED = 'SCHEDULED',
  NOT_ASSIGNED = 'NOT_ASSIGNED',
  ASSIGNED = 'ASSIGNED',
  LIVE = 'LIVE',
  FINISHED = 'FINISHED',
  // Legacy statuses retained for backward compatibility with existing records.
  EN_ROUTE = 'EN_ROUTE',
  ON_SITE = 'ON_SITE',
  REQUIRES_FOLLOW_UP = 'REQUIRES_FOLLOW_UP',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  SIGNED = 'SIGNED',
  DECLINED = 'DECLINED'
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID'
}

export enum SplitInvoiceStatus {
  TO_SEND = 'TO_SEND',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
}

export enum DocumentStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum ContractorComplianceStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  COMPLIANT = 'COMPLIANT',
  REJECTED = 'REJECTED'
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

export enum LeadTaskStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
