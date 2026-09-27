import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

type SectionProps = {
  id?: string
  /** light inherits the page paper, dark switches to graphite, surface is a tinted paper band */
  tone?: "light" | "dark" | "surface"
  padding?: "none" | "sm" | "md" | "lg"
  className?: string
  containerClassName?: string
  children: React.ReactNode
  "aria-labelledby"?: string
}

const sectionPadding = {
  none: "",
  sm: "py-12 sm:py-16",
  md: "py-16 sm:py-24",
  lg: "py-20 sm:py-24 lg:py-28",
}

/**
 * A full-width band with a hairline bottom divider, containing the centred
 * "rails" column whose vertical guide lines run down the whole page.
 */
export function Section({
  id,
  tone = "light",
  padding = "md",
  className,
  containerClassName,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "border-b border-border",
        tone === "dark" && "mk-dark",
        tone === "surface" && "bg-surface",
        className
      )}
      {...rest}
    >
      <Rails className={cn(sectionPadding[padding], containerClassName)}>{children}</Rails>
    </section>
  )
}

export function Rails({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rails relative px-5 sm:px-8 lg:px-12", className)}>{children}</div>
}

/** Hairline spacer band between sections (finseo-style breathing room). */
export function Spacer({ className }: { className?: string }) {
  return (
    <div aria-hidden className="border-b border-border">
      <div className={cn("rails hatch h-10 sm:h-14", className)} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

export function MonoLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </span>
  )
}

/** Tiny green pixel glyph used in step labels and eyebrows. */
export function PixelMark({ className }: { className?: string }) {
  const on = [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
  ]
  return (
    <svg viewBox="0 0 9 9" aria-hidden className={cn("size-[9px] shrink-0", className)}>
      {on.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x * 3} y={y * 3} width="3" height="3" fill="var(--brand)" />
      ))}
    </svg>
  )
}

/** "● Step 1 · Share" */
export function StepLabel({ step, label, className }: { step?: string | number; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-foreground",
        className
      )}
    >
      <PixelMark />
      <span className="mk-dotted">
        {step !== undefined ? (
          <>
            Step {step} <span className="text-muted-foreground">·</span> {label}
          </>
        ) : (
          label
        )}
      </span>
    </span>
  )
}

/** Rounded pill used above hero headlines. */
export function Eyebrow({
  children,
  href,
  className,
}: {
  children: React.ReactNode
  href?: string
  className?: string
}) {
  const inner = (
    <>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-50 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      <span>{children}</span>
      {href && <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
    </>
  )
  const cls = cn(
    "group inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-[12.5px] font-medium text-foreground shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur",
    href && "transition-colors hover:border-foreground/20",
    className
  )
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  )
}

type HeadingTag = "h1" | "h2" | "h3"

export function SectionHeading({
  eyebrow,
  title,
  quiet,
  description,
  align = "left",
  as: Tag = "h2",
  size = "md",
  id,
  className,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  quiet?: React.ReactNode
  description?: React.ReactNode
  align?: "left" | "center"
  as?: HeadingTag
  size?: "sm" | "md" | "lg" | "xl"
  id?: string
  className?: string
  children?: React.ReactNode
}) {
  const sizes = {
    sm: "text-[26px] sm:text-[32px]",
    md: "text-[32px] sm:text-[42px]",
    lg: "text-[36px] sm:text-[52px]",
    xl: "text-[40px] sm:text-[56px] lg:text-[64px]",
  }
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <div className="mb-5">{eyebrow}</div>}
      <Tag id={id} className={cn(sizes[size], "leading-[1.04] font-semibold tracking-display text-balance")}>
        {title}
        {quiet && (
          <>
            {" "}
            <span className="text-quiet">{quiet}</span>
          </>
        )}
      </Tag>
      {description && (
        <p
          className={cn(
            "mt-5 text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base",
            align === "center" && "mx-auto max-w-xl"
          )}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "brand" | "link"
type ButtonSize = "sm" | "md" | "lg"

const buttonBase =
  "group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[4px] font-medium transition-[background-color,border-color,color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px select-none"

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-primary/88",
  secondary: "border border-border bg-card/60 text-foreground hover:border-foreground/25 hover:bg-card",
  ghost: "text-foreground hover:bg-accent",
  brand: "bg-brand text-[#07210f] hover:bg-brand/90",
  link: "px-0! h-auto! text-foreground underline-offset-4 hover:underline",
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
}

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  arrow,
  external,
  className,
  children,
  ...rest
}: {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  arrow?: boolean
  external?: boolean
  className?: string
  children: React.ReactNode
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  const cls = buttonClasses({ variant, size, className })
  const icon = arrow ? (
    external ? (
      <ArrowUpRight className="size-4 transition-transform group-hover/btn:-translate-y-px group-hover/btn:translate-x-px" />
    ) : (
      <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
    )
  ) : null
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
        {children}
        {icon}
      </a>
    )
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
      {icon}
    </Link>
  )
}

/** Text link with an arrow, e.g. "All features →" */
export function ArrowLink({
  href,
  children,
  className,
  external,
}: {
  href: string
  children: React.ReactNode
  className?: string
  external?: boolean
}) {
  const cls = cn(
    "group inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline",
    className
  )
  const icon = external ? (
    <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
  ) : (
    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
  )
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
      {icon}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
      {icon}
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/* Marks                                                                      */
/* -------------------------------------------------------------------------- */

/** GitHub's mark, used only on links to the GitHub repository. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 shrink-0", className)} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/** JSON-LD script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here once "<" is escaped
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}
