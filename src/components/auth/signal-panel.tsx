import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Dark graphite brand panel with a green dot-matrix "signal" visual. Always
 * dark (independent of the theme) — it sits beside the form on wide screens.
 */

const COLS = 28
const ROWS = 18

// An open "D" with a line entering it (the Dispatch mark), drawn on the matrix.
function isMarkCell(x: number, y: number) {
  const cx = 15.5
  const cy = 8.5
  // entering line
  if (y >= 8 && y <= 9 && x >= 3 && x <= 14) return true
  // left edge of the D (top and bottom arms)
  if ((y === 2 || y === 15) && x >= 9 && x <= 16) return true
  // bowl of the D
  const dx = x - cx
  const dy = (y - cy) * 1.05
  const r = Math.sqrt(dx * dx + dy * dy)
  return x >= 16 && r >= 5.6 && r <= 7.2
}

// Tiny deterministic PRNG so server and client render the same field.
function noise(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

export function DotMatrix({ className }: { className?: string }) {
  const cells: React.ReactNode[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const mark = isMarkCell(x, y)
      const n = noise(x, y)
      const sparkle = !mark && n > 0.965
      cells.push(
        <circle
          key={`${x}-${y}`}
          cx={x * 10 + 5}
          cy={y * 10 + 5}
          r={mark ? 2.6 : 1.5}
          className={cn(
            mark ? "fill-brand" : sparkle ? "fill-brand/70 animate-pulse-dot" : "fill-white/[0.09]"
          )}
          style={
            mark
              ? { opacity: 0.55 + n * 0.45 }
              : sparkle
                ? { animationDelay: `${Math.round(n * 4000)}ms` }
                : undefined
          }
        />
      )
    }
  }
  return (
    <svg
      viewBox={`0 0 ${COLS * 10} ${ROWS * 10}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label="Dispatch signal"
    >
      {cells}
    </svg>
  )
}

const FEATURES = [
  "Shared inboxes on Gmail, Outlook or any IMAP mailbox",
  "Internal comments, @mentions and assignments",
  "Rules, analytics and a full REST API",
  "Open source — self-host free or use the cloud",
]

export function SignalPanel({ productName = "Dispatch", className }: { productName?: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col justify-between overflow-hidden bg-[#141414] p-10 text-white xl:p-14",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 70% 30%, color-mix(in oklch, var(--brand) 16%, transparent), transparent 70%)",
        }}
      />
      <div className="relative font-mono text-[11px] uppercase tracking-wider text-white/50">
        {productName} · Collaborative inbox
      </div>

      <div className="relative mx-auto w-full max-w-md py-10">
        <DotMatrix />
      </div>

      <div className="relative max-w-md">
        <p className="text-2xl leading-snug font-medium tracking-tight text-balance">
          Email is a team sport.{" "}
          <span className="text-white/45">Assign, discuss and resolve — without forwarding a single message.</span>
        </p>
        <ul className="mt-8 space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand/15">
                <Check className="size-2.5 text-brand" strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
