import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import {
  ACCOUNTING_PROVIDERS,
  AccountingSyncStatus,
  isAccountingProvider,
} from '../../constants/accounting';
import { IntegrationProvider, IntegrationStatus } from '../../constants/integrations';
import { InvoiceStatus } from '../../constants/status';
import { IntegrationConnection } from '../../entities/integration.entity';
import { Invoice } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Customer } from '../../entities/customer.entity';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import {
  clearIntegrationReauthRequired,
  getIntegrationErrorMessage,
  isReauthRequiredError,
  markIntegrationReauthRequired,
} from './reauth-state.service';

type AccountingInvoiceState = {
  externalId: string;
  reference?: string;
  status?: string;
  paid?: boolean;
  paidAt?: string;
  updatedAt?: string;
};

type AccountingStore = Record<string, AccountingInvoiceState>;

const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_API_BASE = env.accountingOAuth.quickbooksSandbox
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

const asObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};

const toIso = (value?: Date | string | null) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const parseAccountingStore = (integration: IntegrationConnection) => {
  const metadata = asObject(integration.metadata);
  const raw = metadata.invoices;
  const invoices =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? ({ ...(raw as AccountingStore) } as AccountingStore)
      : ({} as AccountingStore);
  return { metadata, invoices };
};

const saveAccountingStore = async (
  integration: IntegrationConnection,
  store: { metadata: Record<string, unknown>; invoices: AccountingStore },
) => {
  integration.metadata = {
    ...store.metadata,
    invoices: store.invoices,
  };
  integration.connectedAt = integration.connectedAt ?? new Date();
  await AppDataSource.getRepository(IntegrationConnection).save(integration);
};

const parseOAuthMeta = (integration: IntegrationConnection) =>
  asObject(asObject(integration.metadata).oauth);

const writeOAuthMetadata = (
  integration: IntegrationConnection,
  params: {
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    expiresIn?: number;
  },
) => {
  const metadata = asObject(integration.metadata);
  const oauth = parseOAuthMeta(integration);
  oauth.tokenType = params.tokenType ?? oauth.tokenType ?? 'Bearer';
  oauth.scope = params.scope ?? oauth.scope ?? null;
  oauth.connectedAt = oauth.connectedAt ?? new Date().toISOString();
  oauth.expiresAt = params.expiresIn
    ? new Date(Date.now() + params.expiresIn * 1000).toISOString()
    : oauth.expiresAt ?? null;
  metadata.oauth = oauth;
  integration.metadata = metadata;
  integration.accessToken = params.accessToken;
  if (params.refreshToken) {
    integration.refreshToken = params.refreshToken;
  }
};

const getOAuthExpiry = (integration: IntegrationConnection) => {
  const oauth = parseOAuthMeta(integration);
  const expiresAtRaw = oauth.expiresAt;
  if (typeof expiresAtRaw !== 'string') return null;
  const date = new Date(expiresAtRaw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isOAuthConnection = (integration: IntegrationConnection) => {
  const metadata = asObject(integration.metadata);
  return metadata.mode === 'oauth';
};

const toBasicAuth = (clientId: string, clientSecret: string) =>
  Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const refreshQuickBooksToken = async (integration: IntegrationConnection) => {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret || !integration.refreshToken) {
    throw new BadRequestError('QuickBooks token refresh is not configured');
  }

  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${toBasicAuth(clientId, clientSecret)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
    }).toString(),
  });
  const payload = (await parseResponse(response)) as Record<string, any>;
  if (!response.ok || !payload.access_token) {
    const detail = payload?.error_description || payload?.error || 'QuickBooks token refresh failed';
    throw new BadRequestError(String(detail));
  }

  writeOAuthMetadata(integration, {
    accessToken: String(payload.access_token),
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : integration.refreshToken,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : undefined,
    scope: typeof payload.scope === 'string' ? payload.scope : undefined,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
  });
};

const refreshXeroToken = async (integration: IntegrationConnection) => {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret || !integration.refreshToken) {
    throw new BadRequestError('Xero token refresh is not configured');
  }

  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${toBasicAuth(clientId, clientSecret)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
    }).toString(),
  });
  const payload = (await parseResponse(response)) as Record<string, any>;
  if (!response.ok || !payload.access_token) {
    const detail = payload?.error_description || payload?.error || 'Xero token refresh failed';
    throw new BadRequestError(String(detail));
  }

  writeOAuthMetadata(integration, {
    accessToken: String(payload.access_token),
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : integration.refreshToken,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : undefined,
    scope: typeof payload.scope === 'string' ? payload.scope : undefined,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
  });
};

const ensureFreshAccountingAccessToken = async (integration: IntegrationConnection) => {
  if (!integration.accessToken) {
    throw new BadRequestError('Integration access token is missing');
  }
  const expiresAt = getOAuthExpiry(integration);
  const expiringSoon = expiresAt ? expiresAt.getTime() <= Date.now() + 60_000 : false;
  if (!expiringSoon) {
    return integration.accessToken;
  }

  if (integration.provider === IntegrationProvider.QUICKBOOKS) {
    await refreshQuickBooksToken(integration);
  } else if (integration.provider === IntegrationProvider.XERO) {
    await refreshXeroToken(integration);
  }
  await AppDataSource.getRepository(IntegrationConnection).save(integration);
  if (!integration.accessToken) {
    throw new BadRequestError('Unable to refresh integration token');
  }
  return integration.accessToken;
};

