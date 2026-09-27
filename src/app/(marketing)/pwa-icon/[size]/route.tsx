import { ImageResponse } from "next/og"

/**
 * PNG app icons for the web app manifest (Android requires 192/512 PNGs to
 * install). Rendered from the Dispatch mark; "maskable" keeps the mark
 * inside the safe zone on a full-bleed background.
 */
export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable" }]
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params
  const maskable = size === "maskable"
  const px = maskable ? 512 : size === "192" ? 192 : size === "512" ? 512 : 0
  if (!px) return new Response("Not found", { status: 404 })
  const mark = maskable ? Math.round(px * 0.62) : px

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#141414" : "transparent",
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 64 64" fill="none">
          {!maskable && <rect width="64" height="64" rx="15" fill="#141414" />}
          <path
            d="M22 18h11.5C41.5 18 47 24.5 47 32s-5.5 14-13.5 14H22"
            stroke="#FAF9F5"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13 32h19" stroke="#4ADE80" strokeWidth="5.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: px, height: px }
  )
}
