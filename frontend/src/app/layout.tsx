import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { LoadingProvider } from "@/components/shared/LoadingProvider";
import { WorkspaceUnavailable } from "@/components/shared/WorkspaceUnavailable";
import { classifyAppHost } from "@/lib/host";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pipstack | Connected operations, clearer work",
  description: "A connected operations platform for sales, customers, jobs, field teams, finance, and compliance.",
};

const resolveWorkspaceAccess = async () => {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const appHost = classifyAppHost(host, process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN);

  if (appHost.kind === "root" || appHost.kind === "local") {
    return { allowed: true as const };
  }
  if (appHost.kind !== "tenant") {
    return { allowed: false as const, serviceUnavailable: false };
  }

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5000/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${apiBase}/public/tenant/${encodeURIComponent(appHost.subdomain)}`, {
      cache: "no-store",
    });
    return response.ok
      ? { allowed: true as const }
      : { allowed: false as const, serviceUnavailable: response.status >= 500 };
  } catch {
    return { allowed: false as const, serviceUnavailable: true };
  }
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workspaceAccess = await resolveWorkspaceAccess();

  return (
    <html lang="en">
      <body className={`${plusJakartaSans.variable} font-sans antialiased text-foreground bg-background`}>
        <ToastProvider>
          <TooltipProvider>
            <LoadingProvider>
              {workspaceAccess.allowed
                ? children
                : <WorkspaceUnavailable serviceUnavailable={workspaceAccess.serviceUnavailable} />}
            </LoadingProvider>
          </TooltipProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