const providerRequestJson = async (
  integration: IntegrationConnection,
  params: {
    method?: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
) => {
  try {
    const execute = async (token: string) => {
      const response = await fetch(params.url, {
        method: params.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(params.body ? { 'Content-Type': 'application/json' } : {}),
          ...(params.headers ?? {}),
        },
        ...(params.body ? { body: JSON.stringify(params.body) } : {}),
      });
      const payload = await parseResponse(response);
      return { response, payload };
    };

    let accessToken = await ensureFreshAccountingAccessToken(integration);
    let { response, payload } = await execute(accessToken);
    if (response.status !== 401) {
      if (!response.ok) {
        const detail = payload?.Fault?.Error?.[0]?.Detail || payload?.Message || payload?.error || payload?.message || 'Provider request failed';
        throw new BadRequestError(String(detail));
      }
      return payload;
    }

    if (integration.provider === IntegrationProvider.QUICKBOOKS) {
      await refreshQuickBooksToken(integration);
    } else if (integration.provider === IntegrationProvider.XERO) {
      await refreshXeroToken(integration);
    } else {
      throw new BadRequestError('Unsupported accounting provider for token refresh');
    }
    await AppDataSource.getRepository(IntegrationConnection).save(integration);
    accessToken = integration.accessToken ?? accessToken;
    ({ response, payload } = await execute(accessToken));
    if (!response.ok) {
      const detail = payload?.Fault?.Error?.[0]?.Detail || payload?.Message || payload?.error || payload?.message || 'Provider request failed';
      throw new BadRequestError(String(detail));
    }
    return payload;
  } catch (error) {
    if (isReauthRequiredError(error)) {
      await markIntegrationReauthRequired(integration, getIntegrationErrorMessage(error));
      throw new BadRequestError('Token has been expired or revoked. Reconnection required.');
    }
    throw error;
  }
};

const formatYmd = (value?: string | Date | null) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const getQuickBooksRealmId = (integration: IntegrationConnection) => {
  const realmId = asObject(integration.metadata).realmId;
  return typeof realmId === 'string' && realmId.trim() ? realmId.trim() : null;
};

const getQuickBooksQueryRows = (payload: any, key: string) => {
  const rows = payload?.QueryResponse?.[key];
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return [rows];
  return [];
};

const escapeQuickBooksQueryString = (value: string) => value.replace(/'/g, "\\'");

const ensureQuickBooksItemRef = async (integration: IntegrationConnection, realmId: string) => {
  const metadata = asObject(integration.metadata);
  if (typeof metadata.defaultItemId === 'string' && metadata.defaultItemId.trim()) {
    return metadata.defaultItemId.trim();
  }

  const serviceItemsPayload = await providerRequestJson(integration, {
    url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
      realmId,
    )}/query?minorversion=${encodeURIComponent(
      env.accountingOAuth.quickbooksMinorVersion,
    )}&query=${encodeURIComponent("select Id,Name,Type from Item where Type = 'Service' maxresults 1")}`,
    headers: { Accept: 'application/json' },
  });
  const serviceItems = getQuickBooksQueryRows(serviceItemsPayload, 'Item');
  const firstService = serviceItems.find((row: any) => row?.Id);
  if (firstService?.Id) {
    metadata.defaultItemId = String(firstService.Id);
    integration.metadata = metadata;
    return String(firstService.Id);
  }

  const anyItemsPayload = await providerRequestJson(integration, {
    url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
      realmId,
    )}/query?minorversion=${encodeURIComponent(
      env.accountingOAuth.quickbooksMinorVersion,
    )}&query=${encodeURIComponent('select Id,Name from Item maxresults 1')}`,
    headers: { Accept: 'application/json' },
  });
  const anyItems = getQuickBooksQueryRows(anyItemsPayload, 'Item');
  const firstAny = anyItems.find((row: any) => row?.Id);
  if (!firstAny?.Id) {
    throw new BadRequestError(
      'No QuickBooks item found. Please create at least one Service Item in QuickBooks and retry.',
    );
  }
  metadata.defaultItemId = String(firstAny.Id);
  integration.metadata = metadata;
  return String(firstAny.Id);
};

