"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Plus, Settings, Shield, Sun, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useOrg } from "@/components/app/org-provider"
import { UserAvatar } from "@/components/app/user-avatar"
import { cn } from "@/lib/utils"

/** Sign out via POST (CSRF-safe). */
export function signOut() {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = "/auth/logout"
  document.body.appendChild(form)
  form.submit()
}

/** Avatar dropdown: profile, settings, theme, super admin, sign out. */
export function UserMenu({ align = "start", compact = false, className }: { align?: "start" | "end"; compact?: boolean; className?: string }) {
  const { user, org, can } = useOrg()
  const { theme, setTheme } = useTheme()
  const base = `/w/${org.slug}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md p-1 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <UserAvatar name={user.name} email={user.email} src={user.avatarUrl} size="sm" />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name || user.email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name || "Your account"}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`${base}/settings/profile`}>
              <User /> Profile & preferences
            </Link>
          </DropdownMenuItem>
          {(can("settings.manage") || can("members.manage") || can("inboxes.manage")) && (
            <DropdownMenuItem asChild>
              <Link href={`${base}/settings`}>
                <Settings /> Workspace settings
              </Link>
            </DropdownMenuItem>
          )}
          {user.isSuperAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield /> Instance admin
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
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

/** Workspace switcher (name + chevron) listing all workspaces of the user. */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const { org, workspaces, productName } = useOrg()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-semibold text-background"
          aria-hidden
        >
          {org.logoUrl ? <img src={org.logoUrl} alt="" className="size-6 rounded-md object-cover" /> : org.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{org.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <a href={`/w/${w.slug}/inbox`}>
              <span className="flex size-5 items-center justify-center rounded bg-foreground text-[10px] font-semibold text-background">
                {w.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{w.name}</span>
              {w.slug === org.slug && <Check className="ml-auto" />}
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <Plus /> Create workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{productName}</DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
