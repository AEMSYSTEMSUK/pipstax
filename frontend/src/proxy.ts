import { NextRequest, NextResponse } from "next/server"
import { classifyAppHost } from "@/lib/host"

const BASE_DOMAIN = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? ""

export function proxy(request: NextRequest) {
    const forwardedHost = request.headers.get("x-forwarded-host")
    const publicHost = (forwardedHost ?? request.headers.get("host") ?? "").split(",")[0]?.trim()
    const appHost = classifyAppHost(publicHost, BASE_DOMAIN)
    const { pathname } = request.nextUrl
    const redirectTo = (targetPath: string) => {
        const target = request.nextUrl.clone()
        const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
        const publicProtocol = forwardedProtocol || target.protocol.replace(":", "")
        if (publicHost) {
            const publicOrigin = new URL(`${publicProtocol}://${publicHost}`)
            target.hostname = publicOrigin.hostname
            target.port = publicOrigin.port
        }
        target.protocol = `${publicProtocol}:`
        target.pathname = targetPath
        target.search = ""
        return NextResponse.redirect(target)
    }

    if (appHost.kind === "local") {
        return NextResponse.next()
    }

    if (appHost.kind === "root") {
        if (pathname === "/") {
            return NextResponse.next()
        }
        return redirectTo("/")
    }

    if (appHost.kind === "tenant" && pathname === "/") {
        return redirectTo("/common-login")
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)"],
}
