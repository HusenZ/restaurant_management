import type { Metadata, Viewport } from "next";
import { ThemedToaster } from "@/components/theme";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DineOS — QR ordering, payments & kitchen OS for restaurants",
    template: "%s · DineOS",
  },
  description:
    "Dine-in QR ordering with pay at table or counter, table booking with pre-order, 0% commission takeaway & delivery, kitchen display and WhatsApp invoices.",
  applicationName: "DineOS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className="h-full antialiased">
      <head>
        {/* Applies the saved light/dark preference before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg font-sans text-fg">
        {children}
        <ThemedToaster />
      </body>
    </html>
  );
}
