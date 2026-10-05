"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SignInPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace("/common-login")
    }, [router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-sm text-muted-foreground">Redirecting to sign in...</div>
        </div>
    )
}
