"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { ArrowUpRight, Check, ChevronRight, LogOut, Menu, Monitor, Moon, Settings, Sun } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { UserAvatar } from "@/components/app/user-avatar"
import { signOut } from "@/components/app/user-menu"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ADMIN_NAV, SETTINGS_SECTIONS, isActivePath } from "@/components/admin/nav"
import { cn } from "@/lib/utils"

export type AdminShellProps = {
  instanceName: string
  productName: string
  homePath: string
  user: { name: string | null; email: string; avatarUrl: string | null }
  children: React.ReactNode
}

/** Chrome of the super admin panel: sidebar (desktop), sheet navigation (mobile), top bar. */
export function AdminShell({ instanceName, productName, homePath, user, children }: AdminShellProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <SidebarContents productName={productName} homePath={homePath} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex h-12 items-center gap-2 px-3 md:px-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Admin navigation</SheetTitle>
                </SheetHeader>
                <SidebarContents productName={productName} homePath={homePath} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-medium">{instanceName}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Instance admin</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <a href={homePath}>
                  Open app <ArrowUpRight />
                </a>
              </Button>
              <AdminUserMenu user={user} homePath={homePath} />
            </div>
          </div>
        </header>

        <main className="safe-bottom min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

function SidebarContents({
  productName,
  homePath,
  onNavigate,
}: {
  productName: string
  homePath: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const settingsActive = isActivePath(pathname, "/admin/settings")
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <Link href="/admin" onClick={onNavigate} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo name={productName} markClassName="size-6" />
        </Link>
        <span className="rounded-sm border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Admin
        </span>
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-4" aria-label="Admin">
        {ADMIN_NAV.slice(0, 1).map((group) => (
          <NavGroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <NavLink key={item.href} {...item} active={isActivePath(pathname, item.href, item.exact)} onNavigate={onNavigate} />
            ))}
          </NavGroup>
        ))}

        <NavGroup label="Configuration">
          <NavLink
            href="/admin/settings/general"
            label="Settings"
            icon={Settings}
            active={settingsActive}
            onNavigate={onNavigate}
          />
          {settingsActive && (
            <ul className="mt-0.5 mb-1 ml-[18px] space-y-px border-l border-sidebar-border pl-2">
              {SETTINGS_SECTIONS.map((s) => {
                const href = `/admin/settings/${s.slug}`
                const active = isActivePath(pathname, href)
                return (
                  <li key={s.slug}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-2 py-1 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        active && "bg-sidebar-accent font-medium text-foreground"
                      )}
                    >
                      {s.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </NavGroup>

        {ADMIN_NAV.slice(1).map((group) => (
          <NavGroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <NavLink key={item.href} {...item} active={isActivePath(pathname, item.href, item.exact)} onNavigate={onNavigate} />
            ))}
          </NavGroup>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <a
          href={homePath}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowUpRight className="size-4" />
          Back to your workspace
        </a>
      </div>
    </div>
  )
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-2 pb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground/80">{label}</div>
      <ul className="space-y-px">{children}</ul>
    </div>
  )
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active && "bg-sidebar-accent font-medium text-sidebar-foreground"
        )}
      >
        <Icon className={cn("size-4 text-muted-foreground", active && "text-foreground")} />
        {label}
      </Link>
    </li>
  )
}

function AdminUserMenu({ user, homePath }: { user: AdminShellProps["user"]; homePath: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <UserAvatar name={user.name} email={user.email} src={user.avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name || "Instance owner"}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={homePath}>
            <ArrowUpRight /> Open app
          </a>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {[
              { v: "light", label: "Light", icon: Sun },
              { v: "dark", label: "Dark", icon: Moon },
              { v: "system", label: "System", icon: Monitor },
            ].map((t) => (
              <DropdownMenuItem key={t.v} onClick={() => setTheme(t.v)}>
                <t.icon /> {t.label}
                {theme === t.v && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} variant="destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