const ensureQuickBooksTaxCodeRefs = async (integration: IntegrationConnection, realmId: string) => {
  const metadata = asObject(integration.metadata);
  const cachedTaxable =
    typeof metadata.defaultTaxCodeId === 'string' && metadata.defaultTaxCodeId.trim()
      ? metadata.defaultTaxCodeId.trim()
      : null;
  const cachedNonTax =
    typeof metadata.defaultNonTaxCodeId === 'string' && metadata.defaultNonTaxCodeId.trim()
      ? metadata.defaultNonTaxCodeId.trim()
      : null;
  if (cachedTaxable || cachedNonTax) {
    return { taxableId: cachedTaxable, nonTaxId: cachedNonTax };
  }

  const payload = await providerRequestJson(integration, {
    url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
      realmId,
    )}/query?minorversion=${encodeURIComponent(
      env.accountingOAuth.quickbooksMinorVersion,
    )}&query=${encodeURIComponent('select Id,Name,Taxable,Active from TaxCode where Active = true maxresults 100')}`,
    headers: { Accept: 'application/json' },
  });
  const taxCodes = getQuickBooksQueryRows(payload, 'TaxCode');
  const taxable = taxCodes.find((row: any) => row?.Id && row?.Taxable === true);
  const nonTax = taxCodes.find((row: any) => row?.Id && row?.Taxable === false);
  const fallback = taxCodes.find((row: any) => row?.Id);

  const taxableId = taxable?.Id ? String(taxable.Id) : fallback?.Id ? String(fallback.Id) : null;
  const nonTaxId = nonTax?.Id ? String(nonTax.Id) : null;
  metadata.defaultTaxCodeId = taxableId;
  metadata.defaultNonTaxCodeId = nonTaxId;
  integration.metadata = metadata;
  return { taxableId, nonTaxId };
};

const ensureQuickBooksCustomerRef = async (
  integration: IntegrationConnection,
  realmId: string,
  invoice: Invoice,
) => {
  const metadata = asObject(integration.metadata);
  const customerMapRaw = asObject(metadata.customerMap);
  const mappedId = customerMapRaw[invoice.customerId];
  if (typeof mappedId === 'string' && mappedId.trim()) {
    return mappedId.trim();
  }

  const customerRepo = AppDataSource.getRepository(Customer);
  const customer = await customerRepo.findOne({
    where: {
      id: invoice.customerId,
      tenantId: invoice.tenantId,
      isDeleted: false,
    },
  });
  const localName =
    customer?.name?.trim() ||
    customer?.email?.trim() ||
    `Customer ${String(invoice.customerId).slice(0, 8)}`;
  const displayName = `${localName} (${String(invoice.customerId).slice(0, 8)})`;

  const existingPayload = await providerRequestJson(integration, {
    url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
      realmId,
    )}/query?minorversion=${encodeURIComponent(
      env.accountingOAuth.quickbooksMinorVersion,
    )}&query=${encodeURIComponent(
      `select Id,DisplayName from Customer where DisplayName = '${escapeQuickBooksQueryString(
        displayName,
      )}' maxresults 1`,
    )}`,
    headers: { Accept: 'application/json' },
  });
  const existingCustomers = getQuickBooksQueryRows(existingPayload, 'Customer');
  const existing = existingCustomers.find((row: any) => row?.Id);
  if (existing?.Id) {
    const existingId = String(existing.Id);
    metadata.customerMap = {
      ...customerMapRaw,
      [invoice.customerId]: existingId,
    };
    integration.metadata = metadata;
    return existingId;
  }

  let payload: any;
  try {
    payload = await providerRequestJson(integration, {
      method: 'POST',
      url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
        realmId,
      )}/customer?minorversion=${encodeURIComponent(env.accountingOAuth.quickbooksMinorVersion)}`,
      headers: { Accept: 'application/json' },
      body: {
        DisplayName: displayName,
        ...(customer?.email ? { PrimaryEmailAddr: { Address: customer.email } } : {}),
        ...(customer?.phone ? { PrimaryPhone: { FreeFormNumber: customer.phone } } : {}),
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? '');
    if (!message.toLowerCase().includes('name supplied already exists')) {
      throw error;
    }
    const retryPayload = await providerRequestJson(integration, {
      url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
        realmId,
      )}/query?minorversion=${encodeURIComponent(
        env.accountingOAuth.quickbooksMinorVersion,
      )}&query=${encodeURIComponent(
        `select Id,DisplayName from Customer where DisplayName = '${escapeQuickBooksQueryString(
          displayName,
        )}' maxresults 1`,
      )}`,
      headers: { Accept: 'application/json' },
    });
    const retryRows = getQuickBooksQueryRows(retryPayload, 'Customer');
    const retryFound = retryRows.find((row: any) => row?.Id);
    if (!retryFound?.Id) {
      throw error;
    }
    payload = { Customer: { Id: retryFound.Id } };
  }
  const qbCustomerId = payload?.Customer?.Id ? String(payload.Customer.Id) : '';
  if (!qbCustomerId) {
    throw new BadRequestError('QuickBooks did not return a customer ID');
  }
  metadata.customerMap = {
    ...customerMapRaw,
    [invoice.customerId]: qbCustomerId,
  };
  integration.metadata = metadata;
  return qbCustomerId;
};

const getXeroTenantId = (integration: IntegrationConnection) => {
  const tenantId = asObject(integration.metadata).xeroTenantId;
  return typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : null;
};

const ensureXeroTaxTypes = async (integration: IntegrationConnection, xeroTenantId: string) => {
  const metadata = asObject(integration.metadata);
  const cachedTaxable =
    typeof metadata.defaultXeroTaxType === 'string' && metadata.defaultXeroTaxType.trim()
      ? metadata.defaultXeroTaxType.trim()
      : null;
  const cachedNonTax =
    typeof metadata.defaultXeroNoTaxType === 'string' && metadata.defaultXeroNoTaxType.trim()
      ? metadata.defaultXeroNoTaxType.trim()
      : null;
  if (cachedTaxable || cachedNonTax) {
    return { taxable: cachedTaxable, nonTax: cachedNonTax ?? 'NONE' };
  }

  const payload = await providerRequestJson(integration, {
    url: `${XERO_API_BASE}/TaxRates`,
    headers: {
      Accept: 'application/json',
      'xero-tenant-id': xeroTenantId,
    },
  });
  const taxRates = Array.isArray(payload?.TaxRates) ? payload.TaxRates : [];
  const revenueRates = taxRates.filter((rate: any) => rate?.Status === 'ACTIVE' && rate?.CanApplyToRevenue);
  const taxableRate = revenueRates.find((rate: any) => Number(rate?.DisplayTaxRate ?? 0) > 0);
  const nonTaxRate = revenueRates.find((rate: any) => Number(rate?.DisplayTaxRate ?? 0) === 0);

  const taxable = typeof taxableRate?.TaxType === 'string' ? taxableRate.TaxType : null;
  const nonTax = typeof nonTaxRate?.TaxType === 'string' ? nonTaxRate.TaxType : 'NONE';
  metadata.defaultXeroTaxType = taxable;
  metadata.defaultXeroNoTaxType = nonTax;
  integration.metadata = metadata;
  return { taxable, nonTax };
};

const ensureXeroContactRef = async (
  integration: IntegrationConnection,
  xeroTenantId: string,
  invoice: Invoice,
) => {
  const metadata = asObject(integration.metadata);
  const customerMapRaw = asObject(metadata.customerMap);
  const mappedId = customerMapRaw[invoice.customerId];
  if (typeof mappedId === 'string' && mappedId.trim()) {
    return mappedId.trim();
  }

  const customerRepo = AppDataSource.getRepository(Customer);
  const customer = await customerRepo.findOne({
    where: {
      id: invoice.customerId,
      tenantId: invoice.tenantId,
      isDeleted: false,
    },
  });
  const localName =
    customer?.name?.trim() ||
    customer?.email?.trim() ||
    `Customer ${String(invoice.customerId).slice(0, 8)}`;
  const contactName = `${localName} (${String(invoice.customerId).slice(0, 8)})`;

  const existingPayload = await providerRequestJson(integration, {
    url: `${XERO_API_BASE}/Contacts?where=${encodeURIComponent(
      `Name=="${contactName.replace(/"/g, '\\"')}"`,
    )}`,
    headers: {
      Accept: 'application/json',
      'xero-tenant-id': xeroTenantId,
    },
  });
  const existingContacts = Array.isArray(existingPayload?.Contacts) ? existingPayload.Contacts : [];
  const existing = existingContacts.find((row: any) => row?.ContactID);
  if (existing?.ContactID) {
    const existingId = String(existing.ContactID);
    metadata.customerMap = {
      ...customerMapRaw,
      [invoice.customerId]: existingId,
    };
    integration.metadata = metadata;
    return existingId;
  }

  const createPayload = await providerRequestJson(integration, {
    method: 'POST',
    url: `${XERO_API_BASE}/Contacts`,
    headers: {
      Accept: 'application/json',
      'xero-tenant-id': xeroTenantId,
    },
    body: {
      Contacts: [
        {
          Name: contactName,
          ...(customer?.email ? { EmailAddress: customer.email } : {}),
          ...(customer?.phone
            ? {
                Phones: [
                  {
                    PhoneType: 'DEFAULT',
                    PhoneNumber: customer.phone,
                  },
                ],
              }
            : {}),
        },
      ],
    },
  });
  const created = Array.isArray(createPayload?.Contacts) ? createPayload.Contacts[0] : null;
  const contactId = created?.ContactID ? String(created.ContactID) : '';
  if (!contactId) {
    throw new BadRequestError('Xero did not return a contact ID');
  }
  metadata.customerMap = {
    ...customerMapRaw,
    [invoice.customerId]: contactId,
  };
  integration.metadata = metadata;
  return contactId;
};

const fetchXeroInvoiceSnapshot = async (
  integration: IntegrationConnection,
  externalId: string,
) => {
  const xeroTenantId = getXeroTenantId(integration);
  if (!xeroTenantId) {
    throw new BadRequestError('Xero tenant ID is missing. Reconnect integration.');
  }
  const payload = await providerRequestJson(integration, {
    url: `${XERO_API_BASE}/Invoices/${encodeURIComponent(externalId)}`,
    headers: {
      Accept: 'application/json',
      'xero-tenant-id': xeroTenantId,
    },
  });
  const xeroInvoice = Array.isArray(payload?.Invoices) ? payload.Invoices[0] : null;
  const amountDue = Number(xeroInvoice?.AmountDue ?? NaN);
  const amountPaid = Number(xeroInvoice?.AmountPaid ?? NaN);
  const status = typeof xeroInvoice?.Status === 'string' ? xeroInvoice.Status.toUpperCase() : '';
  const dueDate =
    typeof xeroInvoice?.DueDateString === 'string'
      ? xeroInvoice.DueDateString
      : typeof xeroInvoice?.DueDate === 'string'
        ? xeroInvoice.DueDate
        : undefined;
  return { amountDue, amountPaid, status, dueDate };
};

const pushInvoiceDraftToQuickBooks = async (
  integration: IntegrationConnection,
  invoice: Invoice,
) => {
  const realmId = getQuickBooksRealmId(integration);
  if (!realmId) {
    throw new BadRequestError('QuickBooks realm ID is missing. Reconnect integration.');
  }
  const customerRef = await ensureQuickBooksCustomerRef(integration, realmId, invoice);
  const itemRef = await ensureQuickBooksItemRef(integration, realmId);
  const taxCodes = await ensureQuickBooksTaxCodeRefs(integration, realmId);
  const url = `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
    realmId,
  )}/invoice?minorversion=${encodeURIComponent(env.accountingOAuth.quickbooksMinorVersion)}`;
  const lines = (invoice.lineItems ?? []).map((item) => ({
    Amount: Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0),
    DetailType: 'SalesItemLineDetail',
    Description: String(item.description ?? '').trim() || 'Line item',
    SalesItemLineDetail: {
      Qty: Number(item.quantity ?? 1),
      UnitPrice: Number(item.unitPrice ?? 0),
      ItemRef: { value: itemRef },
      ...(taxCodes.taxableId || taxCodes.nonTaxId
        ? {
            TaxCodeRef: {
              value:
                Number(item.vatRate ?? 0) > 0
                  ? taxCodes.taxableId ?? taxCodes.nonTaxId
                  : taxCodes.nonTaxId ?? taxCodes.taxableId,
            },
          }
        : {}),
    },
  }));

  const payload = await providerRequestJson(integration, {
    method: 'POST',
    url,
    body: {
      DocNumber: invoice.invoiceNumber ?? undefined,
      TxnDate: formatYmd(invoice.createdAt),
      DueDate: formatYmd(invoice.dueDate),
      PrivateNote: invoice.title ?? undefined,
      CustomerRef: { value: customerRef },
      GlobalTaxCalculation: 'TaxExcluded',
      Line:
        lines.length > 0
          ? lines
          : [
              {
                Amount: Number(invoice.total ?? 0),
                DetailType: 'SalesItemLineDetail',
                Description: invoice.title ?? 'Invoice',
                SalesItemLineDetail: {
                  Qty: 1,
                  UnitPrice: Number(invoice.total ?? 0),
                  ItemRef: { value: itemRef },
                  ...(taxCodes.taxableId || taxCodes.nonTaxId
                    ? { TaxCodeRef: { value: taxCodes.taxableId ?? taxCodes.nonTaxId } }
                    : {}),
                },
              },
            ],
    },
    headers: { Accept: 'application/json' },
  });
  const qbInvoice = payload?.Invoice;
  const externalId = qbInvoice?.Id ? String(qbInvoice.Id) : '';
  if (!externalId) {
    throw new BadRequestError('QuickBooks did not return an invoice ID');
  }
  return {
    externalId,
    externalReference: qbInvoice?.DocNumber ? String(qbInvoice.DocNumber) : invoice.invoiceNumber ?? undefined,
  };
};

const pushInvoiceDraftToXero = async (integration: IntegrationConnection, invoice: Invoice) => {
  const xeroTenantId = getXeroTenantId(integration);
  if (!xeroTenantId) {
    throw new BadRequestError('Xero tenant ID is missing. Reconnect integration.');
  }
  const contactId = await ensureXeroContactRef(integration, xeroTenantId, invoice);
  const taxTypes = await ensureXeroTaxTypes(integration, xeroTenantId);
  const lineItems = (invoice.lineItems ?? []).map((item) => ({
    Description: String(item.description ?? '').trim() || 'Line item',
    Quantity: Number(item.quantity ?? 0),
    UnitAmount: Number(item.unitPrice ?? 0),
    TaxType:
      Number(item.vatRate ?? 0) > 0
        ? taxTypes.taxable ?? taxTypes.nonTax ?? 'NONE'
        : taxTypes.nonTax ?? taxTypes.taxable ?? 'NONE',
    AccountCode: process.env.XERO_DEFAULT_REVENUE_ACCOUNT_CODE ?? '200',
  }));

  const payload = await providerRequestJson(integration, {
    method: 'POST',
    url: `${XERO_API_BASE}/Invoices`,
    headers: {
      Accept: 'application/json',
      'xero-tenant-id': xeroTenantId,
    },
    body: {
      Type: 'ACCREC',
      Contact: { ContactID: contactId },
      DateString: formatYmd(invoice.createdAt),
      DueDateString: formatYmd(invoice.dueDate),
      InvoiceNumber: invoice.invoiceNumber ?? undefined,
      Reference: invoice.title ?? undefined,
      Status: 'DRAFT',
      LineItems:
        lineItems.length > 0
          ? lineItems
          : [
              {
                Description: invoice.title ?? 'Invoice',
                Quantity: 1,
                UnitAmount: Number(invoice.total ?? 0),
                TaxType: taxTypes.nonTax ?? 'NONE',
                AccountCode: process.env.XERO_DEFAULT_REVENUE_ACCOUNT_CODE ?? '200',
              },
            ],
    },
  });
  const xeroInvoice = Array.isArray(payload?.Invoices) ? payload.Invoices[0] : null;
  const externalId = xeroInvoice?.InvoiceID ? String(xeroInvoice.InvoiceID) : '';
  if (!externalId) {
    throw new BadRequestError('Xero did not return an invoice ID');
  }
  return {
    externalId,
    externalReference: xeroInvoice?.InvoiceNumber ? String(xeroInvoice.InvoiceNumber) : invoice.invoiceNumber ?? undefined,
  };
};

const fetchQuickBooksInvoiceStatus = async (
  integration: IntegrationConnection,
  externalId: string,
) => {
  const realmId = getQuickBooksRealmId(integration);
  if (!realmId) {
    throw new BadRequestError('QuickBooks realm ID is missing. Reconnect integration.');
  }
  const url = `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
    realmId,
  )}/invoice/${encodeURIComponent(externalId)}?minorversion=${encodeURIComponent(
    env.accountingOAuth.quickbooksMinorVersion,
  )}`;
  const payload = await providerRequestJson(integration, {
    url,
    headers: { Accept: 'application/json' },
  });
  const qbInvoice = payload?.Invoice;
  const balance = Number(qbInvoice?.Balance ?? NaN);
  const dueDate = typeof qbInvoice?.DueDate === 'string' ? qbInvoice.DueDate : undefined;
  const isPaid = !Number.isNaN(balance) && balance <= 0;
  return { isPaid, dueDate };
};

const fetchXeroInvoiceStatus = async (
  integration: IntegrationConnection,
  externalId: string,
) => {
  const snapshot = await fetchXeroInvoiceSnapshot(integration, externalId);
  const amountDue = snapshot.amountDue;
  const amountPaid = snapshot.amountPaid;
  const status = snapshot.status;
  const isPaid =
    status === 'PAID' ||
    (!Number.isNaN(amountDue) && amountDue <= 0 && (!Number.isNaN(amountPaid) ? amountPaid > 0 : true));
  const dueDate = snapshot.dueDate;
  return { isPaid, dueDate };
};

const pushQuickBooksInvoicePayment = async (
  integration: IntegrationConnection,
  invoice: Invoice,
) => {
  if (!invoice.accountingExternalId) {
    throw new BadRequestError('Invoice is not linked to QuickBooks');
  }
  const realmId = getQuickBooksRealmId(integration);
  if (!realmId) {
    throw new BadRequestError('QuickBooks realm ID is missing. Reconnect integration.');
  }

  const qbInvoicePayload = await providerRequestJson(integration, {
    url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
      realmId,
    )}/invoice/${encodeURIComponent(invoice.accountingExternalId)}?minorversion=${encodeURIComponent(
      env.accountingOAuth.quickbooksMinorVersion,
    )}`,
    headers: { Accept: 'application/json' },
  });
  const qbInvoice = qbInvoicePayload?.Invoice;
  const customerRef =
    typeof qbInvoice?.CustomerRef?.value === 'string' ? qbInvoice.CustomerRef.value : '';
  const balance = Number(qbInvoice?.Balance ?? NaN);

  if (!customerRef) {
    throw new BadRequestError('QuickBooks invoice customer reference is missing');
  }
  if (Number.isNaN(balance)) {
    throw new BadRequestError('QuickBooks invoice balance is invalid');
  }
  if (balance <= 0) {
    return { alreadyPaid: true } as const;
  }

  await providerRequestJson(integration, {
    method: 'POST',
    url: `${QUICKBOOKS_API_BASE}/v3/company/${encodeURIComponent(
      realmId,
    )}/payment?minorversion=${encodeURIComponent(env.accountingOAuth.quickbooksMinorVersion)}`,
    headers: { Accept: 'application/json' },
    body: {
      CustomerRef: { value: customerRef },
      TotalAmt: balance,
      TxnDate: formatYmd(new Date()),
      PrivateNote: `CRM payment for ${invoice.invoiceNumber ?? invoice.id}`,
      ...(process.env.QUICKBOOKS_DEPOSIT_ACCOUNT_ID
        ? { DepositToAccountRef: { value: process.env.QUICKBOOKS_DEPOSIT_ACCOUNT_ID } }
        : {}),
      Line: [
        {
          Amount: balance,
          LinkedTxn: [{ TxnId: invoice.accountingExternalId, TxnType: 'Invoice' }],
        },
      ],
    },
  });
  return { alreadyPaid: false } as const;
};

