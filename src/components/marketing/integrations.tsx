import Link from "next/link"
import { ArrowRight, ArrowUpRight, Check } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { integrationHref } from "@/content/marketing/integrations"
import type { Integration, IntegrationDetail, IntegrationMark as Mark } from "@/content/marketing/types"
import { cn } from "@/lib/utils"
import { Panel } from "./visuals/ui"

const markSizes = {
  sm: "size-7 rounded-[6px] text-[11px] [&_svg]:size-3.5",
  md: "size-10 rounded-[8px] text-[14px] [&_svg]:size-[18px]",
  lg: "size-14 rounded-[11px] text-[19px] [&_svg]:size-6",
  xl: "size-16 rounded-[13px] text-[22px] [&_svg]:size-7 sm:size-20 sm:rounded-[16px] sm:text-[27px] sm:[&_svg]:size-9",
}

/**
 * Text mark on a tinted tile, standing in for a vendor logo. The tint and ink
 * are mixed with the current scope's card and foreground colors, so marks stay
 * legible on paper and graphite sections alike.
 */
export function IntegrationMark({
  mark,
  size = "md",
  className,
}: {
  mark: Mark
  size?: keyof typeof markSizes
  className?: string
}) {
  const Icon = mark.icon
  const color = mark.color ?? "var(--foreground)"
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border leading-none font-semibold tracking-[-0.03em]",
        markSizes[size],
        className
      )}
      style={{
        background: `color-mix(in srgb, ${color} ${mark.color ? 12 : 4}%, var(--card))`,
        borderColor: `color-mix(in srgb, ${color} ${mark.color ? 26 : 10}%, var(--border))`,
        color: mark.color ? `color-mix(in srgb, ${color} 70%, var(--foreground))` : "var(--foreground)",
      }}
    >
      {Icon ? <Icon /> : <span className={cn(mark.text && mark.text.length > 2 && "text-[0.78em]")}>{mark.text}</span>}
    </span>
  )
}

export function IntegrationBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  )
}

/** Card on /integrations and in "related" rows. The whole card is one link. */
export function IntegrationTile({ integration, className }: { integration: Integration; className?: string }) {
  const href = integrationHref(integration)
  const external = href?.startsWith("http")
  const linkLabel = integration.detail ? "Read the guide" : external ? "Setup docs" : "Learn more"
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-[6px] border border-border bg-card p-5 transition-colors",
        href && "hover:border-foreground/20",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IntegrationMark mark={integration.mark} />
        {integration.detail && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-(--brand-ink)">
            Guide
          </span>
        )}
      </div>
      <h3 className="mt-4 text-[15px] leading-snug font-semibold tracking-tight">{integration.name}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{integration.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
        {integration.badges.map((b) => (
          <IntegrationBadge key={b}>{b}</IntegrationBadge>
        ))}
        {href && (
          <span className="ml-auto inline-flex items-center text-muted-foreground transition-colors group-hover:text-foreground">
            {external ? (
              <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
            ) : (
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            )}
          </span>
        )}
      </div>
      {href &&
        (external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="sr-only">
              {integration.name}: {linkLabel} (opens GitHub)
            </span>
          </a>
        ) : (
          <Link href={href} className="absolute inset-0 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <span className="sr-only">
              {integration.name}: {linkLabel}
            </span>
          </Link>
        ))}
    </article>
  )
}

/** Dotted connector with a travelling signal dot. */
function Connector({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative block h-px", className)}>
      <span
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(to right, color-mix(in srgb, var(--foreground) 35%, transparent) 50%, transparent 0)",
          backgroundSize: "6px 1px",
        }}
      />
      <span className="mk-flow absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_4px_var(--brand-soft)]" />
    </span>
  )
}

