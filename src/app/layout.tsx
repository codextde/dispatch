import type { Metadata, Viewport } from "next"
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
