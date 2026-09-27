import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

export const alt = "Dispatch — the open-source collaborative inbox for teams"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

async function font(file: string) {
  try {
    return await readFile(join(process.cwd(), "node_modules/geist/dist/fonts", file))
  } catch {
    return null
  }
}

const INK = "#141414"
const PAPER = "#FAF9F5"
const LINE = "#E6E3DD"
const QUIET = "#A3A3A3"
const MUTED = "#737373"
const GREEN = "#4ADE80"

export default async function OpengraphImage() {
  const [semibold, medium, mono] = await Promise.all([
    font("geist-sans/Geist-SemiBold.ttf"),
    font("geist-sans/Geist-Medium.ttf"),
    font("geist-mono/GeistMono-Medium.ttf"),
  ])
  const fonts = [
    semibold && { name: "Geist", data: semibold, weight: 600 as const, style: "normal" as const },
    medium && { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
    mono && { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ].filter((f) => f !== null)

  // pixel cluster for the corner decoration
  const pixels: [number, number, number][] = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 16; x++) {
      const v = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
      if (v > 0.45) pixels.push([x, y, 0.15 + v * 0.85])
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: PAPER,
          fontFamily: fonts.length ? "Geist" : undefined,
          color: INK,
        }}
      >
        {/* rails */}
        <div style={{ position: "absolute", left: 80, top: 0, bottom: 0, width: 1, background: LINE }} />
        <div style={{ position: "absolute", right: 80, top: 0, bottom: 0, width: 1, background: LINE }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 96, height: 1, background: LINE }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 96, height: 1, background: LINE }} />

        {/* header */}
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: 28,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="15" fill={INK} />
              <path
                d="M22 18h11.5C41.5 18 47 24.5 47 32s-5.5 14-13.5 14H22"
                stroke={PAPER}
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M13 32h19" stroke={GREEN} strokeWidth="5.5" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>Dispatch</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: `1px solid ${LINE}`,
              background: "#FFFFFF",
              borderRadius: 999,
              padding: "8px 18px",
              fontSize: 20,
              fontWeight: 500,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 999, background: GREEN }} />
            Open source · AGPL-3.0
          </div>
        </div>

        {/* headline + subline */}
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: 150,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", fontSize: 74, fontWeight: 600, letterSpacing: -3, lineHeight: 1.04 }}>
            The inbox your whole team
          </div>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 600, letterSpacing: -3, lineHeight: 1.04, color: QUIET }}>
            can work from.
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 27, fontWeight: 500, color: MUTED, maxWidth: 640, lineHeight: 1.4 }}>
            Shared inboxes, comments, assignments and rules for Gmail, Outlook and IMAP.
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            bottom: 30,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: fonts.length ? "Geist Mono" : undefined,
            fontSize: 19,
            letterSpacing: 1.5,
            color: MUTED,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>Self-host free · Cloud per workspace</div>
          <div style={{ display: "flex" }}>Unlimited users</div>
        </div>

        {/* pixel decoration */}
        <div style={{ position: "absolute", right: 120, top: 392, width: 16 * 14, height: 9 * 14, display: "flex" }}>
          {pixels.map(([x, y, o]) => (
            <div
              key={`${x}-${y}`}
              style={{
                position: "absolute",
                left: x * 14,
                top: y * 14,
                width: 8,
                height: 8,
                borderRadius: 999,
                background: GREEN,
                opacity: o,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  )
}
