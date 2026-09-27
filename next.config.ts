import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV !== "production"

/**
 * Content Security Policy. Email bodies are rendered inside sandboxed
 * iframes without script execution, so remote content can never run code.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://api.stripe.com`,
  "frame-src 'self' blob: https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com https://login.microsoftonline.com",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
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
