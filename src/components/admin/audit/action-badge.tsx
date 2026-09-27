import { cn } from "@/lib/utils"

/** Color family per action namespace (the part before the first dot). */
const NAMESPACE_TONE: Record<string, string> = {
  admin: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  auth: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  setup: "border-brand/30 bg-brand-soft text-foreground",
  workspace: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  member: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  billing: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
}

const DANGER = /(deleted|revoked|disabled|suspended|denied|failed|removed)$/

/** Monospace pill for an audit action like `admin.workspace_suspended`. */
export function ActionBadge({ action, className }: { action: string; className?: string }) {
  const ns = action.split(".")[0] ?? ""
  const danger = DANGER.test(action)
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center truncate rounded-sm border px-1.5 font-mono text-[11px] leading-none",
        danger
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : (NAMESPACE_TONE[ns] ?? "border-border bg-muted text-foreground"),
        className,
      )}
      title={action}
    >
      {action}
    </span>
  )
}

/** "admin.workspace_suspended" → "Workspace suspended" */
export function describeAction(action: string) {
  const [, rest = action] = action.split(/\.(.+)/)
  const text = rest.replace(/[._]/g, " ").trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
