import type { MetadataRoute } from "next"

/** PWA manifest: Dispatch can be installed to the home screen on mobile and desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dispatch",
    short_name: "Dispatch",
    description: "The open-source collaborative inbox for teams.",
    id: "/",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAF9F5",
    theme_color: "#FAF9F5",
    categories: ["productivity", "business"],
    icons: [
      { src: "/brand/mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
