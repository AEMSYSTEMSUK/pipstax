export type AuthPayload = {
    token: string;
    tenantId: string;
    user?: {
        id: string;
        fullName?: string;
        email?: string;
        roles?: Array<{ code: string }>;
    };
};

export type AccountAuthPayload = {
    token: string;
    workspaces?: Array<{
        tenantId: string;
        subdomain?: string;
        tradingName?: string;
        logoUrl?: string;
        primaryColor?: string;
        roles?: string[];
    }>;
};

type JwtPayload = {
    userId?: string;
    tenantId?: string;
    roles?: string[];
    exp?: number;
};

const parseJwt = (token: string): JwtPayload | null => {
    try {
        const base64 = token.split(".")[1];
        if (!base64) return null;
        const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(json) as JwtPayload;
    } catch {
        return null;
    }
};

export const setAuth = (payload: AuthPayload) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aem_token", payload.token);
    localStorage.setItem("aem_tenant_id", payload.tenantId);
    if (payload.user) {
        localStorage.setItem("aem_user", JSON.stringify(payload.user));
    }
};

export const getAuth = () => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("aem_token");
    const tenantIdRaw = localStorage.getItem("aem_tenant_id");
    const userRaw = localStorage.getItem("aem_user");
    const user = userRaw ? JSON.parse(userRaw) : null;
    if (!token) return null;

    const decoded = parseJwt(token);
    const tenantId = tenantIdRaw ?? decoded?.tenantId ?? null;
    if (!tenantId) return null;

    const roles = user?.roles ?? (decoded?.roles ? decoded.roles.map((code) => ({ code })) : undefined);
    const hydratedUser = user ?? (decoded?.userId ? { id: decoded.userId, roles } : null);
    if (hydratedUser && roles && !hydratedUser.roles) {
        hydratedUser.roles = roles;
    }

    return { token, tenantId, user: hydratedUser };
};

export const clearAuth = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("aem_token");
    localStorage.removeItem("aem_tenant_id");
    localStorage.removeItem("aem_user");
    localStorage.removeItem("aem_permissions");
};

export const setEffectivePermissions = (permissions: Record<string, boolean>) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aem_permissions", JSON.stringify(permissions));
};

export const getEffectivePermissions = () => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("aem_permissions");
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
};

export const setAccountAuth = (payload: AccountAuthPayload) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aem_account_token", payload.token);
    if (payload.workspaces) {
        localStorage.setItem("aem_workspaces", JSON.stringify(payload.workspaces));
    }
};

export const getAccountAuth = () => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("aem_account_token");
    const workspacesRaw = localStorage.getItem("aem_workspaces");
    const workspaces = workspacesRaw ? JSON.parse(workspacesRaw) : null;
    if (!token) return null;
    return { token, workspaces };
};

export const clearAccountAuth = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("aem_account_token");
    localStorage.removeItem("aem_workspaces");
};

export type CustomerAccountAuthPayload = {
    token: string;
    workspaces?: Array<{
        tenantId: string;
        subdomain?: string;
        tradingName?: string;
        logoUrl?: string;
        primaryColor?: string;
        customerName?: string;
    }>;
};

export const setCustomerAccountAuth = (payload: CustomerAccountAuthPayload) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aem_customer_token", payload.token);
    if (payload.workspaces) {
        localStorage.setItem("aem_customer_workspaces", JSON.stringify(payload.workspaces));
    }
};

export const getCustomerAccountAuth = () => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("aem_customer_token");
    const workspacesRaw = localStorage.getItem("aem_customer_workspaces");
    const workspaces = workspacesRaw ? JSON.parse(workspacesRaw) : null;
    if (!token) return null;
    return { token, workspaces };
};

export const clearCustomerAccountAuth = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("aem_customer_token");
    localStorage.removeItem("aem_customer_workspaces");
};

export type PlatformAuthPayload = {
    token: string;
    admin?: {
        id: string;
        fullName?: string;
        email?: string;
        roles?: Array<{ code: string }>;
    };
};

export const setPlatformAuth = (payload: PlatformAuthPayload) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aem_platform_token", payload.token);
    if (payload.admin) {
        localStorage.setItem("aem_platform_admin", JSON.stringify(payload.admin));
    }
};

export const getPlatformAuth = () => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("aem_platform_token");
    const adminRaw = localStorage.getItem("aem_platform_admin");
    const admin = adminRaw ? JSON.parse(adminRaw) : null;
    if (!token) return null;
    return { token, admin };
};

export const clearPlatformAuth = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("aem_platform_token");
    localStorage.removeItem("aem_platform_admin");
};

export const setPortalToken = (token: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aem_portal_token", token);
};

export const getPortalToken = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("aem_portal_token");
};

export const clearPortalToken = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("aem_portal_token");
    localStorage.removeItem("aem_portal_customer_name");
    localStorage.removeItem("aem_portal_customer_email");
};
