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
    const tenantId = localStorage.getItem("aem_tenant_id");
    const userRaw = localStorage.getItem("aem_user");
    const user = userRaw ? JSON.parse(userRaw) : null;
    if (!token || !tenantId) return null;
    return { token, tenantId, user };
};

export const clearAuth = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("aem_token");
    localStorage.removeItem("aem_tenant_id");
    localStorage.removeItem("aem_user");
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
