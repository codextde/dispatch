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
  plans: { name: string; price: number; note?: string }[]
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
