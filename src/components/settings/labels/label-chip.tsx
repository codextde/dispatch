import { cn } from "@/lib/utils"

/** Tinted label pill (matches how labels render on conversations). */
export function LabelChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium text-foreground",
        className
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
        borderColor: `color-mix(in oklch, ${color} 35%, transparent)`,
      }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  )
}
