import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { BadRequestError, UnauthorizedError } from "../utils/errors";
import { AppDataSource } from "../config/data-source";
import { Tenant } from "../entities/tenant.entity";

const normalizeHost = (host?: string) => {
  if (!host) return "";
  return host.split(",")[0].trim().split(":")[0].toLowerCase();
};

const extractHostnameFromUrl = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const normalizeBaseDomain = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const fromUrl = extractHostnameFromUrl(trimmed);
  if (fromUrl) return fromUrl;
  return normalizeHost(trimmed.split("/")[0]);
};

const reservedHosts = new Set(
  [
    extractHostnameFromUrl(env.apiUrl),
    extractHostnameFromUrl(env.appUrl),
    extractHostnameFromUrl(env.adminUrl),
    extractHostnameFromUrl(env.appPortalUrl),
    extractHostnameFromUrl(env.workerAppUrl),
  ].filter(Boolean),
);

const isReservedHost = (host: string) => Boolean(host && reservedHosts.has(host));
const isLocalHost = (host: string) =>
  host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
const workerAppHost = extractHostnameFromUrl(env.workerAppUrl);

const isWorkerAppRequest = (req: Request, originHost: string) => {
  if (!workerAppHost || originHost !== workerAppHost) return false;

  const requestPath = req.originalUrl.split("?")[0];
  return (
    requestPath === "/api/v1/app" ||
    requestPath.startsWith("/api/v1/app/")
  );
};

const extractSubdomain = (host: string) => {
  if (!host) return "";
  const base = normalizeBaseDomain(env.tenantBaseDomain);
  if (base) {
    if (host === base) return "";
    if (host.endsWith(`.${base}`)) {
      return host.slice(0, -(base.length + 1));
    }
    return "";
  }
  if (host.endsWith(".localhost")) {
    return host.replace(".localhost", "");
  }
  const parts = host.split(".");
  if (parts.length <= 2) return "";
  return parts.slice(0, -2).join(".");
};

const parseOriginHost = (req: Request) => {
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  return normalizeHost(
    extractHostnameFromUrl(origin) || extractHostnameFromUrl(referer),
  );
};

export const tenantMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const headerName = env.tenantHeader.toLowerCase();
    const headerTenantId = req.headers[headerName] as string | undefined;
    const subdomainHeaderName = env.tenantSubdomainHeader.toLowerCase();
    const headerSubdomain = (
      req.headers[subdomainHeaderName] as string | undefined
    )
      ?.trim()
      .toLowerCase();
    const host = normalizeHost(req.headers.host as string | undefined);
    const forwardedHost = normalizeHost(
      req.headers["x-forwarded-host"] as string | undefined,
    );
    const requestHost = forwardedHost || host;
    const requestSubdomain = extractSubdomain(requestHost);
    const originHost = parseOriginHost(req);
    const originSubdomain = extractSubdomain(originHost);
    const trustedHostSubdomain =
      requestSubdomain && !isReservedHost(requestHost) ? requestSubdomain : "";
    const trustedOriginSubdomain =
      originSubdomain && !isReservedHost(originHost) ? originSubdomain : "";

    if (
      env.nodeEnv === "production" &&
      headerSubdomain &&
      originHost &&
      isReservedHost(originHost) &&
      !isWorkerAppRequest(req, originHost)
    ) {
      throw new UnauthorizedError("Use the tenant workspace URL");
    }

    if (
      headerSubdomain &&
      trustedHostSubdomain &&
      headerSubdomain !== trustedHostSubdomain
    ) {
      throw new BadRequestError("Tenant mismatch");
    }
    if (
      headerSubdomain &&
      trustedOriginSubdomain &&
      headerSubdomain !== trustedOriginSubdomain
    ) {
      throw new BadRequestError("Tenant mismatch");
    }
    if (
      trustedHostSubdomain &&
      trustedOriginSubdomain &&
      trustedHostSubdomain !== trustedOriginSubdomain
    ) {
      throw new BadRequestError("Tenant mismatch");
    }

    let subdomainTenantId: string | undefined;
    const effectiveSubdomain =
      headerSubdomain || trustedHostSubdomain || trustedOriginSubdomain;
    if (effectiveSubdomain) {
      const tenantRepo = AppDataSource.getRepository(Tenant);
      const tenant = await tenantRepo.findOne({
        where: { subdomain: effectiveSubdomain, isDeleted: false },
      });
      if (!tenant) {
        throw new UnauthorizedError("Invalid tenant subdomain");
      }
      subdomainTenantId = tenant.id;
      req.tenantSubdomain = tenant.subdomain;
    }

    if (
      headerTenantId &&
      subdomainTenantId &&
      headerTenantId !== subdomainTenantId
    ) {
      throw new BadRequestError("Tenant mismatch");
    }
    if (
      req.tenantId &&
      subdomainTenantId &&
      req.tenantId !== subdomainTenantId
    ) {
      throw new BadRequestError("Tenant mismatch");
    }
    if (req.tenantId && headerTenantId && req.tenantId !== headerTenantId) {
      throw new BadRequestError("Tenant mismatch");
    }

    const effectiveTenantId =
      subdomainTenantId ?? headerTenantId ?? req.tenantId;
    if (!effectiveTenantId) {
      if (
        env.nodeEnv !== "production" &&
        (isLocalHost(requestHost) || isLocalHost(originHost))
      ) {
        return next();
      }
      throw new BadRequestError("Tenant context missing");
    }

    req.tenantId = effectiveTenantId;
    next();
  } catch (error) {
    console.log(error);
    next(error);
  }
};