const pushXeroInvoicePayment = async (integration: IntegrationConnection, invoice: Invoice) => {
  if (!invoice.accountingExternalId) {
    throw new BadRequestError('Invoice is not linked to Xero');
  }
  const xeroTenantId = getXeroTenantId(integration);
  if (!xeroTenantId) {
    throw new BadRequestError('Xero tenant ID is missing. Reconnect integration.');
  }
  const snapshot = await fetchXeroInvoiceSnapshot(integration, invoice.accountingExternalId);
  const amount = Number.isFinite(snapshot.amountDue) ? snapshot.amountDue : Number(invoice.total ?? 0);
  if (!(amount > 0)) {
    return { skipped: true } as const;
  }
  await providerRequestJson(integration, {
    method: 'POST',
    url: `${XERO_API_BASE}/Payments`,
    headers: {
      Accept: 'application/json',
      'xero-tenant-id': xeroTenantId,
    },
    body: {
      Payments: [
        {
          Invoice: { InvoiceID: invoice.accountingExternalId },
          Account: { Code: process.env.XERO_PAYMENT_ACCOUNT_CODE ?? '090' },
          Date: formatYmd(new Date()),
          Amount: amount,
          Reference: `CRM payment ${invoice.invoiceNumber ?? invoice.id}`,
        },
      ],
    },
  });
  return { skipped: false } as const;
};

