export enum IntegrationProvider {
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  SHAREPOINT = 'SHAREPOINT',
  QUICKBOOKS = 'QUICKBOOKS',
  XERO = 'XERO'
}

export enum IntegrationStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

export enum SyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  ERROR = 'ERROR'
}
