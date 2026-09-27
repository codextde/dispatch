import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { SignalPanel } from "@/components/auth/signal-panel"
import { cn } from "@/lib/utils"

/** Login layout: form on paper (left), graphite brand panel (right, desktop only). */
export function SplitAuthLayout({
  productName,
  homeHref = "/",
  children,
  footer,
}: {
  productName: string
  homeHref?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10">
        <header className="flex items-center justify-between">
          <Link href={homeHref} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo name={productName} />
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </main>
        {footer && <footer className="text-center text-xs text-muted-foreground">{footer}</footer>}
      </div>
      <aside className="sticky top-0 hidden h-dvh p-3 pl-0 lg:block">
        <SignalPanel productName={productName} className="rounded-xl dark:ring-1 dark:ring-white/10" />
      </aside>
    </div>
  )
}

/** Centered single-column layout (verify link, invitations, onboarding, setup sign-in). */
export function CenteredAuthLayout({
  productName,
  homeHref = "/",
  children,
  width = "sm",
  headerRight,
  banner,
}: {
  productName: string
  homeHref?: string
  children: React.ReactNode
  width?: "sm" | "md" | "lg"
  headerRight?: React.ReactNode
  banner?: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div
        aria-hidden
        className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      {banner}
      <header className="relative flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 sm:px-8">
        <Link href={homeHref} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo name={productName} />
        </Link>
        {headerRight}
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pt-6 pb-[max(4rem,env(safe-area-inset-bottom))] sm:items-center sm:pt-0">
        <div
          className={cn(
            "w-full animate-fade-up",
            width === "sm" && "max-w-md",
            width === "md" && "max-w-xl",
            width === "lg" && "max-w-3xl"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  )
}

/** Paper card with hairline border used by the centered auth pages. */
export function AuthCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 shadow-[0_1px_0_0_rgb(0_0_0/0.02)] sm:p-8", className)}>
      {children}
    </div>
  )
}

export function AuthHeading({
  eyebrow,
  title,
  quiet,
  description,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  quiet?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mb-6", className)}>
      {eyebrow && <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">
        {title}
        {quiet && <span className="text-quiet"> {quiet}</span>}
      </h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
    </div>
  )
}

/** Amber banner shown on auth-area pages while an admin impersonates a user. */
export function ImpersonationBanner({ email }: { email: string }) {
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-xs font-medium text-black">
      You are impersonating {email}.
      <form action="/admin/impersonate/stop" method="post">
        <button className="underline underline-offset-2">Stop impersonating</button>
      </form>
    </div>
  )
}
