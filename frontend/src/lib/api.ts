import { startLoading, stopLoading } from "@/lib/loading";
import { getTenantSubdomain } from "@/lib/tenant-domain";
import { getEffectivePermissions } from "@/lib/auth";

export type ApiResult<T> = {
    success: boolean;
    data: T;
    message?: string;
};

export class DeleteCancelledError extends Error {
    constructor() {
        super("Delete cancelled");
        this.name = "DeleteCancelledError";
    }
}

export const isDeleteCancelled = (error: unknown) =>
    error instanceof DeleteCancelledError ||
    (typeof error === "object" && error !== null && (error as { name?: string }).name === "DeleteCancelledError");

type ApiDeleteOptions = {
    confirmed?: boolean;
    confirmMessage?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";
const TENANT_BASE_DOMAIN = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "";

const getLookupTypeFromRequest = (path: string, body?: BodyInit | null) => {
    try {
        const query = path.includes("?") ? new URLSearchParams(path.split("?")[1]) : null;
        const fromQuery = query?.get("type");
        if (fromQuery) return fromQuery.trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (typeof body === "string") {
            const parsed = JSON.parse(body) as { type?: unknown };
            return String(parsed.type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
        }
    } catch {
        return "";
    }
    return "";
};

const getAuthHeaders = (path: string) => {
    if (typeof window === "undefined") {
        return {} as Record<string, string>;
    }
    const isPlatform = path.startsWith("/platform") || path.startsWith("/platform-auth");
    const isCustomerPortal = path.startsWith("/portal/");
    const isCustomerAuthProtected =
        path.startsWith("/customer-auth/") &&
        !path.startsWith("/customer-auth/login") &&
        !path.startsWith("/customer-auth/forgot-password") &&
        !path.startsWith("/customer-auth/reset-password");
    const token = isPlatform
        ? localStorage.getItem("aem_platform_token")
        : isCustomerPortal || isCustomerAuthProtected
            ? localStorage.getItem("aem_customer_token")
            : localStorage.getItem("aem_token");
    const tenantId = localStorage.getItem("aem_tenant_id");
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    if (!isPlatform && !isCustomerPortal && tenantId) {
        headers["X-Tenant-Id"] = tenantId;
    }
    if (!isPlatform) {
        const subdomain = getTenantSubdomain(window.location.hostname, TENANT_BASE_DOMAIN);
        if (subdomain) {
            headers["X-Tenant-Subdomain"] = subdomain;
        }
    }
    return headers;
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    if (typeof window !== "undefined") {
        startLoading();
    }
    const method = (options.method ?? "GET").toUpperCase()
    const isPlatform = path.startsWith("/platform") || path.startsWith("/platform-auth")
    const isAuth = path.startsWith("/auth") || path.startsWith("/app/auth") || path.startsWith("/public") || path.startsWith("/customer-auth") || path.startsWith("/customer-invites")
    if (typeof window !== "undefined" && !isPlatform && !isAuth && method !== "GET") {
        if (!path.startsWith("/users/change-password")) {
            const permissions = getEffectivePermissions() ?? {}
            if (path.startsWith("/lookups")) {
                const lookupType = getLookupTypeFromRequest(path, options.body)
                const allowed =
                    lookupType === "compliance_report_type"
                        ? permissions["reports.manage"] || permissions["crm.manage"]
                        : permissions["crm.manage"]
                if (!allowed) {
                    throw new Error("Insufficient permissions")
                }
            } else {
            const permissionMap: Array<{ prefix: string; permission: string }> = [
                { prefix: "/leads", permission: "crm.manage" },
                { prefix: "/jobs", permission: "scheduling.manage" },
                { prefix: "/planner-notes", permission: "scheduling.manage" },
            { prefix: "/compliance", permission: "reports.manage" },
            { prefix: "/contractors", permission: "subcontractors.manage" },
            { prefix: "/quotes", permission: "quotes.manage" },
            { prefix: "/invoices", permission: "financials.manage" },
            { prefix: "/documents", permission: "documents.manage" },
            { prefix: "/tickets", permission: "support.manage" },
            { prefix: "/timesheets", permission: "hr.manage" },
            { prefix: "/settings", permission: "settings.manage" },
            { prefix: "/users", permission: "team.manage" },
            { prefix: "/customers", permission: "crm.manage" },
            { prefix: "/lookups", permission: "crm.manage" },
            { prefix: "/uploads", permission: "documents.manage" }
        ]
            const match = permissionMap.find((entry) => path.startsWith(entry.prefix))
            if (match && !permissions[match.permission]) {
                throw new Error("Insufficient permissions")
            }
            }
        }
    }
    const headers = {
        ...getAuthHeaders(path),
        ...(options.headers ?? {})
    } as Record<string, string>;

    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        const text = await response.text();
        const payload = text ? (JSON.parse(text) as ApiResult<T>) : null;

        if (!response.ok) {
            const message = payload?.message ?? `Request failed (${response.status})`;
            throw new Error(message);
        }

        return payload as ApiResult<T>;
    } finally {
        if (typeof window !== "undefined") {
            stopLoading();
        }
    }
};

export const apiGet = async <T>(path: string) => apiRequest<T>(path);

export const apiPost = async <T>(path: string, body?: unknown, options: RequestInit = {}) =>
    apiRequest<T>(path, {
        method: "POST",
        body:
            body instanceof FormData
                ? body
                : body
                    ? JSON.stringify(body)
                    : undefined,
        ...options
    });

export const apiPut = async <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
        method: "PUT",
        body:
            body instanceof FormData
                ? body
                : body
                    ? JSON.stringify(body)
                    : undefined
    });

