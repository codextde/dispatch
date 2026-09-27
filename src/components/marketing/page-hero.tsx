import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Section } from "./primitives"

type Crumb = { label: string; href?: string }

/** Standard top section of inner marketing pages. */
export function PageHero({
  eyebrow,
  title,
  quiet,
  description,
  actions,
  aside,
  align = "left",
  breadcrumbs,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  quiet?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Visual shown beside the copy on large screens */
  aside?: React.ReactNode
  align?: "left" | "center"
  breadcrumbs?: Crumb[]
  children?: React.ReactNode
}) {
  const center = align === "center" && !aside
  return (
    <Section padding="none" className="relative overflow-hidden" aria-labelledby="page-title">
      <div aria-hidden className="mk-dots pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-50 mk-fade-bottom" />
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="relative pt-6">
          <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground">
            {breadcrumbs.map((c, i) => (
              <li key={`${i}-${c.label}`} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div
        className={cn(
          "relative",
          breadcrumbs ? "pt-10 pb-16 sm:pt-14 sm:pb-20" : "py-16 sm:py-24",
          aside && "grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16"
        )}
      >
        <div className={cn(center && "mx-auto flex max-w-3xl flex-col items-center text-center")}>
          {eyebrow}
          <h1
            id="page-title"
            className={cn(
              "text-[38px] leading-[1.03] font-semibold tracking-display text-balance sm:text-[52px]",
              !aside && "lg:text-[58px]",
              eyebrow && "mt-6"
            )}
          >
            {title}
            {quiet && (
              <>
                {" "}
                <span className="text-quiet">{quiet}</span>
              </>
            )}
          </h1>
          {description && (
            <p
              className={cn(
                "mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground text-pretty sm:text-[17px]",
                center && "mx-auto"
              )}
            >
              {description}
            </p>
          )}
          {actions && (
            <div className={cn("mt-8 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row", center && "sm:justify-center")}>
              {actions}
            </div>
          )}
        </div>
        {aside}
      </div>
      {children}
    </Section>
  )
}
