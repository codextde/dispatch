import { cn } from "@/lib/utils"

/**
 * Dispatch mark: an open "D" with a signal-green line entering it — a message
 * arriving in a shared inbox. Colors follow the current theme.
 */
export function LogoMark({ className, title = "Dispatch" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" role="img" aria-label={title} className={cn("size-7 shrink-0", className)}>
      <rect width="64" height="64" rx="15" className="fill-foreground" />
      <path
        d="M22 18h11.5C41.5 18 47 24.5 47 32s-5.5 14-13.5 14H22"
        className="stroke-background"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 32h19" className="stroke-brand" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({
  className,
  markClassName,
  name = "Dispatch",
}: {
  className?: string
  markClassName?: string
  name?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark className={markClassName} title={name} />
      <span className="text-[15px] leading-none">{name}</span>
    </span>
  )
}
