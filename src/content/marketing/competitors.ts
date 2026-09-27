import type { Competitor } from "./types"

/**
 * Public list prices of per-seat collaborative inbox tools, as shown on their
 * pricing pages. Keep this factual: only pricing, trials and positioning the
 * vendors publish themselves. Dispatch's own cloud price comes from instance
 * settings at runtime — use the `{{cloudPrice}}` token wherever it appears.
 */
export const PRICES_AS_OF = "2026"

const sharedRows = {
  openSource: { label: "Open source", dispatch: "Yes, AGPL-3.0", them: false },
  selfHost: { label: "Self-hosting", dispatch: "Docker Compose or Coolify", them: false },
  dataLocation: { label: "Where your data lives", dispatch: "Your server or Dispatch Cloud", them: "Vendor-hosted cloud" },
  unlimitedUsers: { label: "Unlimited users included", dispatch: true, them: false },
  allFeatures: { label: "Every feature on every plan", dispatch: true, them: false },
  sharedInboxes: { label: "Shared inboxes", dispatch: true, them: true },
  comments: { label: "Internal comments & @mentions", dispatch: true, them: true },
  assignments: { label: "Assignments", dispatch: true, them: true },
} as const

export const competitors: Competitor[] = [
  {
    slug: "missive",
    name: "Missive",
    positioning: "A team collaboration inbox that brings email, SMS and social or chat channels into one app.",
    pricingBasis: "Per user / month, billed annually (monthly billing costs more)",
    plans: [
      { name: "Starter", price: 14, note: "Up to 5 users" },
      { name: "Productive", price: 24, note: "Up to 50 users" },
      { name: "Business", price: 36, note: "Unlimited users" },
    ],
    referencePlan: "Productive",
    trial: "30-day free trial, no credit card required",
    headline: ["The Missive alternative", "you can host yourself."],
    description:
      "Missive popularized the collaborative inbox, and Dispatch shares that idea: shared inboxes, internal comments, assignments and rules on top of your existing mailboxes. The difference is how you run and pay for it: Dispatch is open source, free to self-host, and {{cloudPrice}} per workspace on Cloud with unlimited users.",
    metaDescription:
      "Compare Dispatch and Missive: shared inboxes, comments and rules, but open source, self-hostable and priced per workspace instead of per user.",
    strengths: [
      "Polished native desktop and mobile apps",
      "SMS, social and chat channels alongside email",
      "A mature product with a long track record",
    ],
    whySwitch: [
      {
        title: "Flat pricing instead of per seat",
        body: "Missive's plans are billed per user. Dispatch Cloud is {{cloudPrice}} per workspace with unlimited users, and self-hosting is free, so adding a teammate never changes the bill.",
      },
      {
        title: "No feature-gated tiers",
        body: "Rules, the API and analytics are part of every Dispatch workspace. There is no lower tier that leaves automation out.",
      },
      {
        title: "Open source under AGPL-3.0",
        body: "Read the code, audit how your email is handled, and contribute the feature your team needs instead of waiting for a roadmap.",
      },
      {
        title: "Your server, your data",
        body: "Run Dispatch on your own infrastructure with Docker Compose or Coolify. Mail credentials are encrypted at rest and never leave your instance.",
      },
    ],
    table: [
      { label: "Pricing model", dispatch: "{{cloudPrice}} per workspace, flat", them: "Per user / month" },
      { label: "Cost for 10 users (mid tier)", dispatch: "{{cloudPrice}} / month", them: "$240 / month (Productive)" },
      sharedRows.unlimitedUsers,
      sharedRows.allFeatures,
      { label: "Free option", dispatch: "Self-hosted, free forever", them: false },
      sharedRows.openSource,
      sharedRows.selfHost,
      sharedRows.dataLocation,
      sharedRows.sharedInboxes,
      sharedRows.comments,
      sharedRows.assignments,
    ],
    migration: [
      "Connect the same Gmail, Outlook or IMAP mailboxes to Dispatch. History syncs from the mailbox itself.",
      "Recreate your team inboxes, labels and canned responses.",
      "Invite your whole team. Users are unlimited, so include part-timers and freelancers too.",
      "Rebuild your rules as Dispatch conditions and actions.",
      "Run both side by side for a week, then switch your team over.",
    ],
  },
  {
    slug: "front",
    name: "Front",
    positioning: "An AI customer operations platform that unifies communication channels and automates customer-facing work.",
    pricingBasis: "Per seat / month, billed annually",
    plans: [
      { name: "Starter", price: 25, note: "Up to 10 seats" },
      { name: "Professional", price: 65, note: "Up to 50 seats" },
      { name: "Enterprise", price: 105, note: "Unlimited seats" },
    ],
    referencePlan: "Professional",
    trial: "14-day free trial, no credit card required",
    headline: ["A Front alternative", "for teams that live in email."],
    description:
      "Front is built for customer operations at scale across many channels. If your team mostly works in email and wants shared inboxes, comments, assignments and rules without per-seat pricing, Dispatch gives you that as open source software, free to self-host or {{cloudPrice}} per workspace on Cloud.",
    metaDescription:
      "Compare Dispatch and Front: collaborative email with shared inboxes and rules, open source, self-hostable and priced per workspace, not per seat.",
    strengths: [
      "Omnichannel customer operations for large support organizations",
      "Deep analytics, QA and AI add-ons for enterprise teams",
      "A built-in knowledge base and advanced workflow automation",
    ],
    whySwitch: [
      {
        title: "One flat price for the whole team",
        body: "Front bills per seat. Dispatch Cloud is {{cloudPrice}} per workspace with unlimited users, and the self-hosted edition is free.",
      },
      {
        title: "Focused on collaborative email",
        body: "Dispatch does one thing well: turning Gmail, Outlook and IMAP mailboxes into shared inboxes your team can actually work from.",
      },
      {
        title: "Bring your own AI key",
        body: "Summaries and drafts use your own Anthropic or OpenAI key, configured by your admin. No per-seat AI add-on.",
      },
      {
        title: "Open source and self-hostable",
        body: "Audit the code under AGPL-3.0 and keep every email on infrastructure you control.",
      },
    ],
    table: [
      { label: "Pricing model", dispatch: "{{cloudPrice}} per workspace, flat", them: "Per seat / month" },
      { label: "Cost for 10 users (mid tier)", dispatch: "{{cloudPrice}} / month", them: "$650 / month (Professional)" },
      sharedRows.unlimitedUsers,
      sharedRows.allFeatures,
      { label: "Free option", dispatch: "Self-hosted, free forever", them: false },
      sharedRows.openSource,
      sharedRows.selfHost,
      sharedRows.dataLocation,
      sharedRows.sharedInboxes,
      sharedRows.comments,
      sharedRows.assignments,
    ],
    migration: [
      "Connect the mailboxes behind your Front inboxes to Dispatch via Gmail, Outlook or IMAP. History syncs from the mailbox.",
      "Recreate team inboxes, labels, canned responses and signatures.",
      "Invite everyone who needs access. There is no per-seat cost.",
      "Rebuild your rules and point any webhooks at your existing endpoints.",
      "Run both in parallel for a few days, then move your team over.",
    ],
  },
  {
    slug: "hiver",
    name: "Hiver",
    positioning: "An omnichannel customer service platform that started inside Gmail and now covers email, chat, voice and more.",
    pricingBasis: "Per user / month, billed annually (monthly billing costs more)",
    plans: [
      { name: "Growth", price: 25, note: "$35 billed monthly" },
      { name: "Pro", price: 55, note: "$65 billed monthly" },
      { name: "Elite", price: 85, note: "$95 billed monthly" },
    ],
    referencePlan: "Pro",
    trial: "7-day free trial, no credit card required",
    headline: ["A Hiver alternative", "that isn't priced per user."],
    description:
      "Hiver brings shared inboxes into Gmail and has grown into a multi-channel service platform. Dispatch keeps the focus on collaborative email for Gmail, Outlook and any IMAP mailbox, and it's open source: free to self-host, or {{cloudPrice}} per workspace on Cloud.",
    metaDescription:
      "Compare Dispatch and Hiver: shared inboxes, assignments and rules for Gmail, Outlook and IMAP, open source and priced per workspace.",
    strengths: [
      "Works directly inside the Gmail interface",
      "Voice, chat and other channels for service teams",
      "Built-in SLAs and CSAT surveys on higher tiers",
    ],
    whySwitch: [
      {
        title: "Not tied to one mail provider",
        body: "Dispatch works with Google Workspace, Microsoft 365, and any IMAP/SMTP mailbox, so mixed setups share one inbox.",
      },
      {
        title: "Flat pricing, unlimited users",
        body: "Hiver bills per user. Dispatch Cloud is {{cloudPrice}} per workspace and self-hosting is free.",
      },
      {
        title: "Every feature on every plan",
        body: "Rules, analytics, the API and the AI assistant are available to every workspace. There are no tiers to upgrade through.",
      },
      {
        title: "Open source, self-hostable",
        body: "Keep your email on your own server and audit exactly how it's processed.",
      },
    ],
    table: [
      { label: "Pricing model", dispatch: "{{cloudPrice}} per workspace, flat", them: "Per user / month" },
      { label: "Cost for 10 users (mid tier)", dispatch: "{{cloudPrice}} / month", them: "$550 / month (Pro)" },
      sharedRows.unlimitedUsers,
      sharedRows.allFeatures,
      { label: "Free option", dispatch: "Self-hosted, free forever", them: false },
      sharedRows.openSource,
      sharedRows.selfHost,
      sharedRows.dataLocation,
      sharedRows.sharedInboxes,
      sharedRows.comments,
      sharedRows.assignments,
    ],
    migration: [
      "Connect your Google Workspace mailboxes to Dispatch. History syncs straight from Gmail.",
      "Recreate your shared inboxes, labels and templates as canned responses.",
      "Invite the whole team, including occasional helpers. Users are unlimited.",
      "Rebuild your automations as Dispatch rules.",
      "Work in both for a week, then switch.",
    ],
  },
  {
    slug: "help-scout",
    name: "Help Scout",
    positioning: "A customer support platform with a shared inbox, a built-in knowledge base and live chat.",
    pricingBasis: "Per user / month, billed annually (monthly billing costs more)",
    plans: [
      { name: "Free", price: 0, note: "Up to 5 users, 1 inbox" },
      { name: "Standard", price: 25, note: "$30 billed monthly" },
      { name: "Plus", price: 45, note: "$54 billed monthly" },
      { name: "Pro", price: 75, note: "$90 billed monthly" },
    ],
    referencePlan: "Standard",
    trial: "Free plan for up to 5 users; 15-day free trial of paid plans",
    headline: ["A Help Scout alternative", "for the whole company's email."],
    description:
      "Help Scout is a customer support tool with a knowledge base and chat widget. Dispatch is a collaborative inbox for any team that works in email, from support to sales to finance, with unlimited users on one flat price: free self-hosted, or {{cloudPrice}} per workspace on Cloud.",
    metaDescription:
      "Compare Dispatch and Help Scout: open-source collaborative inbox with unlimited users, self-hosting and flat per-workspace pricing.",
    strengths: [
      "A built-in knowledge base for self-service help",
      "A genuine free plan for very small teams",
      "Live chat and customer-facing support widgets",
    ],
    whySwitch: [
      {
        title: "Grow past five users without a per-seat bill",
        body: "Help Scout's paid plans are billed per user. Dispatch Cloud is {{cloudPrice}} per workspace with unlimited users; self-hosted is free.",
      },
      {
        title: "Email that feels like email",
        body: "Dispatch keeps real threads, CCs and signatures from your Gmail, Outlook or IMAP mailbox instead of turning them into tickets.",
      },
      {
        title: "Built for every team, not just support",
        body: "Team chat, tasks and contacts make Dispatch useful for sales, operations and finance inboxes too.",
      },
      {
        title: "Open source and self-hostable",
        body: "Deploy on your own server with Docker Compose and keep full control of customer data.",
      },
    ],
    table: [
      { label: "Pricing model", dispatch: "{{cloudPrice}} per workspace, flat", them: "Per user / month" },
      { label: "Cost for 10 users (mid tier)", dispatch: "{{cloudPrice}} / month", them: "$250 / month (Standard)" },
      sharedRows.unlimitedUsers,
      sharedRows.allFeatures,
      { label: "Free option", dispatch: "Self-hosted, free forever", them: "Free plan, up to 5 users" },
      sharedRows.openSource,
      sharedRows.selfHost,
      sharedRows.dataLocation,
      sharedRows.sharedInboxes,
      sharedRows.comments,
      sharedRows.assignments,
    ],
    migration: [
      "Connect the mailboxes that forward into Help Scout directly to Dispatch via Gmail, Outlook or IMAP.",
      "Recreate your inboxes, tags as labels, and saved replies as canned responses.",
      "Invite the team. There is no per-user cost.",
      "Rebuild workflows as Dispatch rules.",
      "Switch forwarding once the team is comfortable, and keep your knowledge base where it is.",
    ],
  },
  {
    slug: "gmelius",
    name: "Gmelius",
    positioning: "Shared inboxes, kanban boards and AI email assistants that run inside Gmail and Google Workspace.",
    pricingBasis: "Per user / month, billed annually, with monthly conversation caps per plan (Enterprise quoted separately)",
    plans: [
      { name: "Meli", price: 19, note: "Up to 5,000 conversations / month" },
      { name: "Growth", price: 25, note: "Up to 10,000 conversations / month" },
      { name: "Pro", price: 40, note: "Up to 100,000 conversations / month" },
    ],
    referencePlan: "Growth",
    trial: "7-day free trial",
    headline: ["A Gmelius alternative", "without seat or volume caps."],
    description:
      "Gmelius adds collaboration and AI assistants to Gmail. Dispatch is a standalone collaborative inbox for Google Workspace, Microsoft 365 and any IMAP mailbox, open source and priced flat: free self-hosted, or {{cloudPrice}} per workspace on Cloud.",
    metaDescription:
      "Compare Dispatch and Gmelius: open-source shared inboxes for Gmail, Outlook and IMAP with unlimited users and no conversation caps.",
    strengths: [
      "Lives entirely inside the Gmail interface",
      "Kanban boards for email-based workflows",
      "A good fit for teams fully standardized on Google Workspace",
    ],
    whySwitch: [
      {
        title: "Works beyond Gmail",
        body: "Connect Google Workspace, Microsoft 365, iCloud, Fastmail or any IMAP mailbox and share them in one place.",
      },
      {
        title: "No seats, no volume caps",
        body: "Dispatch Cloud is {{cloudPrice}} per workspace with unlimited users. Self-hosted instances are free and limited only by your server.",
      },
      {
        title: "Bring your own AI key",
        body: "Use your Anthropic or OpenAI key for summaries and drafts, and keep AI off entirely if you prefer.",
      },
      {
        title: "Open source under AGPL-3.0",
        body: "Inspect, self-host and extend the code instead of depending on a browser extension.",
      },
    ],
    table: [
      { label: "Pricing model", dispatch: "{{cloudPrice}} per workspace, flat", them: "Per user / month" },
      { label: "Cost for 10 users (mid tier)", dispatch: "{{cloudPrice}} / month", them: "$250 / month (Growth)" },
      sharedRows.unlimitedUsers,
      sharedRows.allFeatures,
      { label: "Free option", dispatch: "Self-hosted, free forever", them: false },
      sharedRows.openSource,
      sharedRows.selfHost,
      sharedRows.dataLocation,
      sharedRows.sharedInboxes,
      sharedRows.comments,
      sharedRows.assignments,
    ],
    migration: [
      "Connect your Google Workspace mailboxes to Dispatch. History syncs from Gmail.",
      "Recreate shared inboxes, labels and templates as canned responses.",
      "Turn board cards into Dispatch tasks linked to their conversations.",
      "Invite the team and rebuild your automations as rules.",
      "Run both for a week, then make Dispatch your team's inbox.",
    ],
  },
]

export const competitorSlugs = competitors.map((c) => c.slug)

export function getCompetitor(slug: string): Competitor | undefined {
  return competitors.find((c) => c.slug === slug)
}
