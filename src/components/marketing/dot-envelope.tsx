import { cn } from "@/lib/utils"

/**
 * Green dot-matrix envelope (finseo-style particle visual), computed on the
 * server so it ships as static SVG with a few CSS-twinkling dots.
 */
const COLS = 42
const ROWS = 27
const GAP = 12

const rect = { x0: 7, y0: 5, x1: 35, y1: 22 }
const tip = { x: 21, y: 14.5 }
const segments: [number, number, number, number][] = [
  [rect.x0, rect.y0, rect.x1, rect.y0],
  [rect.x1, rect.y0, rect.x1, rect.y1],
  [rect.x1, rect.y1, rect.x0, rect.y1],
  [rect.x0, rect.y1, rect.x0, rect.y0],
  [rect.x0, rect.y0, tip.x, tip.y],
  [rect.x1, rect.y0, tip.x, tip.y],
]

function distToSegment(px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Deterministic pseudo-random in [0, 1) so server output is stable. */
function noise(i: number, j: number) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Dot = { x: number; y: number; r: number; o: number; twinkle?: number }

/**
 * Only the "lit" dots (envelope outline, its halo and a sparse interior) are
 * SVG circles; the dim background grid is a CSS pattern, which keeps the
 * markup small.
 */
const dots: Dot[] = (() => {
  const out: Dot[] = []
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const n = noise(i, j)
      const d = Math.min(...segments.map((s) => distToSegment(i, j, s)))
      const inside = i > rect.x0 && i < rect.x1 && j > rect.y0 && j < rect.y1
      let o: number
      let r = 1.6
      if (d <= 0.55) {
        o = 0.85 + n * 0.15
        r = 2.1
      } else if (d <= 1.15) {
        o = 0.32 + n * 0.12
        r = 1.8
      } else if (inside && n > 0.62) {
        o = 0.18 + (n - 0.62) * 0.6
      } else continue
      out.push({
        x: i * GAP + GAP / 2,
        y: j * GAP + GAP / 2,
        r,
        o: Math.round(o * 100) / 100,
        twinkle: d <= 0.55 && n > 0.72 ? Math.round(n * 3000) : undefined,
      })
    }
  }
  return out
})()

export function DotEnvelope({ className }: { className?: string }) {
  const w = COLS * GAP
  const h = ROWS * GAP
  return (
    <div
      className={cn("relative", className)}
      style={{ aspectRatio: `${COLS} / ${ROWS}` }}
      role="img"
      aria-label="An envelope drawn in glowing green dots"
    >
      <div
        aria-hidden
        className="absolute inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgba(74,222,128,0.22),transparent)] blur-2xl"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at center, #4ade80 0 12%, transparent 13.5%)",
          backgroundSize: `${100 / COLS}% ${100 / ROWS}%`,
          opacity: 0.2,
          maskImage: "radial-gradient(ellipse at center, #000 35%, transparent 72%)",
        }}
      />
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {dots.map((d) => (
          <circle
            key={`${d.x}-${d.y}`}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="#4ade80"
            opacity={d.twinkle === undefined ? d.o : undefined}
            className={d.twinkle !== undefined ? "mk-twinkle" : undefined}
            style={
              d.twinkle !== undefined
                ? ({ "--o": d.o, animationDelay: `${d.twinkle}ms` } as React.CSSProperties)
                : undefined
            }
          />
        ))}
        {/* unread badge on the envelope corner */}
        <circle cx={rect.x1 * GAP + GAP / 2} cy={rect.y0 * GAP + GAP / 2} r="9" fill="#4ade80" opacity="0.18">
          <animate attributeName="r" values="7;14;7" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle cx={rect.x1 * GAP + GAP / 2} cy={rect.y0 * GAP + GAP / 2} r="5" fill="#4ade80" />
      </svg>
    </div>
  )
}
