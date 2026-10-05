import { IntegrationProvider } from './integrations';

export const DOCUMENT_SYNC_PROVIDERS = [
  IntegrationProvider.GOOGLE_DRIVE,
  IntegrationProvider.SHAREPOINT,
] as const;

export type DocumentSyncProvider = (typeof DOCUMENT_SYNC_PROVIDERS)[number];
