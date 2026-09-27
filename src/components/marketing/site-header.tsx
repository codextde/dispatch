"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { NavigationMenu as NM } from "radix-ui"
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, Star } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { APP_ENTRY, GITHUB_URL } from "@/content/marketing/site"
import { cn } from "@/lib/utils"
import type { NavGroup, NavLink } from "./nav"
import { buttonClasses, GitHubMark } from "./primitives"

type Props = {
  groups: NavGroup[]
  pricing: NavLink
  signedIn: boolean
  stars: string | null
}

export function SiteHeader({ groups, pricing, signedIn, stars }: Props) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300",
        scrolled
          ? "border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-background"
      )}
    >
      <div className="rails flex h-16 items-center gap-3 px-5 sm:px-8 lg:px-6">
        <Link
          href="/"
          aria-label="Dispatch home"
          className="-m-1 rounded-[6px] p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Logo />
        </Link>

        <NM.Root className="relative hidden flex-1 justify-center lg:flex" delayDuration={60} aria-label="Main">
          <NM.List className="flex items-center gap-0.5">
            {groups.map((g) => (
              <NM.Item key={g.label} value={g.label}>
                <NM.Trigger className={navItemCls}>
                  {g.label}
                  <ChevronDown
                    aria-hidden
                    className="size-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                  />
                </NM.Trigger>
                <NM.Content className="top-0 left-0 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-24 data-[motion=from-start]:slide-in-from-left-24 data-[motion=to-end]:slide-out-to-right-24 data-[motion=to-start]:slide-out-to-left-24 md:absolute md:w-auto">
                  <MegaPanel group={g} />
                </NM.Content>
              </NM.Item>
            ))}
            <NM.Item>
              <NM.Link asChild>
                <Link href={pricing.href} className={navItemCls}>
                  {pricing.title}
                </Link>
              </NM.Link>
            </NM.Item>
          </NM.List>
          <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2">
            <NM.Viewport className="relative h-(--radix-navigation-menu-viewport-height) w-(--radix-navigation-menu-viewport-width) origin-top overflow-hidden rounded-[10px] border border-border bg-popover text-popover-foreground shadow-[0_28px_70px_-24px_rgba(0,0,0,0.28)] transition-[width,height] duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95" />
          </div>
        </NM.Root>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <GitHubButton stars={stars} className="hidden sm:inline-flex" />
          {!signedIn && (
            <Link href={APP_ENTRY} className={buttonClasses({ variant: "ghost", size: "sm", className: "hidden md:inline-flex" })}>
              Sign in
            </Link>
          )}
          <Link href={APP_ENTRY} className={buttonClasses({ variant: "primary", size: "sm" })}>
            {signedIn ? "Open app" : "Start free"}
          </Link>
          <MobileMenu groups={groups} pricing={pricing} signedIn={signedIn} stars={stars} />
        </div>
      </div>
    </header>
  )
}

const navItemCls =
  "group inline-flex h-9 items-center gap-1 rounded-[5px] px-3 text-[13.5px] font-medium text-foreground/75 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-foreground"

