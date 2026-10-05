import { ArrowUpRight, BriefcaseBusiness, ChartNoAxesCombined, MapPinned, ShieldCheck } from "lucide-react";

export default function RootPage() {
    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f2f7f6] text-slate-900">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_16%,rgba(14,133,133,0.18),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(255,194,103,0.18),transparent_28%),radial-gradient(circle_at_75%_86%,rgba(94,196,172,0.2),transparent_31%)]" />
            <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(#0f3f46_1px,transparent_1px),linear-gradient(90deg,#0f3f46_1px,transparent_1px)] [background-size:42px_42px]" />

            <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-14">
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-sm font-extrabold tracking-tight text-white shadow-[0_12px_35px_rgba(14,133,133,0.25)]">
                            PS
                        </div>
                        <div>
                            <p className="text-lg font-extrabold tracking-tight">Pipstack</p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Operations connected</p>
                        </div>
                    </div>
                    <span className="hidden rounded-full border border-white/80 bg-white/65 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur sm:inline-flex">
                        Secure workspace platform
                    </span>
                </header>

                <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-20">
                    <div className="max-w-3xl">
                        <p className="mb-5 inline-flex rounded-full border border-primary/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.19em] text-primary shadow-sm backdrop-blur">
                            One connected operating system
                        </p>
                        <h1 className="max-w-2xl text-5xl font-extrabold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                            Keep every job moving, from first call to final sign-off.
                        </h1>
                        <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                            Pipstack brings customers, sites, sales, scheduling, field work, finance, and compliance into one clear operational flow.
                        </p>
                        <div className="mt-9 rounded-2xl border border-white/90 bg-white/65 p-4 shadow-sm backdrop-blur sm:inline-flex sm:items-center sm:gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div className="mt-3 sm:mt-0">
                                <p className="text-sm font-bold">Already part of a workspace?</p>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500">Use the dedicated company URL supplied by your administrator.</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-primary/15 via-white/20 to-amber-200/20 blur-2xl" />
                        <div className="relative rounded-[2rem] border border-white/90 bg-white/75 p-5 shadow-[0_30px_90px_rgba(23,58,65,0.14)] backdrop-blur-xl sm:p-7">
                            <div className="flex items-center justify-between border-b border-slate-200/80 pb-5">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Operational clarity</p>
                                    <p className="mt-1 text-xl font-bold">One view across the business</p>
                                </div>
                                <ArrowUpRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
                            </div>
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                {[
                                    { icon: BriefcaseBusiness, title: "Sales to jobs", copy: "Carry context forward without duplicate entry." },
                                    { icon: MapPinned, title: "Sites and teams", copy: "Know where work happens and who owns it." },
                                    { icon: ChartNoAxesCombined, title: "Finance visibility", copy: "Track quotes, invoices, payments, and WIP." },
                                    { icon: ShieldCheck, title: "Compliance ready", copy: "Review reports, certificates, and renewals." },
                                ].map(({ icon: Icon, title, copy }) => (
                                    <article key={title} className="rounded-2xl border border-slate-200/70 bg-white/75 p-4">
                                        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                                        <h2 className="mt-4 text-sm font-bold">{title}</h2>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">{copy}</p>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <footer className="flex flex-col gap-2 border-t border-slate-300/60 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>&copy; {new Date().getFullYear()} Pipstack. All rights reserved.</span>
                    <span>Built for teams who need work to stay accountable.</span>
                </footer>
            </div>
        </main>
    );
}
