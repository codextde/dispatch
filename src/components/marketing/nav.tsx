import {
  BookOpen,
  GitCompareArrows,
  History,
  Info,
  LayoutGrid,
  Scale,
  Server,
  ShieldCheck,
} from "lucide-react"
import { features } from "@/content/marketing/features"
import { useCases } from "@/content/marketing/use-cases"
import { competitors } from "@/content/marketing/competitors"
import { GITHUB_URL } from "@/content/marketing/site"
import { GitHubMark } from "./primitives"

export type NavLink = {
  title: string
  description?: string
  href: string
  icon?: React.ReactNode
  external?: boolean
}

export type NavGroup = {
  label: string
  columns: { title: string; links: NavLink[] }[]
  footer?: NavLink
  featured?: { eyebrow: string; title: string; description: string; href: string; cta: string }
}

const iconCls = "size-4"

function featureLink(slug: string): NavLink {
  const f = features.find((x) => x.slug === slug)
  if (!f) throw new Error(`Unknown feature ${slug}`)
  const Icon = f.icon
  return { title: f.name, description: f.tagline, href: `/features/${f.slug}`, icon: <Icon className={iconCls} /> }
}

/** Header / mobile menu structure. Built on the server so icons render as plain SVG. */
export function getMarketingNav(): { groups: NavGroup[]; pricing: NavLink } {
  return {
    groups: [
      {
        label: "Product",
        columns: [
          {
            title: "Collaborate",
            links: ["shared-inbox", "internal-comments", "assignments", "collaborative-drafts"].map(featureLink),
          },
          {
            title: "Automate",
            links: ["rules-automation", "canned-responses", "ai-assistant", "analytics"].map(featureLink),
          },
        ],
        footer: { title: "All features", href: "/features", icon: <LayoutGrid className={iconCls} /> },
        featured: {
          eyebrow: "Open source",
          title: "Self-host in five minutes",
          description: "One Docker Compose file, one DOMAIN variable. Everything else is set up in the browser.",
          href: "/self-hosting",
          cta: "Read the guide",
        },
      },
      {
        label: "Solutions",
        columns: [
          {
            title: "By team",
            links: useCases.map((u) => {
              const Icon = u.icon
              return { title: u.name, href: `/use-cases/${u.slug}`, icon: <Icon className={iconCls} /> }
            }),
          },
          {
            title: "Compare",
            links: competitors.map((c) => ({
              title: `Dispatch vs ${c.name}`,
              href: `/compare/${c.slug}`,
              icon: <GitCompareArrows className={iconCls} />,
            })),
          },
        ],
        footer: { title: "All use cases", href: "/use-cases", icon: <LayoutGrid className={iconCls} /> },
      },
      {
        label: "Resources",
        columns: [
          {
            title: "Learn",
            links: [
              {
                title: "Self-hosting guide",
                description: "Docker Compose, Coolify, SMTP and updates",
                href: "/self-hosting",
                icon: <Server className={iconCls} />,
              },
              {
                title: "Security",
                description: "How Dispatch protects your mail",
                href: "/security",
                icon: <ShieldCheck className={iconCls} />,
              },
              {
                title: "Changelog",
                description: "What's new in each release",
                href: "/changelog",
                icon: <History className={iconCls} />,
              },
            ],
          },
          {
            title: "Project",
            links: [
              {
                title: "Open source",
                description: "Why AGPL-3.0 and how to contribute",
                href: "/open-source",
                icon: <Scale className={iconCls} />,
              },
              {
                title: "About",
                description: "Who builds Dispatch and why",
                href: "/about",
                icon: <Info className={iconCls} />,
              },
              {
                title: "GitHub",
                description: "Source code, issues and discussions",
                href: GITHUB_URL,
                icon: <GitHubMark className={iconCls} />,
                external: true,
              },
            ],
          },
        ],
        footer: { title: "Compare Dispatch", href: "/compare", icon: <BookOpen className={iconCls} /> },
      },
    ],
    pricing: { title: "Pricing", href: "/pricing" },
  }
}
