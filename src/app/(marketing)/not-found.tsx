import Link from "next/link"
import { ButtonLink, MonoLabel, Section } from "@/components/marketing/primitives"

export default function MarketingNotFound() {
  return (
    <Section padding="none" aria-labelledby="nf-title">
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-50 mk-fade-bottom" />
        <MonoLabel className="relative">404 · Not found</MonoLabel>
        <h1 id="nf-title" className="relative mt-5 text-[40px] leading-tight font-semibold tracking-display sm:text-[56px]">
          This page got archived. <span className="text-quiet">Or never existed.</span>
        </h1>
        <p className="relative mt-4 max-w-md text-[15px] text-muted-foreground">
          The link may be old or mistyped. Try the home page or browse the features.
        </p>
        <div className="relative mt-8 flex flex-col gap-2.5 sm:flex-row">
          <ButtonLink href="/" arrow>
            Back to home
          </ButtonLink>
          <ButtonLink href="/features" variant="secondary">
            Browse features
          </ButtonLink>
        </div>
        <Link href="/login" className="relative mt-6 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Looking for the app? Sign in
        </Link>
      </div>
    </Section>
  )
}
