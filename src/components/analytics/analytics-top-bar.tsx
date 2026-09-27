"use client"

import Link from "next/link"
import { ArrowLeft, ChartNoAxesColumn, Settings } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { UserMenu, WorkspaceSwitcher } from "@/components/app/user-menu"
import { Button } from "@/components/ui/button"

/** Slim chrome for the analytics area (no mail sidebar here). */
export function AnalyticsTopBar() {
  const { org } = useOrg()
  const base = `/w/${org.slug}`
  return (
    <header className="safe-top sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <Link
        href={`${base}/inbox`}
        className="group flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span className="hidden sm:inline">Back to inbox</span>
        <span className="sm:hidden">Inbox</span>
      </Link>
      <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
      <WorkspaceSwitcher className="max-w-[45%] min-w-0 sm:max-w-56" />
      <span className="hidden items-center gap-1.5 text-[13px] font-medium text-muted-foreground md:flex">
        <span className="text-border">/</span>
        <ChartNoAxesColumn className="size-3.5" />
        Analytics
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href={`${base}/settings`}>
            <Settings />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </Button>
        <UserMenu align="end" compact />
      </div>
    </header>
  )
}
