import Link from "next/link"
import { Heart } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { getSettings } from "@/server/settings"
import { competitors } from "@/content/marketing/competitors"
import { useCases } from "@/content/marketing/use-cases"
import { COMPANY, COMPANY_COUNTRY, GITHUB_URL, LICENSE_URL } from "@/content/marketing/site"
import { GitHubButton } from "./site-header"

type FooterLink = { label: string; href: string; external?: boolean }

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "All features", href: "/features" },
      { label: "Shared inbox", href: "/features/shared-inbox" },
      { label: "Internal comments", href: "/features/internal-comments" },
      { label: "Assignments", href: "/features/assignments" },
      { label: "Rules & automation", href: "/features/rules-automation" },
      { label: "AI assistant", href: "/features/ai-assistant" },
      { label: "API & webhooks", href: "/features/api-webhooks" },
      { label: "Integrations", href: "/integrations" },
      { label: "Download", href: "/download" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: useCases.map((u) => ({ label: u.name, href: `/use-cases/${u.slug}` })),
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Self-hosting guide", href: "/self-hosting" },
      { label: "Security", href: "/security" },
      { label: "Changelog", href: "/changelog" },
      ...competitors.map((c) => ({ label: `vs ${c.name}`, href: `/compare/${c.slug}` })),
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Open source", href: "/open-source" },
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "Imprint", href: "/legal/imprint" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
]

export async function SiteFooter({ stars }: { stars: string | null }) {
  const legal = await getSettings("legal").catch(() => null)
  const holder = legal?.companyName?.trim() || COMPANY
  const year = new Date().getFullYear()

  return (
    <footer id="site-footer" className="overflow-hidden border-t border-border">
      <div className="rails px-5 pt-16 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div className="max-w-xs">
            <Link href="/" className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight" aria-label="Dispatch home">
              <LogoMark className="size-7" /> Dispatch
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The open-source collaborative inbox. Shared inboxes, comments, assignments and automation on top of the
              mailboxes you already have.
            </p>
            <div className="mt-6">
              <GitHubButton stars={stars} />
            </div>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.title}>
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {col.title}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      {l.external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13.5px] text-foreground/75 transition-colors hover:text-foreground"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className="text-[13.5px] text-foreground/75 transition-colors hover:text-foreground">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-border py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {holder}. Dispatch is free software under the{" "}
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-foreground hover:underline">
              AGPL-3.0
            </a>
            .
          </p>
          <p className="inline-flex items-center gap-1.5">
            Made with <Heart className="size-3.5 fill-[#ef4444] text-[#ef4444]" aria-label="love" /> in {COMPANY_COUNTRY} ·
            AGPL-3.0
          </p>
        </div>
      </div>
      <div aria-hidden className="rails pointer-events-none h-[18vw] max-h-[210px] select-none overflow-hidden">
        <div className="translate-y-[8%] text-center text-[25vw] leading-[0.8] font-semibold tracking-[-0.06em] text-foreground/[0.045] lg:text-[290px]">
          Dispatch
        </div>
      </div>
    </footer>
  )
}
