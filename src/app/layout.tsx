import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import { getAppUrl } from "@/server/env"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(getAppUrl()),
    title: {
      default: "Dispatch — The open-source collaborative inbox for teams",
      template: "%s · Dispatch",
    },
    description:
      "Shared inboxes, internal comments, assignments and automation on top of Gmail, Outlook or any IMAP mailbox. Open source, self-hostable, or hosted for $50/month.",
    applicationName: "Dispatch",
    openGraph: { type: "website", siteName: "Dispatch" },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: "Dispatch", statusBarStyle: "default" },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F5" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request CSP nonce from src/proxy.ts (also makes every page dynamic, which nonces require)
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  )
}
