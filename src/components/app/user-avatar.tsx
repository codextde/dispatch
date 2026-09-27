import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const PALETTE = ["#16a34a", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899", "#6366f1", "#84cc16", "#f97316"]

export function colorForString(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim()
  const parts = src.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase()
}

/** Avatar for users and contacts with deterministic colored fallback. */
export function UserAvatar({
  name,
  email,
  src,
  className,
  size = "md",
}: {
  name?: string | null
  email?: string | null
  src?: string | null
  className?: string
  size?: "xs" | "sm" | "md" | "lg"
}) {
  const sizes = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" }
  const bg = colorForString(email || name || "?")
  return (
    <Avatar className={cn(sizes[size], "shrink-0", className)}>
      {src ? <AvatarImage src={src} alt={name ?? email ?? ""} /> : null}
      <AvatarFallback className="font-medium text-white" style={{ backgroundColor: bg }}>
        {initials(name, email)}
      </AvatarFallback>
    </Avatar>
  )
}
