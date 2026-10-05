"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { getAuth, setAuth, setEffectivePermissions } from "@/lib/auth"

type JwtPayload = {
    userId?: string
    roles?: string[]
}

const resolveLanding = () => "/admin/dashboard"
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1"

export default function OnboardingComplete() {
    const params = useSearchParams()
    const router = useRouter()

    useEffect(() => {
        const run = async () => {
            const token = params.get("token")
            const tenantId = params.get("tenantId")
            if (!token || !tenantId) {
                router.replace("/common-login")
                return
            }
            let user: any
            try {
                const base64 = token.split(".")[1]
                const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"))
                const payload = JSON.parse(json) as JwtPayload
                if (payload.userId) {
                    user = {
                        id: payload.userId,
                        roles: payload.roles?.map((code) => ({ code })) ?? []
                    }
                }
            } catch {
                // ignore parsing errors
            }
            if (user) {
                try {
                    const res = await fetch(`${API_BASE}/users/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    if (res.ok) {
                        const payload = await res.json()
                        const details = payload?.data
                        if (details?.fullName || details?.email) {
                            user.fullName = details.fullName
                            user.email = details.email
                        }
                    }
                } catch {
                    // ignore
                }
            }
            setAuth({ token, tenantId, user })
            window.location.href = resolveLanding()
        }
        run()
            .then(async () => {
                const stored = getAuth()
                if (!stored?.user?.fullName || !stored?.user?.email) {
                    try {
                        const res = await fetch(`${API_BASE}/users/me`, {
                            headers: { Authorization: `Bearer ${params.get("token") ?? ""}` }
                        })
                        if (res.ok) {
                            const payload = await res.json()
                            const details = payload?.data
                    if (details?.fullName || details?.email) {
                        setAuth({
                            token: params.get("token") ?? "",
                            tenantId: params.get("tenantId") ?? "",
                            user: {
                                id: details.id,
                                fullName: details.fullName,
                                email: details.email,
                                roles: details.roles ?? []
                            }
                        })
                        if (details?.effectivePermissions) {
                            setEffectivePermissions(details.effectivePermissions)
                        }
                    }
                        }
                    } catch {
                        // ignore
                    }
                }
            })
            .catch(() => {
                // ignore
            })
    }, [params, router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-sm text-muted-foreground">Finalizing your workspace...</div>
        </div>
    )
}
