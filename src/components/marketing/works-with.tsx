import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { PROVIDERS } from "@/content/marketing/site"
import { cn } from "@/lib/utils"
import { MonoLabel, Section } from "./primitives"

/** "Works with" strip — providers as plain text wordmarks (no logos). */
export function WorksWith() {
  return (
    <Section padding="none" aria-labelledby="works-with">
      <div className="-mx-5 flex flex-col items-center gap-x-4 gap-y-1.5 border-b border-border px-5 py-5 text-center sm:-mx-8 sm:flex-row sm:justify-center lg:-mx-12">
        <MonoLabel>
          <span id="works-with">Works with the mailboxes you already have</span>
        </MonoLabel>
        <Link
          href="/integrations"
          className="group inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
        >
          All integrations
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
      <ul className="-mx-5 grid grid-cols-2 sm:-mx-8 sm:grid-cols-4 lg:-mx-12">
        {PROVIDERS.map((p, i) => (
          <li
            key={p.name}
            className={cn(
              "flex h-20 items-center justify-center border-border px-3 text-center text-[15px] text-foreground/60 sm:h-24 sm:text-[17px]",
              // hairline grid: right borders except on row ends, bottom border on the first row(s)
              i % 2 === 0 && "border-r",
              i % 4 !== 3 && "sm:border-r",
              i < 6 && "border-b",
              i < 4 ? "sm:border-b" : "sm:border-b-0",
              p.style
            )}
          >
            {p.name}
          </li>
        ))}
      </ul>
    </Section>
  )
}
