import { ArrowRight, Star } from "lucide-react"
import { GITHUB_URL } from "@/content/marketing/site"
import { GitHubMark } from "./primitives"

export function AnnouncementBar({ stars }: { stars: string | null }) {
  return (
    <aside aria-label="Announcement" className="mk-dark border-b border-border bg-[#141414]">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group mx-auto flex h-9 max-w-6xl items-center justify-center gap-2 px-4 text-[12.5px] text-white/75 transition-colors hover:text-white"
      >
        <GitHubMark className="size-3.5 text-white/70" />
        <span className="truncate">
          <span className="font-medium text-white">Dispatch is open source</span>
          <span className="hidden sm:inline"> · AGPL-3.0, free to self-host</span>
        </span>
        <span aria-hidden className="text-white/30">
          —
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-brand">
          <Star className="size-3 fill-current" aria-hidden />
          Star on GitHub{stars ? ` (${stars})` : ""}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </a>
    </aside>
  )
}
