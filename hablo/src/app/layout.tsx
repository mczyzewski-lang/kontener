import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: { default: "Hablo", template: "%s · Hablo" },
  description: "Twój prywatny nauczyciel hiszpańskiego.",
  applicationName: "Hablo",
  appleWebApp: { capable: true, title: "Hablo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.png", apple: "/apple-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafaf8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-dvh">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
