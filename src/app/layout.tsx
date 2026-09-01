import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider, THEME_SCRIPT } from "@/components/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: { default: "Furnace", template: "%s · Furnace" },
  description: "A personal CRM for tasks, meetings and the people behind them.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101010" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — no white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${jetbrains.variable} antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className:
                "!rounded-lg !border-0 !bg-[var(--bg)] !text-[var(--fg-body)] " +
                "!shadow-[inset_0_0_0_1px_var(--stroke),var(--shadow-layer-3),var(--shadow-layer-4)] " +
                "!text-[13px] !font-medium",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
