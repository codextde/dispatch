import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { marked } from "marked"
import sanitizeHtml from "sanitize-html"
import { FileText } from "lucide-react"
import { MonoLabel, Section } from "@/components/marketing/primitives"
import { getSettings } from "@/server/settings"

const pages = {
  imprint: { title: "Imprint", field: "imprint" },
  privacy: { title: "Privacy policy", field: "privacy" },
  terms: { title: "Terms of service", field: "terms" },
} as const

type LegalSlug = keyof typeof pages

function isLegalSlug(s: string): s is LegalSlug {
  return s in pages
}

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params
  if (!isLegalSlug(slug)) return {}
  const legal = await getSettings("legal")
  const published = Boolean(legal[pages[slug].field].trim())
  return {
    title: pages[slug].title,
    alternates: { canonical: `/legal/${slug}` },
    // Placeholder pages shouldn't end up in search results.
    ...(published ? {} : { robots: { index: false } }),
  }
}

/** Operator-provided Markdown → sanitized HTML. */
function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false })
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h2", "img"]),
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      th: ["align"],
      td: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      // The page already has an <h1>; demote Markdown top-level headings.
      h1: "h2",
      a: (tagName, attribs) => {
        const external = /^https?:\/\//.test(attribs.href ?? "")
        return {
          tagName,
          attribs: external ? { ...attribs, target: "_blank", rel: "noopener noreferrer" } : attribs,
        }
      },
    },
  })
}

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params
  if (!isLegalSlug(slug)) notFound()
  const page = pages[slug]
  const legal = await getSettings("legal")
  const source = legal[page.field].trim()
  const html = source ? renderMarkdown(source) : ""
  const company = legal.companyName.trim()

  return (
    <Section padding="none" aria-labelledby="page-title">
      <div className="mx-auto max-w-3xl py-16 sm:py-24">
        <MonoLabel>Legal</MonoLabel>
        <h1 id="page-title" className="mt-4 text-[36px] leading-tight font-semibold tracking-display sm:text-[48px]">
          {page.title}
        </h1>
        {company && <p className="mt-3 text-[14.5px] text-muted-foreground">{company}</p>}
        <nav aria-label="Legal pages" className="mt-8 flex flex-wrap gap-1.5 border-b border-border pb-6">
          {(Object.keys(pages) as LegalSlug[]).map((s) => (
            <Link
              key={s}
              href={`/legal/${s}`}
              aria-current={s === slug ? "page" : undefined}
              className={
                s === slug
                  ? "rounded-full bg-primary px-3 py-1 text-[13px] font-medium text-primary-foreground"
                  : "rounded-full border border-border px-3 py-1 text-[13px] text-foreground/75 hover:text-foreground"
              }
            >
              {pages[s].title}
            </Link>
          ))}
        </nav>
        {html ? (
          <div className="mk-prose mt-10" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="mt-10 flex flex-col items-center rounded-[8px] border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface">
              <FileText className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <p className="mt-5 text-[15px] font-medium">The operator of this instance hasn&apos;t published this page yet.</p>
          </div>
        )}
      </div>
    </Section>
  )
}
