import { cn } from "@/lib/utils"
import { CopyButton } from "./copy-button"

/**
 * Dark code panel with a copy button. Comment lines (# …) are dimmed; that's
 * all the highlighting shell and YAML snippets need.
 */
export function CodeBlock({
  code,
  title,
  lang = "bash",
  className,
}: {
  code: string
  title?: string
  lang?: string
  className?: string
}) {
  const lines = code.replace(/\n$/, "").split("\n")
  return (
    <figure className={cn("overflow-hidden rounded-[8px] border border-black/10 bg-[#161616] text-[#e7e5e0]", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 pr-1.5 pl-4">
        <span className="font-mono text-[11px] text-white/45">{title ?? lang}</span>
        <CopyButton text={code.replace(/\n$/, "")} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7]">
        <code>
          {lines.map((line, i) => {
            const comment = /^\s*#/.test(line)
            return (
              <span key={i} className={cn("block min-h-[1.7em]", comment && "text-white/40")}>
                {line}
              </span>
            )
          })}
        </code>
      </pre>
    </figure>
  )
}
