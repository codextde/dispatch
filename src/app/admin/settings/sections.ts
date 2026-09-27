import type { SettingsSectionSlug } from "@/components/admin/nav"

/** Two-tone page headers of the settings sections. */
export const SECTION_HEADERS: Record<SettingsSectionSlug, { title: string; quiet: string; description: string }> = {
  general: { title: "General", quiet: "settings", description: "Name your instance, decide who it's for and talk to everyone at once." },
  authentication: {
    title: "Sign-in",
    quiet: "& sessions",
    description: "Who can create an account, how long devices stay signed in and which social logins are offered.",
  },
  email: {
    title: "Email",
    quiet: "delivery",
    description: "Sign-in links, invitations and notifications are sent through the provider configured here.",
  },
  oauth: {
    title: "OAuth",
    quiet: "apps",
    description: "Register Dispatch with Google and Microsoft for one-click inbox connections and social sign-in.",
  },
  billing: {
    title: "Billing",
    quiet: "& subscriptions",
    description: "Charge hosted workspaces with Stripe. Self-hosted private instances never need this.",
  },
  storage: { title: "Attachment", quiet: "storage", description: "Keep files on the server's disk or in any S3-compatible bucket." },
  ai: { title: "AI", quiet: "features", description: "Connect a model provider to power AI assistance across workspaces." },
  branding: { title: "Branding", quiet: "& identity", description: "Make the product your own: name, logo and accent color." },
  security: { title: "Security", quiet: "policies", description: "Network restrictions, abuse limits and privacy defaults." },
  legal: { title: "Legal", quiet: "pages", description: "Imprint, privacy policy and terms, published on the public website." },
}
