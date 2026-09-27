import { cn } from "@/lib/utils"

/** Square workspace mark: logo image or first letter on ink. */
export function WorkspaceInitial({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string
  logoUrl?: string | null
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-sm", lg: "size-12 text-lg" }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground font-semibold text-background",
        sizes[size],
        className
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        (name.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  )
}
