import type { LucideIcon } from "lucide-react"

/**
 * Keys of the coded product illustrations in
 * `src/components/marketing/visuals`. Content files reference visuals by key
 * so the data stays serialisable and the mocks stay in one place.
 */
export type VisualKind =
  | "inbox"
  | "comments"
  | "assign"
  | "drafts"
  | "presence"
  | "rules"
  | "canned"
  | "labels"
  | "snooze"
  | "sendlater"
  | "chat"
  | "tasks"
  | "analytics"
  | "ai"
  | "contacts"
  | "api"
  | "webhooks"
  | "security"
  | "audit"
  | "mobile"
  | "shortcuts"
  | "signatures"
  | "search"
  | "selfhost"
  | "providers"
  | "delivery"

/** A heading split into a strong part and a quiet (grey) continuation. */
export type TwoTone = readonly [strong: string, quiet: string]

export type FeatureCategorySlug =
  | "collaboration"
  | "email"
  | "workflow"
  | "chat-tasks"
  | "ai"
  | "admin-security"
  | "developer"

export type FeatureCategory = {
  slug: FeatureCategorySlug
  name: string
  description: string
}

export type FeatureBenefit = {
  title: string
  /** Optional quiet continuation of the title */
  quiet?: string
  body: string
  visual: VisualKind
  /** 2–4 short bullet points */
  points?: string[]
}

/** A feature with its own detail page at /features/[slug]. */
export type Feature = {
  slug: string
  name: string
  category: FeatureCategorySlug
  icon: LucideIcon
  /** One line, used on cards and in menus (≤ 90 chars) */
  tagline: string
  headline: TwoTone
  /** Hero paragraph (1–2 sentences) */
  description: string
  /** Used for <meta name="description"> (≤ 160 chars) */
  metaDescription: string
  visual: VisualKind
  benefits: FeatureBenefit[]
  /** Slugs of related detail features */
  related: string[]
  /** Optional hands-on guide shown as a hero action, e.g. install instructions */
  guide?: { label: string; href: string }
}

/** A smaller capability listed on /features that may not have its own page. */
export type FeatureItem = {
  name: string
  description: string
  icon: LucideIcon
  /** Detail page slug, if one exists */
  slug?: string
}

export type UseCase = {
  slug: string
  /** "Customer support" */
  name: string
  icon: LucideIcon
  /** Menu / card line (≤ 90 chars) */
  tagline: string
  headline: TwoTone
  description: string
  metaDescription: string
  /** Three problems this team has with a normal inbox */
  pains: { title: string; body: string }[]
  /** Three-step workflow shown with step labels and visuals */
  workflow: { label: string; title: string; body: string; visual: VisualKind }[]
  /** Detail feature slugs most relevant for this team */
  features: string[]
  /** A concrete starter setup (4–6 short imperative items) */
  setup: string[]
}

export type ComparisonValue = boolean | string

export type Competitor = {
  slug: string
  name: string
  /** Neutral one-line positioning, based on how they describe themselves */
  positioning: string
  /** e.g. "Per user / month, billed annually" */
  pricingBasis: string
  /** List price per user / month; `maxUsers` is the plan's seat cap, if any */
  plans: { name: string; price: number; note?: string; maxUsers?: number }[]
  /** Plan used for the "team of N" cost example */
  referencePlan: string
  trial: string
  headline: TwoTone
  description: string
  metaDescription: string
  /** Honest note on where the competitor is a good fit */
  strengths: string[]
  whySwitch: { title: string; body: string }[]
  table: { label: string; dispatch: ComparisonValue; them: ComparisonValue }[]
  migration: string[]
}

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  summary: string
  groups: { name: string; items: string[] }[]
}

export type Faq = { q: string; a: string }

/* -------------------------------------------------------------------------- */
/* Integrations                                                               */
/* -------------------------------------------------------------------------- */

export type IntegrationCategorySlug = "mail" | "delivery" | "ai" | "automation" | "storage" | "billing" | "deployment"

export type IntegrationCategory = {
  slug: IntegrationCategorySlug
  name: string
  description: string
}

/**
 * A text mark rendered as a tinted tile: a few letters or a generic icon,
 * never a vendor logo. `color` tints the tile; omit it for a neutral tile.
 */
export type IntegrationMark = { text?: string; icon?: LucideIcon; color?: string }

export type IntegrationDetail = {
  headline: TwoTone
  /** Hero paragraph (1–2 sentences) */
  description: string
  /** Used for <meta name="description"> (≤ 160 chars) */
  metaDescription: string
  /** Protocol chips and status rows of the hero "connection" visual */
  connect: { chips: string[]; rows: { label: string; value: string }[] }
  /** "How it works", 3–4 steps */
  steps: { title: string; body: string }[]
  /** What the integration enables; `feature` links a detail feature page and borrows its icon */
  enables: { title: string; body: string; feature?: string; icon?: LucideIcon }[]
  /** Visual shown next to "What it enables" */
  visual: VisualKind
  setup: {
    intro: string
    notes: string[]
    snippet?: { title: string; code: string; lang?: string }
    /** Show the IMAP/SMTP presets table (from the connect form's presets) */
    presets?: boolean
    /** Files in the repo's docs/ folder, optionally with an #anchor */
    docs: { label: string; file: string }[]
  }
  faq: Faq[]
  /** Ids of related integrations with detail pages */
  related: string[]
}

/** One tile on /integrations. Tiles with `detail` get a page at /integrations/[id]. */
export type Integration = {
  id: string
  name: string
  category: IntegrationCategorySlug
  mark: IntegrationMark
  /** Card line (≤ 120 chars) */
  description: string
  /** How it connects, e.g. "OAuth", "via SMTP", "via webhooks & API" */
  badges: string[]
  /** Where a tile without a detail page links to (internal path or docs file URL) */
  href?: string
  detail?: IntegrationDetail
}

/* -------------------------------------------------------------------------- */
/* Docs hub                                                                   */
/* -------------------------------------------------------------------------- */

export type DocPage = {
  /** File name in the repo's docs/ folder */
  file: string
  title: string
  description: string
  icon: LucideIcon
  /** Marketing page that covers the same topic, if any */
  related?: { label: string; href: string }
}
