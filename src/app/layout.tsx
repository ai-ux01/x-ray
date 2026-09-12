import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WebsiteX-Ray — Know exactly what's holding your website back",
  description:
    "AI-powered website auditing for performance, UX, SEO, accessibility, conversion and technical quality.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "WebsiteX-Ray",
    description:
      "AI-powered website auditing for performance, UX, SEO, accessibility, conversion and technical quality.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Default to dark statically on the server so the common case never
    // flashes. ThemeProvider reconciles to the user's stored/system choice on
    // mount. We avoid an inline <script> here because React 19 emits a dev
    // warning for any <script> element rendered in the component tree.
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>
      </body>
    </html>
  );
}
