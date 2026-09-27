"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMemo } from "react"
import { ArrowLeft, ChartNoAxesColumn } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { UserMenu, WorkspaceSwitcher } from "@/components/app/user-menu"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { visibleNav } from "@/components/settings/nav"
import { cn } from "@/lib/utils"

/**
 * Settings chrome: left navigation on desktop, a compact header with a page
 * picker on mobile. Nav items are filtered by the member's permissions (pages
 * enforce permissions server-side as well).
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const { org, can } = useOrg()
  const pathname = usePathname()
  const router = useRouter()
  const base = `/w/${org.slug}/settings`
  const groups = useMemo(() => visibleNav(can), [can])
  const active = pathname.startsWith(base + "/") ? pathname.slice(base.length + 1).split("/")[0] : ""
  const activeItem = groups.flatMap((g) => g.items).find((i) => i.href === active)

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex flex-col gap-1 px-3 pt-3 pb-2">
          <Link
            href={`/w/${org.slug}/inbox`}
            className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to inbox
          </Link>
          <WorkspaceSwitcher className="mt-1" />
        </div>
        <nav aria-label="Settings" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="px-2 pb-1.5 font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/80 uppercase">
                {g.label}
              </div>
              <ul className="flex flex-col gap-px">
                {g.items.map((item) => {
                  const isActive = item.href === active
                  return (
                    <li key={item.href}>
                      <Link
                        href={`${base}/${item.href}`}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring",
                          isActive && "bg-sidebar-accent font-medium text-sidebar-foreground"
                        )}
                      >
                        <item.icon className={cn("size-4 shrink-0 text-muted-foreground", isActive && "text-foreground")} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {can("analytics.view") && (
            <div className="border-t pt-3">
              <Link
                href={`/w/${org.slug}/analytics`}
                className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChartNoAxesColumn className="size-4 shrink-0 text-muted-foreground" />
                Analytics
              </Link>
            </div>
          )}
        </nav>
        <div className="border-t p-2">
          <UserMenu align="start" />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="safe-top sticky top-0 z-20 flex shrink-0 flex-col gap-2 border-b bg-background/95 px-3 pt-2 pb-2.5 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/w/${org.slug}/inbox`}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Inbox
          </Link>
          <WorkspaceSwitcher className="max-w-[55%]" />
          <UserMenu align="end" compact />
        </div>
        <Select value={activeItem?.href ?? ""} onValueChange={(v) => router.push(`${base}/${v}`)}>
          <SelectTrigger className="h-9 w-full bg-card" aria-label="Settings page">
            <SelectValue placeholder="Settings" />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-[70dvh]">
            {groups.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel className="font-mono text-[10.5px] tracking-wider uppercase">{g.label}</SelectLabel>
                {g.items.map((item) => (
                  <SelectItem key={item.href} value={item.href}>
                    <item.icon className="text-muted-foreground" />
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </header>

      <main id="settings-main" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
