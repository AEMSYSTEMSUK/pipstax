import { IntegrationProvider } from './integrations';

export const ACCOUNTING_PROVIDERS = [
  IntegrationProvider.QUICKBOOKS,
  IntegrationProvider.XERO,
] as const;

export type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];

export enum AccountingSyncStatus {
  NOT_SYNCED = 'NOT_SYNCED',
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}

export const isAccountingProvider = (value?: string | null): value is AccountingProvider =>
  Boolean(value) && ACCOUNTING_PROVIDERS.includes(value as AccountingProvider);
