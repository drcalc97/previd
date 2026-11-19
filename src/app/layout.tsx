import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PreVid", template: "%s · PreVid" },
  description: "Preoperative assessment video review (synthetic-data development build)",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">
          Skip to main content
        </a>
        <div role="note" className="bg-amber-200 px-3 py-1.5 text-center text-sm font-semibold text-amber-950">
          DEVELOPMENT BUILD — SYNTHETIC DATA ONLY. Do not enter real patient information.
        </div>
        {children}
      </body>
    </html>
  );
}
