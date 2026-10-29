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
import { useI18n } from "@/lib/i18n"

/**
 * Settings chrome: left navigation on desktop, a compact header with a page
 * picker on mobile. Nav items are filtered by the member's permissions (pages
 * enforce permissions server-side as well).
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const { org, can } = useOrg()
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const base = `/w/${org.slug}/settings`
  const groups = useMemo(() => visibleNav(can), [can])
  const itemLabel: Record<string, Parameters<typeof t>[0]> = { profile: "profile", preferences: "preferences", notifications: "notifications", security: "security", "personal-inboxes": "myInboxes", general: "general", members: "members", teams: "teams", roles: "roles", inboxes: "inboxes", labels: "labels", responses: "responses", signatures: "signatures", rules: "rules", integrations: "integrations", billing: "billing", "audit-log": "auditLog" }
  const groupLabel: Record<string, Parameters<typeof t>[0]> = { Personal: "personal", Workspace: "workspace", Productivity: "productivity", Administration: "administration" }
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
            {t("backToInbox")}
          </Link>
          <WorkspaceSwitcher className="mt-1" />
        </div>
        <nav aria-label={locale === "it" ? "Impostazioni" : "Settings"} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="px-2 pb-1.5 font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/80 uppercase">
                {t(groupLabel[g.label] ?? "workspace")}
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
                        <span className="truncate">{t(itemLabel[item.href] ?? "preferences")}</span>
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
                {t("analytics")}
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
            {t("backToInbox")}
          </Link>
          <WorkspaceSwitcher className="max-w-[55%]" />
          <UserMenu align="end" compact />
        </div>
        <Select value={activeItem?.href ?? ""} onValueChange={(v) => router.push(`${base}/${v}`)}>
          <SelectTrigger className="h-9 w-full bg-card" aria-label={t("preferences")}>
            <SelectValue placeholder={t("preferences")} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-[70dvh]">
            {groups.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel className="font-mono text-[10.5px] tracking-wider uppercase">{t(groupLabel[g.label] ?? "workspace")}</SelectLabel>
                {g.items.map((item) => (
                  <SelectItem key={item.href} value={item.href}>
                    <item.icon className="text-muted-foreground" />
                    {t(itemLabel[item.href] ?? "preferences")}
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
