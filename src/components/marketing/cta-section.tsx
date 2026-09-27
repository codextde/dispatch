import { APP_ENTRY } from "@/content/marketing/site"
import { ButtonLink, PixelMark, Section } from "./primitives"

/** Closing call to action used at the bottom of most pages. */
export function CtaSection({
  title = "Give your team one inbox.",
  quiet = "Keep your data.",
  description,
  trialDays,
}: {
  title?: string
  quiet?: string
  description?: string
  trialDays?: number
}) {
  return (
    <Section tone="dark" padding="none" className="relative overflow-hidden" aria-labelledby="cta-title">
      <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-50" />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(74,222,128,0.28),transparent)] blur-2xl"
      />
      <div className="relative flex flex-col items-center py-20 text-center sm:py-28">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <PixelMark /> Start today
        </span>
        <h2 id="cta-title" className="mt-5 max-w-3xl text-[36px] leading-[1.03] font-semibold tracking-display text-balance sm:text-[56px]">
          {title} <span className="text-quiet">{quiet}</span>
        </h2>
        <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          {description ??
            `Try Dispatch Cloud free for ${trialDays ?? 14} days, or run it on your own server today. Same product, every feature, unlimited users.`}
        </p>
        <div className="mt-8 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <ButtonLink href={APP_ENTRY} size="lg" arrow>
            Start free trial
          </ButtonLink>
          <ButtonLink href="/self-hosting" size="lg" variant="secondary">
            Self-host for free
          </ButtonLink>
        </div>
      </div>
    </Section>
  )
}