function MegaPanel({ group }: { group: NavGroup }) {
  const compact = group.columns.every((c) => c.links.every((l) => !l.description))
  return (
    <div className={cn("flex", group.featured ? "w-[780px]" : compact ? "w-[600px]" : "w-[620px]")}>
      <div className="flex-1 p-3">
        <div className={cn("grid gap-x-2", group.columns.length > 1 && "grid-cols-2")}>
          {group.columns.map((col) => (
            <div key={col.title}>
              <div className="px-2.5 pt-1.5 pb-2 font-mono text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                {col.title}
              </div>
              <ul className={cn(compact && col.links.length > 6 && "grid grid-cols-1")}>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <MenuLink link={l} compact={compact} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {group.footer && group.footer.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 border-t border-border px-1 pt-2">
            {group.footer.map((f) => (
              <NM.Link key={f.href} asChild>
                <Link
                  href={f.href}
                  className="group/f inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-1.5 text-[13px] font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {f.title}
                  <ArrowRight className="size-3.5 transition-transform group-hover/f:translate-x-0.5" />
                </Link>
              </NM.Link>
            ))}
          </div>
        )}
      </div>
      {group.featured && (
        <NM.Link asChild>
          <Link
            href={group.featured.href}
            className="mk-dark group/feat relative m-2 flex w-[250px] flex-col justify-end overflow-hidden rounded-[8px] p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden className="mk-dots absolute inset-0 opacity-40" />
            <span
              aria-hidden
              className="absolute -top-10 -right-10 size-40 rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.35),transparent_65%)] blur-xl"
            />
            <span className="relative font-mono text-[10.5px] uppercase tracking-wider text-brand">
              {group.featured.eyebrow}
            </span>
            <span className="relative mt-2 text-[17px] leading-snug font-semibold tracking-tight">
              {group.featured.title}
            </span>
            <span className="relative mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {group.featured.description}
            </span>
            <span className="relative mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium">
              {group.featured.cta}
              <ArrowRight className="size-3.5 transition-transform group-hover/feat:translate-x-0.5" />
            </span>
          </Link>
        </NM.Link>
      )}
    </div>
  )
}

function MenuLink({ link, compact }: { link: NavLink; compact?: boolean }) {
  const inner = (
    <>
      {link.icon && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface text-foreground/80 transition-colors group-hover/l:border-foreground/20 group-hover/l:bg-card",
            compact ? "size-7 [&_svg]:size-3.5" : "size-8"
          )}
        >
          {link.icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[13.5px] font-medium text-foreground">
          {link.title}
          {link.external && <ArrowUpRight className="size-3 text-muted-foreground" />}
        </span>
        {link.description && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{link.description}</span>
        )}
      </span>
    </>
  )
  const cls = cn(
    "group/l flex gap-3 rounded-[6px] px-2.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
    compact ? "items-center py-1.5" : "items-start py-2"
  )
  return (
    <NM.Link asChild>
      {link.external ? (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {inner}
        </a>
      ) : (
        <Link href={link.href} className={cls}>
          {inner}
        </Link>
      )}
    </NM.Link>
  )
}

export function GitHubButton({
  stars,
  className,
  tone = "light",
}: {
  stars: string | null
  className?: string
  tone?: "light" | "dark"
}) {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={stars ? `Star Dispatch on GitHub, ${stars} stars` : "Star Dispatch on GitHub"}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        tone === "light"
          ? "border-border bg-card/60 text-foreground hover:border-foreground/25 hover:bg-card"
          : "border-white/15 text-white hover:bg-white/10",
        className
      )}
    >
      <GitHubMark className="size-3.5" />
      <span>Star</span>
      {stars && (
        <span className="ml-0.5 inline-flex items-center gap-1 border-l border-current/15 pl-2 tabular-nums">
          <Star className="size-3 fill-current opacity-70" aria-hidden />
          {stars}
        </span>
      )}
    </a>
  )
}

function MobileMenu({ groups, pricing, signedIn, stars }: Props) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="-mr-1.5 inline-flex size-9 items-center justify-center rounded-[5px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="mk-light gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-sm">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Link href="/" onClick={close} aria-label="Dispatch home">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-5 py-2" aria-label="Mobile">
          <Accordion type="multiple">
            {groups.map((g) => (
              <AccordionItem key={g.label} value={g.label} className="border-border">
                <AccordionTrigger className="py-3.5 text-[15px] hover:no-underline">{g.label}</AccordionTrigger>
                <AccordionContent className="pb-3">
                  {g.columns.map((col) => (
                    <div key={col.title} className="mb-3 last:mb-0">
                      <div className="pb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        {col.title}
                      </div>
                      <ul>
                        {col.links.map((l) => (
                          <li key={l.href}>
                            <MobileLink link={l} onNavigate={close} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {g.footer?.map((f) => <MobileLink key={f.href} link={f} onNavigate={close} />)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <Link
            href={pricing.href}
            onClick={close}
            className="flex items-center justify-between border-b border-border py-3.5 text-[15px] font-medium"
          >
            {pricing.title}
          </Link>
        </nav>
        <div className="safe-bottom shrink-0 space-y-2 border-t border-border p-5">
          <Link href={APP_ENTRY} onClick={close} className={buttonClasses({ size: "lg", className: "w-full" })}>
            {signedIn ? "Open app" : "Start free trial"}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            {!signedIn && (
              <Link
                href={APP_ENTRY}
                onClick={close}
                className={buttonClasses({ variant: "secondary", size: "md", className: "w-full" })}
              >
                Sign in
              </Link>
            )}
            <GitHubButton stars={stars} className={cn("h-10 justify-center", signedIn && "col-span-2")} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MobileLink({ link, onNavigate }: { link: NavLink; onNavigate: () => void }) {
  const cls = "flex items-center gap-2.5 rounded-[5px] py-2 text-[14px] text-foreground/85 hover:text-foreground"
  const inner = (
    <>
      {link.icon && <span className="text-muted-foreground [&_svg]:size-4">{link.icon}</span>}
      {link.title}
      {link.external && <ArrowUpRight className="size-3.5 text-muted-foreground" />}
    </>
  )
  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onNavigate}>
      {inner}
    </a>
  ) : (
    <Link href={link.href} className={cls} onClick={onNavigate}>
      {inner}
    </Link>
  )
}