export const apiDelete = async <T>(path: string, options: ApiDeleteOptions = {}) => {
    if (typeof window !== "undefined" && !options.confirmed) {
        const confirmed = window.confirm(
            options.confirmMessage ?? "Are you sure you want to delete this item? This action cannot be undone."
        );
        if (!confirmed) {
            throw new DeleteCancelledError();
        }
    }
    return apiRequest<T>(path, { method: "DELETE" });
};

export const uploadWithProgress = <T>(
    path: string,
    formData: FormData,
    onProgress?: (percent: number | null) => void,
) =>
    new Promise<ApiResult<T>>((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("Upload is only available in browser context"));
            return;
        }
        startLoading();
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}${path}`);

        const headers = getAuthHeaders(path);
        Object.entries(headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
        });

        xhr.upload.onprogress = (event) => {
            if (!onProgress) return;
            if (!event.lengthComputable || event.total <= 0) {
                onProgress(null);
                return;
            }
            const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
            onProgress(percent);
        };

        xhr.onload = () => {
            stopLoading();
            try {
                onProgress?.(100);
                const text = xhr.responseText;
                const payload = text ? (JSON.parse(text) as ApiResult<T>) : null;
                if (xhr.status >= 200 && xhr.status < 300 && payload) {
                    resolve(payload);
                    return;
                }
                const message = payload?.message ?? `Request failed (${xhr.status})`;
                reject(new Error(message));
            } catch {
                reject(new Error("Unable to parse upload response"));
            }
        };

        xhr.onerror = () => {
            stopLoading();
            reject(new Error("Upload failed"));
        };

        xhr.onabort = () => {
            stopLoading();
            reject(new Error("Upload aborted"));
        };

        xhr.send(formData);
    });

export const downloadFile = async (path: string) => {
    if (typeof window !== "undefined") {
        startLoading();
    }
    const headers = {
        ...getAuthHeaders(path)
    } as Record<string, string>;

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            headers
        });
        if (!response.ok) {
            throw new Error(`Download failed (${response.status})`);
        }
        return response.blob();
    } finally {
        if (typeof window !== "undefined") {
            stopLoading();
        }
    }
};
