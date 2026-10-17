import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const APP_URL = process.env.APP_URL || "https://emailto.chat";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "emailto.chat — Your email. Now a conversation.",
    template: "%s · emailto.chat",
  },
  description:
    "Turn your Gmail into a chat app. People first. Threads second. Messages naturally. A person-first Gmail client with chat bubbles, topic tabs and every shared file in one place.",
  applicationName: "emailto.chat",
  keywords: ["Gmail client", "email as chat", "messenger for email", "email app", "PWA"],
  appleWebApp: { capable: true, title: "emailto.chat", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "emailto.chat",
    title: "emailto.chat — Your email. Now a conversation.",
    description: "Turn your Gmail into a chat app. People first. Threads second. Messages naturally.",
  },
  twitter: {
    card: "summary_large_image",
    title: "emailto.chat — Your email. Now a conversation.",
    description: "Turn your Gmail into a chat app. People first. Threads second. Messages naturally.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
  ],
};

// Applies the saved theme before first paint (no flash). Static string, no user input.
const themeScript = `(function(){try{var t=localStorage.getItem('etc:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
