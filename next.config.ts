import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV !== "production"

/**
 * Page CSP (with a per-request script nonce) is set in `src/proxy.ts`. API
 * routes skip the proxy, so they get this static policy without any inline
 * script allowance.
 */
const apiCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
]

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Allow testing the dev server via 127.0.0.1 in addition to localhost
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "sanitize-html", "postgres"],
  // next/image isn't used; without optimization `/_next/image` can't be abused as an open image proxy
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: apiCsp }] },
      // Downloaded attachments / inline previews: never run scripts in our origin.
      {
        source: "/api/w/:slug/attachments/:id",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "sandbox allow-downloads allow-popups; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
          },
        ],
      },
    ]
  },
}

export default nextConfig
