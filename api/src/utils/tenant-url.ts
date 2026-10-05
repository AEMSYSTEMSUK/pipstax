import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { Tenant } from '../entities/tenant.entity';

const parseBase = () => {
  const appUrl = new URL(env.appUrl ?? 'http://127.0.0.1:3000');
  const rawBase = String(env.tenantBaseDomain ?? appUrl.host).trim();
  const parsedBase = new URL(rawBase.includes('://') ? rawBase : `${appUrl.protocol}//${rawBase}`);
  return {
    protocol: appUrl.protocol,
    hostname: parsedBase.hostname,
    port: parsedBase.port || appUrl.port,
  };
};

const normalizePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

export const buildTenantAppBaseUrl = (subdomain?: string | null) => {
  const base = parseBase();
  const normalizedSubdomain = String(subdomain ?? '').trim().toLowerCase();
  const hostname = normalizedSubdomain
    ? `${normalizedSubdomain}.${base.hostname}`
    : base.hostname;
  return `${base.protocol}//${hostname}${base.port ? `:${base.port}` : ''}`;
};

export const buildTenantAppUrl = (subdomain: string | null | undefined, path = '/') =>
  `${buildTenantAppBaseUrl(subdomain)}${normalizePath(path)}`;

export const resolveTenantAppBaseUrl = async (tenantId: string) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
    select: ['id', 'subdomain'],
  });
  return buildTenantAppBaseUrl(tenant?.subdomain);
};

export const resolveTenantAppUrl = async (tenantId: string, path = '/') => {
  const base = await resolveTenantAppBaseUrl(tenantId);
  return `${base}${normalizePath(path)}`;
};

