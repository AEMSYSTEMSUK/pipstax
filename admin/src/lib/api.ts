export type ApiResult<T> = {
    success: boolean;
    data: T;
    message?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

import { startLoading, stopLoading } from "@/lib/loading";

const getAuthHeaders = (path: string) => {
    if (typeof window === "undefined") {
        return {} as Record<string, string>;
    }
    const isPlatform = path.startsWith("/platform") || path.startsWith("/platform-auth");
    const token = isPlatform ? localStorage.getItem("aem_platform_token") : localStorage.getItem("aem_token");
    const tenantId = localStorage.getItem("aem_tenant_id");
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    if (!isPlatform && tenantId) {
        headers["X-Tenant-Id"] = tenantId;
    }
    return headers;
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    if (typeof window !== "undefined") {
        startLoading();
    }
    const headers = {
        ...(options.headers ?? {}),
        ...getAuthHeaders(path)
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

export const apiPost = async <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined
    });

export const apiPut = async <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
        method: "PUT",
        body: body ? JSON.stringify(body) : undefined
    });

export const apiDelete = async <T>(path: string) =>
    apiRequest<T>(path, { method: "DELETE" });

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