/** Hero visual of an integration page: Dispatch ↔ provider, protocols, live status. */
export function ConnectVisual({ integration, detail }: { integration: Integration; detail: IntegrationDetail }) {
  return (
    <div
      role="img"
      aria-label={`Dispatch connected to ${integration.name} via ${detail.connect.chips.join(", ")}`}
      className="mk-glow relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-[8px] border border-border bg-background px-5 py-10 sm:min-h-[440px] sm:p-12"
    >
      <div aria-hidden className="mk-dots absolute inset-0 opacity-60 mk-fade-bottom" />
      <div aria-hidden className="relative flex w-full max-w-[380px] flex-col items-center">
        <div className="flex w-full items-center">
          <span className="flex flex-col items-center gap-2">
            <span className="flex size-16 items-center justify-center rounded-[13px] border border-border bg-card shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] sm:size-20 sm:rounded-[16px]">
              <LogoMark className="size-9 sm:size-11" title="" />
            </span>
            <span className="text-[11.5px] font-medium">Dispatch</span>
          </span>
          <Connector className="mx-3 mb-6 flex-1 sm:mx-5" />
          <span className="flex flex-col items-center gap-2">
            <IntegrationMark mark={integration.mark} size="xl" className="shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]" />
            <span className="max-w-[120px] truncate text-[11.5px] font-medium">{integration.name.split(" & ")[0]}</span>
          </span>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-1.5">
          {detail.connect.chips.map((c) => (
            <IntegrationBadge key={c} className="bg-card">
              {c}
            </IntegrationBadge>
          ))}
        </div>
        <Panel className="mt-6 w-full overflow-hidden text-[11.5px]">
          <ul className="divide-y divide-border">
            {detail.connect.rows.map((r, i) => (
              <li key={r.label} className="flex items-center gap-2.5 px-3 py-2.5">
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full",
                    /retry|fail/i.test(r.value) ? "bg-[#f59e0b]/15 text-[#b45309]" : "bg-brand-soft text-(--brand-ink)"
                  )}
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate", i === 0 ? "font-semibold" : "font-mono text-[10.5px]")}>{r.label}</span>
                <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">{r.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/** A hub of marks around the Dispatch mark, for the /integrations hero. */
export function IntegrationsHub({ items }: { items: Integration[] }) {
  const n = items.length
  return (
    <div
      role="img"
      aria-label={`Dispatch connects to ${items.map((i) => i.name).join(", ")} and more`}
      className="mk-glow relative mx-auto aspect-square w-full max-w-[440px] overflow-hidden rounded-[8px] border border-border bg-background"
    >
      <div aria-hidden className="mk-dots absolute inset-0 opacity-60" />
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <circle cx="50" cy="50" r="36" fill="none" style={{ stroke: "var(--border)" }} strokeWidth="0.3" />
        <circle cx="50" cy="50" r="20" fill="none" style={{ stroke: "var(--border)" }} strokeWidth="0.3" strokeDasharray="1 1.2" />
        {items.map((it, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2
          return (
            <line
              key={it.id}
              x1="50"
              y1="50"
              x2={50 + Math.cos(a) * 36}
              y2={50 + Math.sin(a) * 36}
              style={{ stroke: "color-mix(in srgb, var(--foreground) 22%, transparent)" }}
              strokeWidth="0.3"
              strokeDasharray="0.8 1"
            />
          )
        })}
      </svg>
      <div aria-hidden className="absolute inset-0">
        {items.map((it, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2
          return (
            <span
              key={it.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${50 + Math.cos(a) * 36}%`, top: `${50 + Math.sin(a) * 36}%` }}
            >
              <IntegrationMark mark={it.mark} className="shadow-[0_6px_16px_-10px_rgba(0,0,0,0.35)] sm:size-12 sm:text-[16px]" />
            </span>
          )
        })}
        <span className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[18px] border border-border bg-card shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)] sm:size-24 sm:rounded-[22px]">
          <LogoMark className="size-11 sm:size-14" title="" />
        </span>
      </div>
    </div>
  )
}
