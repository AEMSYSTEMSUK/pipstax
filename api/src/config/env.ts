import dotenv from "dotenv";
import { StorageProvider } from "../constants/storage";

dotenv.config();

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  appUrl: process.env.APP_URL ?? "http://127.0.0.1:3000",
  appPortalUrl: process.env.APP_PORTAL_URL ?? process.env.APP_URL ?? "http://127.0.0.1:3000",
  adminUrl: process.env.ADMIN_URL ?? "http://127.0.0.1:3001",
  apiUrl: process.env.API_URL ?? "http://127.0.0.1:5000/api/v1",
  tenantBaseDomain: process.env.TENANT_BASE_DOMAIN ?? "localhost:3000",
  workerAppUrl: process.env.WORKER_APP_URL ?? process.env.APP_WORKER_URL ?? "http://localhost:5173",
  exposeAuthDetails:
    (process.env.NODE_ENV ?? "development") !== "production" &&
    String(process.env.EXPOSE_AUTH_DETAILS ?? "false") === "true",
  tenantSubdomainHeader:
    process.env.TENANT_SUBDOMAIN_HEADER ?? "X-Tenant-Subdomain",
  fileStorageProvider:
    process.env.FILE_STORAGE_PROVIDER === StorageProvider.S3
      ? StorageProvider.S3
      : StorageProvider.LOCAL,
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? process.env.FILE_STORAGE_PUBLIC_BASE_URL,
  },
  integrationOAuth: {
    callbackUrl:
      process.env.INTEGRATION_OAUTH_CALLBACK_URL ??
      `${process.env.API_URL ?? "http://127.0.0.1:5000/api/v1"}/integrations/oauth/callback`,
    googleScopes:
      process.env.GOOGLE_DRIVE_SCOPES ??
      "openid email profile https://www.googleapis.com/auth/drive",
    sharepointScopes:
      process.env.SHAREPOINT_SCOPES ??
      "offline_access openid profile User.Read Files.ReadWrite.All",
  },
  accountingOAuth: {
    callbackUrl:
      process.env.ACCOUNTING_OAUTH_CALLBACK_URL ??
      process.env.INTEGRATION_OAUTH_CALLBACK_URL ??
      `${process.env.API_URL ?? "http://127.0.0.1:5000/api/v1"}/integrations/oauth/callback`,
    quickbooksScopes:
      process.env.QUICKBOOKS_SCOPES ??
      "com.intuit.quickbooks.accounting openid profile email",
    xeroScopes:
      process.env.XERO_SCOPES ??
      "openid profile email accounting.transactions accounting.contacts offline_access",
    quickbooksSandbox: String(process.env.QUICKBOOKS_SANDBOX ?? "true") === "true",
    quickbooksMinorVersion: process.env.QUICKBOOKS_MINOR_VERSION ?? "75",
  },
  db: {
    url: process.env.DATABASE_URL ?? process.env.DB_URL,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    name: process.env.DB_NAME,
    ssl: String(process.env.DB_SSL ?? "true") === "true",
    sync: String(process.env.DB_SYNC ?? "false") === "true",
    logging: String(process.env.DB_LOGGING ?? "false") === "true",
  },
  jwt: {
    secret: required("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRATION ?? "7d",
  },
  tenantHeader: process.env.TENANT_HEADER ?? "X-Tenant-Id",
  mail: {
    provider: String(
      process.env.MAIL_PROVIDER ??
        (process.env.RESEND_API_KEY ? "resend" : "smtp"),
    ).toLowerCase(),
    resendApiKey: process.env.RESEND_API_KEY,
    host:
      process.env.SMTP_HOST ??
      process.env.GMAIL_SMTP_HOST ??
      process.env.GMAIL_HOST ??
      ((process.env.SMTP_USER ??
        process.env.SMTP_EMAIL ??
        process.env.GMAIL_USER ??
        "").toLowerCase().endsWith("@gmail.com")
        ? "smtp.gmail.com"
        : undefined),
    port: Number(process.env.SMTP_PORT ?? 587),
    user:
      process.env.SMTP_USER ??
      process.env.SMTP_EMAIL ??
      process.env.GMAIL_USER,
    pass:
      process.env.SMTP_PASS ??
      process.env.SMTP_PASSWORD ??
      process.env.GMAIL_APP_PASSWORD,
    secure: String(process.env.SMTP_SECURE ?? "false") === "true",
    allowDynamicFrom: String(process.env.MAIL_ALLOW_DYNAMIC_FROM ?? "false") === "true",
    fromEmail:
      process.env.MAIL_FROM_EMAIL ??
      process.env.SMTP_FROM_EMAIL ??
      process.env.SMTP_USER ??
      process.env.SMTP_EMAIL ??
      process.env.GMAIL_USER,
    fromName: process.env.MAIL_FROM_NAME ?? "AEM Systems",
    fromDomain: process.env.MAIL_FROM_DOMAIN ?? process.env.TENANT_BASE_DOMAIN ?? "localhost",
  },
  redis: {
    url: process.env.REDIS_URL,
  },
};

if (!env.db.url) {
  required("DB_HOST");
  required("DB_USER");
  required("DB_NAME");
}
