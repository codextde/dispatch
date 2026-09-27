import type { Faq } from "@/content/marketing/types"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { JsonLd, MonoLabel, SectionHeading } from "./primitives"

export function FaqList({ items, className }: { items: Faq[]; className?: string }) {
  return (
    <Accordion type="single" collapsible className={cn("border-t border-border", className)}>
      {items.map((f, i) => (
        <AccordionItem key={f.q} value={`q-${i}`} className="border-b border-border">
          <AccordionTrigger className="gap-6 rounded-none py-5 text-[15px] font-medium hover:no-underline sm:text-base">
            {f.q}
          </AccordionTrigger>
          <AccordionContent className="max-w-2xl pr-8 pb-5 text-[14.5px] leading-relaxed text-muted-foreground">
            {f.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/** Two-column FAQ block with FAQPage structured data. */
export function FaqSection({
  items,
  title = "Questions,",
  quiet = "answered.",
  description,
}: {
  items: Faq[]
  title?: string
  quiet?: string
  description?: React.ReactNode
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
      <div>
        <MonoLabel>FAQ</MonoLabel>
        <SectionHeading className="mt-4" title={title} quiet={quiet} description={description} size="md" />
      </div>
      <FaqList items={items} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
    </div>
  )
}
