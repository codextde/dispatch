"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, BookUser, ListTodo } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { UserMenu, WorkspaceSwitcher } from "@/components/app/user-menu"
import { cn } from "@/lib/utils"

/**
 * Slim chrome for the Tasks and Contacts areas (outside the mail layout):
 * back to inbox, workspace switcher, area switch, page actions, user menu.
 */
export function AreaTopBar({ children }: { children?: React.ReactNode }) {
  const { org } = useOrg()
  const pathname = usePathname()
  const base = `/w/${org.slug}`
  const areas = [
    { href: `${base}/tasks`, label: "Tasks", icon: ListTodo },
    { href: `${base}/contacts`, label: "Contacts", icon: BookUser },
  ]
  return (
    <header className="safe-top sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <Link
        href={`${base}/inbox`}
        className="group flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span className="hidden sm:inline">Inbox</span>
        <span className="sr-only sm:hidden">Back to inbox</span>
      </Link>
      <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
      <WorkspaceSwitcher className="hidden max-w-56 min-w-0 md:flex" />
      <nav aria-label="Area" className="flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5 md:ml-1">
        {areas.map((a) => {
          const active = pathname.startsWith(a.href)
          return (
            <Link
              key={a.href}
              href={a.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-background text-foreground shadow-xs dark:bg-accent"
              )}
            >
              <a.icon className="size-3.5" />
              {a.label}
            </Link>
          )
        })}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {children}
        <UserMenu align="end" compact />
      </div>
    </header>
  )
}
