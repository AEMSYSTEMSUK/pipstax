import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { LoadingProvider } from "@/components/shared/LoadingProvider";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AEM Systems Platform",
  description: "Modular CRM Platform for AEM Systems",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plusJakartaSans.variable} font-sans antialiased text-foreground bg-background`}>
        <ToastProvider>
          <TooltipProvider>
            <LoadingProvider>
              {children}
            </LoadingProvider>
          </TooltipProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