const getPreferredAccountingProvider = async (tenantId: string) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  if (!tenant.accountingProvider || !isAccountingProvider(tenant.accountingProvider)) {
    return null;
  }
  return tenant.accountingProvider;
};

export const getConnectedAccountingIntegration = async (tenantId: string) => {
  const preferred = await getPreferredAccountingProvider(tenantId);
  if (!preferred) return null;
  const repo = AppDataSource.getRepository(IntegrationConnection);
  const integration = await repo.findOne({
    where: {
      tenantId,
      provider: preferred,
      status: IntegrationStatus.CONNECTED,
      isDeleted: false,
    },
  });
  return integration ?? null;
};

const buildExternalInvoiceId = (invoice: Invoice) =>
  `acct_${invoice.id.replace(/-/g, '').slice(0, 20)}_${Date.now().toString(36)}`;

const canAutoPushToAccounting = (invoice: Invoice) =>
  [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE, InvoiceStatus.PAID].includes(
    invoice.status,
  );

const canAutoMarkPaidFromProvider = (invoice: Invoice) =>
  [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE].includes(invoice.status);

const canResetPaidFromProvider = (invoice: Invoice) => invoice.status === InvoiceStatus.PAID;

export const syncInvoiceDraftToAccounting = async (
  tenantId: string,
  invoice: Invoice,
) => {
  const integration = await getConnectedAccountingIntegration(tenantId);
  if (!integration) {
    invoice.accountingSyncStatus = AccountingSyncStatus.NOT_SYNCED;
    invoice.accountingSyncError = 'Accounting platform is not connected.';
    return {
      synced: false,
      reason: 'not_connected',
    } as const;
  }

  // Avoid creating duplicate drafts for invoices already linked to the active provider.
  if (
    invoice.accountingProvider === integration.provider &&
    typeof invoice.accountingExternalId === 'string' &&
    invoice.accountingExternalId.trim().length > 0
  ) {
    invoice.accountingSyncStatus = AccountingSyncStatus.SYNCED;
    invoice.accountingSyncError = null as any;
    invoice.accountingSyncedAt = invoice.accountingSyncedAt ?? new Date();
    return {
      synced: true,
      provider: integration.provider,
      externalId: invoice.accountingExternalId,
      alreadySynced: true,
    } as const;
  }

  if (isOAuthConnection(integration)) {
    try {
      const syncResult =
        integration.provider === IntegrationProvider.QUICKBOOKS
          ? await pushInvoiceDraftToQuickBooks(integration, invoice)
          : await pushInvoiceDraftToXero(integration, invoice);
      await AppDataSource.getRepository(IntegrationConnection).save(integration);

      invoice.accountingProvider = integration.provider;
      invoice.accountingExternalId = syncResult.externalId;
      invoice.accountingExternalReference = syncResult.externalReference ?? invoice.invoiceNumber;
      invoice.accountingSyncStatus = AccountingSyncStatus.SYNCED;
      invoice.accountingSyncedAt = new Date();
      invoice.accountingSyncError = null as any;

      return {
        synced: true,
        provider: integration.provider,
        externalId: invoice.accountingExternalId,
      } as const;
    } catch (error: any) {
      invoice.accountingProvider = integration.provider;
      invoice.accountingSyncStatus = AccountingSyncStatus.FAILED;
      invoice.accountingSyncError = error?.message ?? 'Accounting sync failed';
      return {
        synced: false,
        provider: integration.provider,
        reason: 'provider_error',
      } as const;
    }
  }

  const store = parseAccountingStore(integration);
  const externalState = store.invoices[invoice.id] ?? {
    externalId: invoice.accountingExternalId || buildExternalInvoiceId(invoice),
  };

  store.invoices[invoice.id] = {
    ...externalState,
    reference: invoice.invoiceNumber,
    status: 'DRAFT',
    paid: false,
    paidAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  await saveAccountingStore(integration, store);

  invoice.accountingProvider = integration.provider;
  invoice.accountingExternalId = store.invoices[invoice.id].externalId;
  invoice.accountingExternalReference = invoice.invoiceNumber;
  invoice.accountingSyncStatus = AccountingSyncStatus.SYNCED;
  invoice.accountingSyncedAt = new Date();
  invoice.accountingSyncError = null as any;

  return {
    synced: true,
    provider: integration.provider,
    externalId: invoice.accountingExternalId,
  } as const;
};

export const markAccountingInvoicePaid = async (tenantId: string, invoice: Invoice) => {
  const integration = await getConnectedAccountingIntegration(tenantId);
  if (!integration) return;
  if (isOAuthConnection(integration)) {
    try {
      if (!invoice.accountingExternalId) {
        const draftSync = await syncInvoiceDraftToAccounting(tenantId, invoice);
        if (draftSync.synced) {
          await AppDataSource.getRepository(Invoice).save(invoice);
        }
      }
      if (integration.provider === IntegrationProvider.QUICKBOOKS) {
        await pushQuickBooksInvoicePayment(integration, invoice);
      } else if (integration.provider === IntegrationProvider.XERO) {
        await pushXeroInvoicePayment(integration, invoice);
      }
      invoice.accountingSyncStatus = AccountingSyncStatus.SYNCED;
      invoice.accountingSyncError = null as any;
      invoice.accountingSyncedAt = new Date();
      await AppDataSource.getRepository(IntegrationConnection).save(integration);
      await AppDataSource.getRepository(Invoice).save(invoice);
    } catch (error: any) {
      invoice.accountingSyncStatus = AccountingSyncStatus.FAILED;
      invoice.accountingSyncError = error?.message ?? 'Accounting payment sync failed';
      await AppDataSource.getRepository(Invoice).save(invoice);
    }
    return;
  }
  const store = parseAccountingStore(integration);
  const current = store.invoices[invoice.id];
  if (!current) return;
  store.invoices[invoice.id] = {
    ...current,
    status: 'PAID',
    paid: true,
    paidAt: toIso(invoice.paidAt) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveAccountingStore(integration, store);
};

export const markAccountingInvoiceViewed = async (tenantId: string, invoice: Invoice) => {
  const integration = await getConnectedAccountingIntegration(tenantId);
  if (!integration) return;
  if (isOAuthConnection(integration)) {
    return;
  }
  const store = parseAccountingStore(integration);
  const current = store.invoices[invoice.id];
  if (!current) return;
  store.invoices[invoice.id] = {
    ...current,
    status: current.paid ? 'PAID' : 'VIEWED',
    updatedAt: new Date().toISOString(),
  };
  await saveAccountingStore(integration, store);
};

export const syncInvoicePaymentStatusesFromAccounting = async (tenantId: string) => {
  const integration = await getConnectedAccountingIntegration(tenantId);
  if (!integration) {
    return {
      provider: null,
      synced: 0,
      paid: 0,
      overdue: 0,
      reason: 'not_connected',
    };
  }

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const invoices = await invoiceRepo.find({
    where: {
      tenantId,
      isDeleted: false,
    },
  });

  let synced = 0;
  let paid = 0;
  let overdue = 0;
  let backfilled = 0;
  const now = Date.now();

  if (isOAuthConnection(integration)) {
    for (const invoice of invoices) {
      if (!invoice.accountingExternalId && canAutoPushToAccounting(invoice)) {
        const draftSync = await syncInvoiceDraftToAccounting(tenantId, invoice);
        if (draftSync.synced) {
          backfilled += 1;
        }
      }
      if (invoice.accountingProvider !== integration.provider) continue;
      if (!invoice.accountingExternalId) continue;
      try {
        const remote =
          integration.provider === IntegrationProvider.QUICKBOOKS
            ? await fetchQuickBooksInvoiceStatus(integration, invoice.accountingExternalId)
            : await fetchXeroInvoiceStatus(integration, invoice.accountingExternalId);
        synced += 1;
        invoice.accountingLastStatusSyncAt = new Date();
        invoice.accountingSyncStatus = AccountingSyncStatus.SYNCED;
        invoice.accountingSyncError = null as any;

        if (remote.dueDate) {
          invoice.dueDate = remote.dueDate;
        }

        if (remote.isPaid && canAutoMarkPaidFromProvider(invoice)) {
          invoice.status = InvoiceStatus.PAID;
          invoice.paidAt = new Date();
          paid += 1;
        } else if (!remote.isPaid && canResetPaidFromProvider(invoice)) {
          invoice.paidAt = null as any;
          if (
            invoice.dueDate &&
            new Date(invoice.dueDate).getTime() < now
          ) {
            invoice.status = InvoiceStatus.OVERDUE;
            overdue += 1;
          } else {
            invoice.status = InvoiceStatus.SENT;
          }
        } else if (
          invoice.status !== InvoiceStatus.PAID &&
          invoice.dueDate &&
          new Date(invoice.dueDate).getTime() < now &&
          [InvoiceStatus.SENT, InvoiceStatus.VIEWED].includes(invoice.status)
        ) {
          invoice.status = InvoiceStatus.OVERDUE;
          overdue += 1;
        }
      } catch (error: any) {
        invoice.accountingLastStatusSyncAt = new Date();
        invoice.accountingSyncStatus = AccountingSyncStatus.FAILED;
        invoice.accountingSyncError = error?.message ?? 'Status sync failed';
      }
    }
    if (invoices.length > 0) {
      await AppDataSource.getRepository(IntegrationConnection).save(integration);
      await invoiceRepo.save(invoices);
    }
    return {
      provider: integration.provider,
      synced,
      paid,
      overdue,
      backfilled,
    };
  }

  const store = parseAccountingStore(integration);
  for (const invoice of invoices) {
    if (!invoice.accountingExternalId && canAutoPushToAccounting(invoice)) {
      const draftSync = await syncInvoiceDraftToAccounting(tenantId, invoice);
      if (draftSync.synced) {
        backfilled += 1;
      }
    }
    if (invoice.accountingProvider !== integration.provider) continue;
    const external = store.invoices[invoice.id];
    if (!external) continue;
    synced += 1;
    invoice.accountingLastStatusSyncAt = new Date();

    if ((external.paid || external.status === 'PAID') && canAutoMarkPaidFromProvider(invoice)) {
      invoice.status = InvoiceStatus.PAID;
      invoice.paidAt = external.paidAt ? new Date(external.paidAt) : new Date();
      paid += 1;
    } else if (
      invoice.status !== InvoiceStatus.PAID &&
      invoice.dueDate &&
      new Date(invoice.dueDate).getTime() < now &&
      [InvoiceStatus.SENT, InvoiceStatus.VIEWED].includes(invoice.status)
    ) {
      invoice.status = InvoiceStatus.OVERDUE;
      overdue += 1;
    }
  }

  if (invoices.length > 0) {
    await invoiceRepo.save(invoices);
  }

  return {
    provider: integration.provider,
    synced,
    paid,
    overdue,
    backfilled,
  };
};

export const ensureSingleAccountingProvider = async (
  tenantId: string,
  provider: (typeof ACCOUNTING_PROVIDERS)[number],
) => {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const integrationRepo = AppDataSource.getRepository(IntegrationConnection);
  const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  if (tenant.accountingProvider && tenant.accountingProvider !== provider) {
    throw new BadRequestError(
      'Accounting provider is locked after onboarding and cannot be changed',
    );
  }

  const otherProviders = ACCOUNTING_PROVIDERS.filter((item) => item !== provider);
  if (otherProviders.length > 0) {
    const existingOthers = await integrationRepo.find({
      where: otherProviders.map((item) => ({
        tenantId,
        provider: item,
        isDeleted: false,
      })),
    });
    for (const integration of existingOthers) {
      if (integration.status !== IntegrationStatus.DISCONNECTED) {
        integration.status = IntegrationStatus.DISCONNECTED;
      }
    }
    if (existingOthers.length > 0) {
      await integrationRepo.save(existingOthers);
    }
  }

  tenant.accountingProvider = provider;
  await tenantRepo.save(tenant);

  let connection = await integrationRepo.findOne({
    where: { tenantId, provider, isDeleted: false },
  });
  if (!connection) {
    connection = integrationRepo.create({
      tenantId,
      provider,
      status: IntegrationStatus.CONNECTED,
      connectedAt: new Date(),
      metadata: {},
    });
  } else {
    connection.status = IntegrationStatus.CONNECTED;
    connection.connectedAt = new Date();
  }
  await integrationRepo.save(connection);
  return connection;
};

export const disconnectAccountingProvider = async (
  tenantId: string,
  provider: (typeof ACCOUNTING_PROVIDERS)[number],
) => {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const integrationRepo = AppDataSource.getRepository(IntegrationConnection);
  const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  if (tenant.accountingProvider && tenant.accountingProvider !== provider) {
    throw new BadRequestError(
      'Accounting provider is locked after onboarding and cannot be changed',
    );
  }
  const integration = await integrationRepo.findOne({
    where: { tenantId, provider, isDeleted: false },
  });
  if (integration) {
    integration.status = IntegrationStatus.DISCONNECTED;
    integration.metadata = clearIntegrationReauthRequired(
      asObject(integration.metadata),
    );
    await integrationRepo.save(integration);
  }
  // Keep onboarding provider locked; disconnect only toggles integration status.
  return integration ?? null;
};
