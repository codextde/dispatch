import Link from "next/link"
import { ArrowRight, Check, CircleDashed, Minus } from "lucide-react"
import type { ChecklistItem } from "@/server/admin/overview"
import { cn } from "@/lib/utils"

/** Instance readiness checklist; every row links to the page that fixes it. */
export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  const required = items.filter((i) => i.state !== "optional")
  const done = required.filter((i) => i.state === "done").length
  const pct = required.length ? Math.round((done / required.length) * 100) : 100
  return (
    <div>
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-muted-foreground">
            {done} of {required.length} essentials ready
          </span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Setup progress"
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="-mx-2 space-y-px">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group flex items-start gap-3 rounded-md px-2 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  item.state === "done" && "border-transparent bg-brand text-brand-foreground",
                  item.state === "todo" && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                  item.state === "optional" && "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {item.state === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : item.state === "todo" ? (
                  <CircleDashed className="size-3" />
                ) : (
                  <Minus className="size-3" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {item.label}
                  <span className="sr-only">
                    {item.state === "done" ? "(done)" : item.state === "todo" ? "(needs attention)" : "(optional)"}
                  </span>
                  {item.state === "optional" && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Optional</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{item.description}</span>
              </span>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
