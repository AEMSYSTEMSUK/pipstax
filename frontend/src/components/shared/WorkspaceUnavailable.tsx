import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react"

type WorkspaceUnavailableProps = {
    serviceUnavailable?: boolean
}

export function WorkspaceUnavailable({ serviceUnavailable = false }: WorkspaceUnavailableProps) {
    const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "aemproject.co.uk"
    const rootUrl = baseDomain.includes("://") ? baseDomain : `https://${baseDomain}`

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f2f7f6] px-5 py-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(14,133,133,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(94,196,172,0.18),transparent_32%)]" />
            <section className="relative w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/80 p-8 text-center shadow-[0_28px_90px_rgba(15,52,58,0.12)] backdrop-blur-xl sm:p-11">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                    <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                </div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-primary">Pipstack workspace</p>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    {serviceUnavailable ? "Workspace service unavailable" : "Workspace unavailable"}
                </h1>
                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
                    {serviceUnavailable
                        ? "We could not verify this workspace right now. Please try again shortly."
                        : "This workspace address is not recognised or is no longer active. Check the URL or contact your workspace administrator."}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <a
                        href={rootUrl}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Visit Pipstack
                    </a>
                    <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm text-slate-600">
                        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                        Secure tenant access
                    </span>
                </div>
            </section>
        </main>
    )
}
