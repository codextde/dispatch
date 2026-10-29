"use client"

import { useState } from "react"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { I18nProvider, type Locale } from "@/lib/i18n"
import { DocumentTitle } from "@/components/app/document-title"

export function Providers({ children, nonce, locale = "en" }: { children: React.ReactNode; nonce?: string; locale?: Locale }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
        },
      })
  )
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale={locale}>
          <TooltipProvider delayDuration={300}>
            <DocumentTitle />
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
