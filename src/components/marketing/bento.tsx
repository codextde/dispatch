import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { VisualKind } from "@/content/marketing/types"
import { cn } from "@/lib/utils"
import { FeatureVisual } from "./visuals"

type BentoCardProps = {
  title: string
  quiet?: string
  /** Coded mock shown inside the card */
  visual?: VisualKind
  /** Custom illustration instead of a `visual` */
  children?: React.ReactNode
  href?: string
  /** Wide cards place the copy beside the visual on large screens */
  layout?: "stack" | "row"
  className?: string
  visualClassName?: string
}

/**
 * Feature card: light surface, hairline border, 6px radius, title with a quiet
 * continuation and a mini product illustration.
 */
export function BentoCard({
  title,
  quiet,
  visual,
  children,
  href,
  layout = "stack",
  className,
  visualClassName,
}: BentoCardProps) {
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[6px] border border-border bg-surface transition-colors",
        href && "hover:border-foreground/20",
        layout === "row" && "lg:flex-row",
        className
      )}
    >
      <div className={cn("relative z-10 p-5 sm:p-6", layout === "row" && "lg:w-[42%] lg:shrink-0 lg:self-center lg:pr-2")}>
        <h3 className="text-[15px] leading-snug font-semibold tracking-tight text-pretty">
          {title}
          {quiet && <span className="font-medium text-muted-foreground"> {quiet}</span>}
        </h3>
        {href && (
          <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            Learn more <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div
        className={cn(
          "relative flex flex-1 items-center justify-center px-5 pb-6 sm:px-6",
          layout === "row" && "lg:py-8 lg:pr-8",
          visualClassName
        )}
      >
        <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-50 mk-fade-bottom" />
        <div className="relative w-full">{children ?? (visual && <FeatureVisual kind={visual} />)}</div>
      </div>
      {href && (
        <Link href={href} className="absolute inset-0 z-20 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          <span className="sr-only">
            {title} {quiet}
          </span>
        </Link>
      )}
    </article>
  )
}
