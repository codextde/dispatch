import "server-only"
import crypto from "node:crypto"
import zlib from "node:zlib"
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"
import { nextConversationNumber } from "@/server/orgs"
import { deleteObject, makeStorageKey, putObject } from "@/server/storage"
import { publish } from "@/server/realtime"

/**
 * Demo workspace data ("Northwind", a small inventory SaaS helping retailers).
 *
 *   await seedDemoData(orgId, userId)   // idempotent: skips when demo data exists
 *   await removeDemoData(orgId)         // removes everything the seed created
 *
 * How demo rows are recognised (so removal never touches real data):
 *  - every demo email address ends in `.demo` (teammates, customers, inboxes)
 *  - demo inboxes use `provider: "demo"`, demo conversations `providerThreadId: "demo:<key>"`
 *  - rows that cannot carry a marker (teams, labels, tasks, responses, rules,
 *    signatures) are listed in a manifest stored in the audit log (`demo.seeded`)
 */

const DEMO_DOMAIN = "northwind.demo"
const THREAD_PREFIX = "demo:"
const H = 3_600_000

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

type Teammate = "maya" | "leo" | "sara" | "omar"
type Person = Teammate | "me"
type Inbox = "support" | "sales"
type LabelKey = "urgent" | "billing" | "bug" | "feature" | "vip" | "feedback"
type AttachmentKind = "screenshot" | "invoice" | "csv" | "questionnaire"

const TEAMMATES: Record<Teammate, { email: string; name: string; title: string; timezone: string }> = {
  maya: { email: `maya@${DEMO_DOMAIN}`, name: "Maya Chen", title: "Support Lead", timezone: "America/New_York" },
  leo: { email: `leo@${DEMO_DOMAIN}`, name: "Leo Park", title: "Account Executive", timezone: "America/Los_Angeles" },
  sara: { email: `sara@${DEMO_DOMAIN}`, name: "Sara Nilsen", title: "Support Engineer", timezone: "Europe/Oslo" },
  omar: { email: `omar@${DEMO_DOMAIN}`, name: "Omar Haddad", title: "Customer Success Manager", timezone: "Europe/London" },
}

const LABELS: Record<LabelKey, { name: string; color: string }> = {
  urgent: { name: "Urgent", color: "#ef4444" },
  billing: { name: "Billing", color: "#f59e0b" },
  bug: { name: "Bug", color: "#8b5cf6" },
  feature: { name: "Feature request", color: "#14b8a6" },
  vip: { name: "VIP", color: "#ec4899" },
  feedback: { name: "Feedback", color: "#0ea5e9" },
}

type ContactSpec = {
  name: string
  email: string
  company?: string
  title?: string
  phone?: string
  notes?: string
  tags?: string[]
  customFields?: Record<string, string>
}

const CONTACTS = {
  hannah: {
    name: "Hannah Weber",
    email: "hannah@brightpath.demo",
    company: "Brightpath Outfitters",
    title: "Operations Manager",
    phone: "+1 (503) 555-0142",
    notes: "Runs a big autumn promo every October. Prefers email over calls.",
    tags: ["customer", "growth"],
    customFields: { Plan: "Growth", Seats: "8" },
  },
  tomas: {
    name: "Tomás García",
    email: "tomas@verdebotanicals.demo",
    company: "Verde Botanicals",
    title: "Finance Lead",
    phone: "+34 91 555 0187",
    tags: ["customer"],
  },
  priya: {
    name: "Priya Raman",
    email: "priya@lumenhome.demo",
    company: "Lumen Home",
    title: "Head of E-commerce",
    phone: "+1 (212) 555-0199",
    notes: "Opening an EU warehouse in Rotterdam. Upgrade candidate once region-based routing ships.",
    tags: ["customer", "expansion"],
    customFields: { Plan: "Starter", Seats: "6" },
  },
  daniel: {
    name: "Daniel Kim",
    email: "daniel@harborpine.demo",
    company: "Harbor & Pine",
    title: "Lead Developer",
    notes: "Heavy API user. Renewal is due next month.",
    tags: ["customer", "developer"],
  },
  jonas: {
    name: "Jonas Becker",
    email: "jonas.becker@alpinegear.demo",
    company: "Alpine Gear Supply",
    title: "IT Director",
    phone: "+49 89 5550 1234",
    notes: "Needs SAML SSO (Okta) for all tools by end of quarter. 35 seats.",
    tags: ["lead", "enterprise"],
  },
  katrin: {
    name: "Katrin Vogel",
    email: "katrin.vogel@alpinegear.demo",
    company: "Alpine Gear Supply",
    title: "Security Lead",
    tags: ["lead"],
  },
  ben: {
    name: "Ben Thompson",
    email: "ben.thompson@summitsupply.demo",
    company: "Summit Supply Group",
    title: "Procurement Manager",
    phone: "+1 (312) 555-0110",
    tags: ["lead", "enterprise"],
  },
  mia: {
    name: "Mia Novak",
    email: "mia@driftwoodcandle.demo",
    company: "Driftwood Candle Co.",
    title: "Founder",
    tags: ["customer", "churn-risk"],
  },
  isabella: {
    name: "Isabella Moreno",
    email: "isabella@solandsalt.demo",
    company: "Sol & Salt",
    title: "Operations",
    tags: ["customer"],
  },
  ethan: {
    name: "Ethan Walsh",
    email: "ethan@crestline.demo",
    company: "Crestline Apparel",
    title: "CTO",
    tags: ["customer", "developer"],
  },
  aisha: {
    name: "Aisha Bello",
    email: "aisha@kindredkids.demo",
    company: "Kindred Kids",
    title: "Customer Experience Lead",
    notes: "Happy to act as a reference customer.",
    tags: ["customer", "advocate"],
  },
  grace: {
    name: "Grace Liu",
    email: "grace@nimbustea.demo",
    company: "Nimbus Tea",
    title: "Growth Lead",
    tags: ["customer", "upsell"],
  },
  olivia: {
    name: "Olivia Brooks",
    email: "olivia.brooks@atlasfitness.demo",
    company: "Atlas Fitness Co.",
    title: "VP Operations",
    phone: "+1 (415) 555-0163",
    notes: "40 gym locations with retail corners. Currently manages stock in spreadsheets.",
    tags: ["lead", "enterprise"],
  },
  lucas: {
    name: "Lucas Silva",
    email: "lucas@pixelforge.demo",
    company: "PixelForge Studio",
    title: "Partnerships",
    tags: ["partner"],
  },
  emily: {
    name: "Emily Carter",
    email: "emily@fieldnote.demo",
    company: "Fieldnote Paper Co.",
    title: "COO",
    tags: ["customer"],
  },
  chloe: {
    name: "Chloé Martin",
    email: "chloe@maisonlumiere.demo",
    company: "Maison Lumière",
    title: "Directrice e-commerce",
    tags: ["churned"],
  },
  ryan: {
    name: "Ryan O'Connor",
    email: "ryan@tidewatersurf.demo",
    company: "Tidewater Surf",
    title: "Owner",
    tags: ["customer"],
  },
  felix: {
    name: "Felix Wagner",
    email: "felix@wagnerbikes.demo",
    company: "Wagner Bikes",
    title: "Owner",
    tags: ["customer", "developer"],
  },
  nora: {
    name: "Nora Ahmed",
    email: "nora@evergreenpet.demo",
    company: "Evergreen Pet Supply",
    title: "Customer Success",
    tags: ["trial"],
  },
  sofia: {
    name: "Sofia Rossi",
    email: "sofia@rossiceramics.demo",
    company: "Rossi Ceramics",
    title: "Owner",
    tags: ["customer"],
  },
  marcus: {
    name: "Marcus Johnson",
    email: "marcus@copperleaf.demo",
    company: "Copperleaf Coffee",
    title: "Founder",
    phone: "+1 (206) 555-0178",
    tags: ["customer"],
  },
  zoe: {
    name: "Zoe Adams",
    email: "zoe@wildflower.demo",
    company: "Wildflower Studio",
    title: "Operations Coordinator",
    tags: ["customer"],
  },
  hugo: {
    name: "Hugo Lefèvre",
    email: "hugo@cafebrume.demo",
    company: "Café Brume",
    title: "Owner",
    tags: ["lead", "wholesale"],
  },
  samuel: {
    name: "Samuel Osei",
    email: "samuel@kentecollective.demo",
    company: "Kente Collective",
    title: "Founder",
    tags: ["customer"],
  },
  laura: {
    name: "Laura Fischer",
    email: "laura.fischer@bergmanntools.demo",
    company: "Bergmann Tools",
    title: "Purchasing",
    phone: "+49 711 5550 876",
    tags: ["customer", "enterprise", "renewal"],
    customFields: { Plan: "Business", Seats: "60", Renewal: "Jan 1, 2027" },
  },
} satisfies Record<string, ContactSpec>

type ContactKey = keyof typeof CONTACTS | "spammer"

const SPAMMER: ContactSpec = { name: "Crypto Rewards", email: "rewards@win-crypto-now.demo" }

type MsgSpec = {
  /** Outbound author; omitted = inbound from `from` (default: the conversation contact) */
  out?: Person
  from?: ContactKey
  /** Hours ago */
  at: number
  body: string
  cc?: ContactKey[]
  signoff?: string
  attach?: AttachmentKind
}

type CommentSpec = { by: Person; at: number; body: string; reactions?: [Person, string][] }

type ConvSpec = {
  key: string
  inbox: Inbox
  subject: string
  contact: ContactKey
  status: "open" | "closed"
  assignees?: Person[]
  assignedBy?: Person
  labels?: LabelKey[]
  /** Billing label added by the "Tag billing emails" rule */
  ruleLabel?: boolean
  snoozeHours?: number
  snoozedBy?: Person
  closedBy?: Person
  spam?: boolean
  priority?: boolean
  starred?: boolean
  pinned?: boolean
  /** Unread for the current user */
  unread?: boolean
  messages: MsgSpec[]
  comments?: CommentSpec[]
  draft?: { by: Person; body: string; at: number }
  scheduled?: { by: Person; body: string; at: number; inHours: number }
}

const CONVERSATIONS: ConvSpec[] = [
  {
    key: "brightpath-sync",
    inbox: "support",
    subject: "Shopify orders stopped syncing since this morning",
    contact: "hannah",
    status: "open",
    assignees: ["me"],
    assignedBy: "maya",
    labels: ["urgent", "bug"],
    priority: true,
    starred: true,
    pinned: true,
    unread: true,
    messages: [
      {
        at: 5.2,
        body: "Hi Northwind team,\n\nSince around 7am today none of our new Shopify orders are showing up in Northwind. The last order that synced is #10482, and Shopify shows 60+ orders since then.\n\nWe're in the middle of our autumn promo, so our warehouse team is currently picking from printed Shopify lists. Could you take a look as soon as possible?\n\nThanks,\nHannah Weber\nOperations Manager, Brightpath Outfitters",
      },
      {
        out: "sara",
        at: 4.6,
        body: "Hi Hannah,\n\nThanks for flagging this so quickly. I can see that webhook deliveries from your store started failing at 06:52 with an expired access token, which is why new orders stopped coming in.\n\nI've re-authorised the connection and started a backfill for everything after #10482. It should finish in about 20 minutes. I'll confirm here once it's done.",
      },
      {
        out: "sara",
        at: 4.1,
        body: "Quick update: the backfill has finished and all 64 missing orders are now in Northwind. New orders are syncing in real time again.\n\nSorry for the disruption during your promo week!",
      },
      {
        at: 2.8,
        attach: "screenshot",
        body: "Thanks Sara, orders are coming in again!\n\nOne odd thing though: a few of the backfilled orders show a quantity of 0 for some line items, e.g. #10497 and #10501. Screenshot attached.\n\nCould you check those before our afternoon pick run at 3pm?\n\nHannah",
      },
    ],
    comments: [
      {
        by: "sara",
        at: 4.4,
        body: "Token refresh failed for their store at 06:52, same pattern as Alpine Gear last week. @{me} could this be related to the Shopify API version bump?",
        reactions: [["maya", "👀"]],
      },
      {
        by: "maya",
        at: 2.5,
        body: "Third store this week. Assigning this to you since you're on the API migration. I created a follow-up task so we don't lose track.",
        reactions: [["sara", "🙏"]],
      },
    ],
  },
  {
    key: "verde-refund",
    inbox: "support",
    subject: "Invoice INV-2291 charged twice",
    contact: "tomas",
    status: "closed",
    assignees: ["sara"],
    assignedBy: "maya",
    ruleLabel: true,
    closedBy: "sara",
    messages: [
      {
        at: 75,
        attach: "invoice",
        body: "Hello,\n\nOur card was charged twice for invoice INV-2291 ($249.00) on September 14. I've attached the invoice; both charges show up on our bank statement.\n\nCould you please refund the duplicate charge?\n\nBest regards,\nTomás García\nFinance Lead, Verde Botanicals",
      },
      {
        out: "sara",
        at: 71,
        body: "Hi Tomás,\n\nYou're absolutely right, and I'm sorry about that. Our payment provider retried a charge that had already gone through.\n\nI've refunded the duplicate $249.00 to the card ending in 4417. Depending on your bank it should show up on your statement within 5–10 business days. I've also added a note to your account so this can't happen again at the next renewal.",
      },
      { at: 66, body: "Perfect, thank you for sorting this out so quickly!\n\nTomás" },
    ],
    comments: [
      {
        by: "sara",
        at: 72,
        body: "Confirmed in the billing dashboard: duplicate charge from the retry job on the 14th. Refund issued. @{maya} might be worth checking whether other customers were hit by the same retry.",
        reactions: [["maya", "👍"]],
      },
      { by: "maya", at: 70, body: "Checked: 3 other accounts had the same retry. I'll reach out to them proactively." },
    ],
  },
  {
    key: "lumen-warehouses",
    inbox: "support",
    subject: "Question about multi-warehouse support",
    contact: "priya",
    status: "open",
    assignees: ["maya"],
    assignedBy: "maya",
    labels: ["feature"],
    messages: [
      {
        at: 50,
        body: "Hi there,\n\nWe're expanding and will soon run two warehouses: our existing one in New Jersey and a new 3PL in Rotterdam for EU orders.\n\nCan Northwind manage stock across both locations and route orders to the right warehouse based on the shipping country?\n\nThanks!\nPriya Raman\nHead of E-commerce, Lumen Home",
      },
      {
        out: "maya",
        at: 47.5,
        body: "Hi Priya,\n\nCongrats on the expansion! Yes, multi-warehouse inventory is available on the Growth plan. You can track stock per location, transfer between warehouses and show combined availability in your storefront.\n\nAutomatic routing by shipping country isn't available yet; today you'd pick the fulfilling warehouse per order (or in bulk). Region-based routing is on our roadmap and I've added your use case to the request.",
      },
      {
        at: 20,
        body: "That's great to hear, thanks Maya.\n\nIs there an ETA for region-based routing? Honestly, it's the one thing holding us back from moving our EU store over to Northwind.\n\nPriya",
      },
    ],
    comments: [
      {
        by: "maya",
        at: 19,
        body: "@{leo} Lumen would upgrade to Growth if we can give them a rough ETA for routing. Do you know if it made the Q4 plan?",
      },
      {
        by: "leo",
        at: 17.5,
        body: "Product confirmed it's scheduled for November 🎉 I'd say \"before the end of November\" rather than promising a date.",
        reactions: [["maya", "🙌"]],
      },
    ],
    draft: {
      by: "maya",
      at: 16,
      body: "Hi Priya,\n\nGood news: region-based routing is scheduled to ship before the end of November. You'll be able to define rules like \"EU shipping countries → Rotterdam\" and Northwind will pick the warehouse automatically.\n\nIf it helps, I'm happy to set up your Rotterdam location now so your team can start transferring stock ahead of the launch.",
    },
  },
  {
    key: "harbor-export",
    inbox: "support",
    subject: "CSV export times out for large catalogs",
    contact: "daniel",
    status: "open",
    assignees: ["sara"],
    assignedBy: "maya",
    labels: ["bug"],
    messages: [
      {
        at: 38,
        attach: "csv",
        body: "Hey,\n\nExporting our full product catalog (~48k SKUs) to CSV spins for about a minute and then fails with \"Request timed out\". Smaller filtered exports work fine.\n\nI've attached the first rows of a partial export that came through once, in case it helps. We need the full export for our weekly sync to the ERP.\n\nCheers,\nDaniel Kim\nHarbor & Pine",
      },
      {
        out: "sara",
        at: 33,
        body: "Hi Daniel,\n\nThanks for the detailed report. I was able to reproduce this with a 50k SKU test catalog: exports currently run synchronously, so very large catalogs hit the timeout.\n\nWe're moving exports to a background job that emails you a download link when the file is ready. Until that ships, the most reliable workaround is the API with cursor pagination:\n\nGET /v2/products?limit=500&cursor=…\n\nLet me know if you'd like a small script for that.",
      },
      {
        at: 6,
        body: "The API workaround works well, thanks. We'll use that for now and switch back once the background export is live.\n\nDaniel",
      },
    ],
    comments: [
      {
        by: "sara",
        at: 32,
        body: "Filed ENG-1182 for background exports. @{omar} FYI Harbor & Pine's renewal is next month, keep an eye on this one.",
        reactions: [["omar", "👍"]],
      },
    ],
  },
  {
    key: "alpine-sso",
    inbox: "sales",
    subject: "SAML SSO with Okta on our plan?",
    contact: "jonas",
    status: "open",
    assignees: ["leo"],
    assignedBy: "leo",
    labels: ["vip"],
    messages: [
      {
        at: 98,
        body: "Hello,\n\nWe're rolling out Okta across the company and need SSO for all SaaS tools by the end of the quarter.\n\nIs SAML SSO available on the Business plan, or only on Enterprise? We currently have 35 seats.\n\nBest,\nJonas Becker\nIT Director, Alpine Gear Supply",
      },
      {
        out: "leo",
        at: 95,
        body: "Hi Jonas,\n\nThanks for reaching out! SAML SSO (Okta, Microsoft Entra ID and Google Workspace) and SCIM provisioning are part of our Enterprise plan.\n\nFor 35 seats there's a good middle ground. I'd love to walk you through the options and the rollout. Do you have 30 minutes this week?",
      },
      {
        at: 74,
        cc: ["katrin"],
        body: "Thursday at 3pm CET works for us. I've added our security lead, Katrin, who will join the call.\n\nJonas",
      },
      {
        out: "leo",
        at: 72,
        cc: ["katrin"],
        body: "Perfect. Invite sent to you and Katrin for Thursday, 3pm CET. I'll bring our security whitepaper and a sandbox with SSO enabled so you can test the Okta setup live.",
      },
    ],
    comments: [
      {
        by: "leo",
        at: 71,
        body: "Call booked for Thursday. @{sara} can you join? They'll have detailed questions about SCIM provisioning.",
        reactions: [["sara", "👍"]],
      },
    ],
  },
  {
    key: "summit-security",
    inbox: "sales",
    subject: "Vendor security questionnaire – Summit Supply Group",
    contact: "ben",
    status: "open",
    assignees: ["leo"],
    assignedBy: "leo",
    labels: ["vip"],
    messages: [
      {
        at: 52,
        attach: "questionnaire",
        body: "Hi Leo,\n\nAs discussed, our procurement team requires all new vendors to complete the attached security questionnaire before we can sign the agreement.\n\nCould you return it by Friday? Happy to jump on a call if any questions are unclear.\n\nKind regards,\nBen Thompson\nProcurement Manager, Summit Supply Group",
      },
      {
        out: "leo",
        at: 49,
        body: "Hi Ben,\n\nThanks, received! We'll have the questionnaire back to you by Thursday. I'll also include our latest SOC 2 Type II report and pen-test summary, which should answer most of section 3.",
      },
    ],
    comments: [
      { by: "leo", at: 48.5, body: "@{maya} do we have the latest SOC 2 report handy? Last time we sent it via the trust portal." },
      {
        by: "maya",
        at: 46,
        body: "Yes, it's in the Security folder (2026 report). I can fill in sections 4–6 on data retention.",
        reactions: [["leo", "🙏"]],
      },
    ],
  },
  {
    key: "driftwood-refund",
    inbox: "support",
    subject: "Refund for our annual plan?",
    contact: "mia",
    status: "open",
    assignedBy: "maya",
    labels: ["billing"],
    unread: true,
    messages: [
      {
        at: 9,
        body: "Hi,\n\nWe've made the difficult decision to close our shop at the end of next month (sad, I know!). We renewed our annual Starter plan about three weeks ago.\n\nIs a prorated refund for the remaining months possible? We'll keep using Northwind until we close.\n\nThank you for everything,\nMia Novak\nDriftwood Candle Co.",
      },
    ],
  },
  {
    key: "solsalt-password",
    inbox: "support",
    subject: "Password reset email never arrives",
    contact: "isabella",
    status: "open",
    assignedBy: "maya",
    labels: ["urgent"],
    priority: true,
    unread: true,
    messages: [
      {
        at: 1.6,
        body: "Hi,\n\nI've tried resetting my password four times this morning but the email never arrives (I checked spam and promotions too).\n\nI'm locked out and need to print today's packing slips before the courier comes at 2pm. Can you help?\n\nIsabella Moreno\nSol & Salt",
      },
    ],
  },
  {
    key: "crestline-webhooks",
    inbox: "support",
    subject: "Webhook deliveries failing with 401",
    contact: "ethan",
    status: "open",
    assignees: ["sara"],
    assignedBy: "sara",
    labels: ["bug"],
    snoozeHours: 17,
    snoozedBy: "sara",
    messages: [
      {
        at: 80,
        body: "Hi team,\n\nSince yesterday afternoon every webhook we receive from Northwind fails our signature check, so our endpoint responds with 401 and orders aren't reaching our fulfilment service.\n\nNothing changed on our side as far as I can tell. Did something change on yours?\n\nEthan Walsh\nCTO, Crestline Apparel",
      },
      {
        out: "sara",
        at: 77,
        body: "Hi Ethan,\n\nYes, we rotated webhook signing secrets for all accounts on Tuesday as part of a scheduled security update. It was announced in the changelog, but I realise that's easy to miss.\n\nYou can copy the new secret from Settings → Developers → Webhooks. Failed deliveries are retried for 72 hours, so nothing will be lost once your endpoint accepts the new signature.",
      },
      {
        at: 26,
        body: "Thanks Sara. We'll rotate the secret on our side during tomorrow's maintenance window and let you know once it's done.\n\nEthan",
      },
    ],
    comments: [{ by: "sara", at: 25, body: "Snoozing until after their maintenance window. Retries are still queued for them." }],
  },
  {
    key: "kindred-feedback",
    inbox: "support",
    subject: "Love the new picking app!",
    contact: "aisha",
    status: "closed",
    assignees: ["maya"],
    assignedBy: "maya",
    labels: ["feedback"],
    closedBy: "maya",
    messages: [
      {
        at: 146,
        body: "Hi Northwind folks,\n\nJust wanted to say our warehouse team LOVES the new picking app. Picking time per order dropped from about 4 minutes to under 2.\n\nOne tiny wish: a confirmation sound when a barcode scan succeeds. In a noisy warehouse it's hard to keep an eye on the screen all the time.\n\nThanks again!\nAisha Bello\nCustomer Experience Lead, Kindred Kids",
      },
      {
        out: "maya",
        at: 143,
        body: "Hi Aisha,\n\nThis made our day, thank you! Halving picking time is exactly what we hoped for.\n\nI've passed your idea about scan sounds to our mobile team. Good news: haptic and sound feedback is already in testing and should land in the next app update.",
      },
    ],
    comments: [
      {
        by: "maya",
        at: 142,
        body: "Sharing with the product team: halved picking time! 🎉",
        reactions: [
          ["sara", "❤️"],
          ["omar", "❤️"],
          ["leo", "🎉"],
        ],
      },
    ],
  },
  {
    key: "nimbus-growth",
    inbox: "sales",
    subject: "Upgrading to Growth – pricing for 12 users",
    contact: "grace",
    status: "open",
    assignees: ["leo"],
    assignedBy: "leo",
    unread: true,
    messages: [
      {
        at: 28,
        body: "Hi,\n\nWe're currently on Starter with 5 users and would like to move to Growth with 12 users next month.\n\nCould you send over pricing? We'd also like to know whether there's a discount for paying annually.\n\nThanks,\nGrace Liu\nGrowth Lead, Nimbus Tea",
      },
      {
        out: "leo",
        at: 25,
        body: "Hi Grace,\n\nGreat to hear Nimbus is growing! Growth is $39 per user per month on monthly billing, so $468/month for 12 users.\n\nOn annual billing you get two months free, which brings it to $4,680 per year. I can also include a free onboarding session for your new team members.",
      },
      {
        at: 4.5,
        body: "Thanks Leo, that sounds good. Could you send a formal quote for the annual option? Our finance team needs it for approval.\n\nGrace",
      },
    ],
    scheduled: {
      by: "leo",
      at: 3.9,
      inHours: 15,
      body: "Hi Grace,\n\nAs promised, here's the formal quote for Growth (12 users, annual billing): $4,680 per year, including a free onboarding session.\n\nThe quote is valid for 30 days. Let me know if your finance team needs anything else!",
    },
  },
  {
    key: "atlas-demo",
    inbox: "sales",
    subject: "Demo request – inventory for 40 locations",
    contact: "olivia",
    status: "open",
    assignees: ["me"],
    assignedBy: "leo",
    labels: ["vip"],
    starred: true,
    unread: true,
    messages: [
      {
        at: 7,
        body: "Hello,\n\nAtlas Fitness operates 40 gyms with retail corners (supplements, apparel, accessories). Today every location manages stock in spreadsheets, and we're looking for a central inventory system.\n\nWould you be available for a demo next week? Ideally Tuesday or Wednesday afternoon.\n\nBest,\nOlivia Brooks\nVP Operations, Atlas Fitness Co.",
      },
    ],
    comments: [
      {
        by: "leo",
        at: 6,
        body: "@{me} this is a big one, 40 locations! Want to run the demo together? I can take pricing, you take the multi-location setup.",
        reactions: [
          ["omar", "🔥"],
          ["maya", "🔥"],
        ],
      },
    ],
  },
  {
    key: "pixelforge-partner",
    inbox: "sales",
    subject: "Partnership inquiry – PixelForge Studio",
    contact: "lucas",
    status: "open",
    messages: [
      {
        at: 55,
        body: "Hi Northwind team,\n\nWe're a small agency building online stores for independent retailers, and many of our clients ask us which inventory tool to use. We've recommended Northwind a few times already!\n\nDo you have a partner or referral programme? We'd love to make it official.\n\nBest,\nLucas Silva\nPartnerships, PixelForge Studio",
      },
      {
        out: "leo",
        at: 51,
        body: "Hi Lucas,\n\nThank you for the recommendations, that's great to hear! We're launching a partner programme next month with referral commissions and a partner dashboard.\n\nI'll make sure you're in the first cohort. Could you share roughly how many new stores you launch per quarter?",
      },
      { at: 30, body: "Around 15–20 per quarter. Looking forward to hearing more!\n\nLucas" },
    ],
  },
  {
    key: "fieldnote-tax",
    inbox: "support",
    subject: "Accounting sync: tax lines missing on invoices",
    contact: "emily",
    status: "open",
    assignees: ["omar"],
    assignedBy: "maya",
    labels: ["bug"],
    ruleLabel: true,
    snoozeHours: 41,
    snoozedBy: "omar",
    messages: [
      {
        at: 122,
        body: "Hi,\n\nSince last week, invoices synced from Northwind to our accounting software are missing the tax lines. Totals are correct, but the tax breakdown is gone, and our accountant needs it for the quarterly filing.\n\nCan you look into it?\n\nThanks,\nEmily Carter\nCOO, Fieldnote Paper Co.",
      },
      {
        out: "omar",
        at: 118,
        body: "Hi Emily,\n\nThanks for letting us know. I've reproduced it: tax lines are dropped when an order mixes taxable and tax-exempt items. Our engineers are working on a fix and I'll update you as soon as it's deployed.",
      },
      { at: 97, body: "Thanks Omar. Any update? Our filing deadline is at the end of the month.\n\nEmily" },
      {
        out: "omar",
        at: 84,
        body: "Hi Emily,\n\nThe fix was deployed this morning. I re-synced all your invoices from the past 30 days and the tax lines are now included.\n\nCould you check one or two invoices and confirm everything looks right on your end?",
      },
    ],
  },
  {
    key: "maison-gdpr",
    inbox: "support",
    subject: "Account deletion request (GDPR)",
    contact: "chloe",
    status: "closed",
    assignees: ["maya"],
    assignedBy: "maya",
    closedBy: "maya",
    messages: [
      {
        at: 190,
        body: "Bonjour,\n\nWe have migrated to another system and would like to request the deletion of our Maison Lumière account and all associated data, in accordance with the GDPR.\n\nMerci,\nChloé Martin\nDirectrice e-commerce, Maison Lumière",
      },
      {
        out: "maya",
        at: 186,
        signoff: "Merci et bonne continuation,",
        body: "Bonjour Chloé,\n\nThank you for your message, we're sorry to see you go. We've scheduled the deletion of your account and all associated data. It will be completed within 30 days, and you'll receive a confirmation email once it's done.\n\nIf you need an export of your data before then, just reply to this email.",
      },
      { at: 180, body: "Parfait, merci beaucoup.\n\nChloé" },
    ],
  },
  {
    key: "tidewater-crash",
    inbox: "support",
    subject: "Mobile app crashes when scanning barcodes",
    contact: "ryan",
    status: "open",
    assignees: ["sara"],
    assignedBy: "maya",
    labels: ["bug"],
    unread: true,
    messages: [
      {
        at: 26,
        body: "Hey,\n\nThe Northwind app crashes every time I scan a barcode on the Receiving screen. It worked fine until yesterday's update. I'm on an iPhone 15 with the latest iOS.\n\nWe have a big delivery coming in tomorrow morning, so I'd really appreciate a quick fix.\n\nRyan O'Connor\nTidewater Surf",
      },
      {
        out: "sara",
        at: 22,
        body: "Hi Ryan,\n\nSorry about that! Could you send me the diagnostics code from Settings → About → Send diagnostics in the app? That shows us exactly where it crashes.\n\nIn the meantime, scanning from the Products screen still works and you can receive stock from there.",
      },
      { at: 3.5, body: "Here's the diagnostics code: NW-7F3A-22C9.\n\nThe Products screen workaround works, thanks.\n\nRyan" },
    ],
    comments: [
      {
        by: "sara",
        at: 3,
        body: "Crash is in the camera permission check on the new iOS build. Fix is in review and should ship in 4.2.2 tomorrow.",
        reactions: [["maya", "🚀"]],
      },
    ],
  },
  {
    key: "wagner-api",
    inbox: "support",
    subject: "Bulk price updates via the API?",
    contact: "felix",
    status: "open",
    messages: [
      {
        at: 29,
        body: "Hi,\n\nWe're changing prices on about 1,200 products next week. Is there a way to update prices in bulk via the API instead of editing each product?\n\nIf so, is there a rate limit I should be aware of?\n\nThanks,\nFelix Wagner\nWagner Bikes",
      },
    ],
  },
  {
    key: "evergreen-trial",
    inbox: "sales",
    subject: "Trial extension?",
    contact: "nora",
    status: "closed",
    assignees: ["leo"],
    assignedBy: "leo",
    closedBy: "leo",
    messages: [
      {
        at: 170,
        body: "Hi,\n\nOur 14-day trial ends on Friday, but half our team was away at a trade show this week and we haven't finished testing the purchasing workflow.\n\nWould it be possible to extend the trial by a week or two?\n\nThanks,\nNora Ahmed\nCustomer Success, Evergreen Pet Supply",
      },
      {
        out: "leo",
        at: 166,
        body: "Hi Nora,\n\nOf course! I've extended your trial by 14 days. If it helps, Omar from our Customer Success team can walk your team through purchasing in a 30-minute call.",
      },
      { at: 160, body: "That's very kind, thank you! We'll reach out to Omar.\n\nNora" },
    ],
  },
  {
    key: "rossi-invite",
    inbox: "support",
    subject: "Can't invite a new team member",
    contact: "sofia",
    status: "closed",
    assignees: ["me"],
    assignedBy: "me",
    closedBy: "me",
    messages: [
      {
        at: 100,
        body: "Hello,\n\nI'm trying to invite our new shop assistant, but the Invite button is greyed out. What am I doing wrong?\n\nSofia Rossi\nRossi Ceramics",
      },
      {
        out: "me",
        at: 97,
        body: "Hi Sofia,\n\nYou're not doing anything wrong! Your Starter plan includes 3 users and all seats are in use, which is why the button is disabled.\n\nYou can either remove a user you no longer need under Settings → Team, or add an extra seat for $12/month under Settings → Billing. Let me know if you'd like me to add the seat for you.",
      },
      {
        at: 95,
        body: "Ah, that makes sense. I've removed our old intern's account and the invite worked. Grazie!\n\nSofia",
      },
    ],
  },
  {
    key: "copperleaf-alerts",
    inbox: "support",
    subject: "Low-stock alerts are flooding our inbox",
    contact: "marcus",
    status: "open",
    assignees: ["maya"],
    assignedBy: "maya",
    labels: ["feature"],
    messages: [
      {
        at: 64,
        body: "Hi,\n\nWe get a separate email for every product that drops below its reorder point. Yesterday that was 47 emails. It's becoming noise and the team has started ignoring them.\n\nIs there a way to get one summary instead?\n\nMarcus Johnson\nFounder, Copperleaf Coffee",
      },
      {
        out: "maya",
        at: 60,
        body: "Hi Marcus,\n\nTotally fair! You can switch alerts to a digest under Settings → Notifications → Low stock. Choose \"Hourly summary\" and you'll get one email listing every product that dropped below its reorder point.",
      },
      {
        at: 44,
        body: "Hourly is better, thanks! Any chance of a daily digest at a fixed time, e.g. 8am? That's when we place our orders with suppliers.\n\nMarcus",
      },
    ],
    comments: [
      {
        by: "maya",
        at: 43,
        body: "A daily digest at a fixed time has come up 5 times this month. Adding Copperleaf to the feature request.",
      },
    ],
  },
  {
    key: "lumen-billing-address",
    inbox: "support",
    subject: "Update billing address on invoices",
    contact: "priya",
    status: "closed",
    assignees: ["sara"],
    assignedBy: "maya",
    ruleLabel: true,
    closedBy: "sara",
    messages: [
      {
        at: 212,
        body: "Hi,\n\nCould you update the billing address on our invoices to our new office?\n\nLumen Home Ltd.\n48 Mercer Street, Floor 3\nNew York, NY 10013\n\nThanks,\nPriya",
      },
      {
        out: "sara",
        at: 209,
        body: "Hi Priya,\n\nDone! Your billing address has been updated and future invoices will show the new office. I've also re-issued your last invoice with the new address; you'll find it under Settings → Billing.",
      },
    ],
  },
  {
    key: "spam-crypto",
    inbox: "support",
    subject: "🎁 You've been selected for a 2,500 USDT reward",
    contact: "spammer",
    status: "open",
    spam: true,
    messages: [
      {
        at: 14,
        body: "Congratulations!\n\nYour email was randomly selected to receive 2,500 USDT. To claim your reward, verify your wallet within 24 hours using the link below.\n\nClaim now: http://win-crypto-now.demo/claim\n\nThis offer expires soon.",
      },
    ],
  },
  {
    key: "wildflower-labels",
    inbox: "support",
    subject: "Printing shipping labels in bulk",
    contact: "zoe",
    status: "open",
    assignees: ["omar"],
    assignedBy: "maya",
    messages: [
      {
        at: 47,
        body: "Hi,\n\nIs it possible to print shipping labels for all of today's orders at once? Right now we open each order individually, which takes forever on busy days.\n\nZoe Adams\nOperations Coordinator, Wildflower Studio",
      },
      {
        out: "omar",
        at: 44,
        body: "Hi Zoe,\n\nYes! In Orders, filter by \"Ready to ship\", select all orders (Shift + A) and choose Print labels. Northwind generates a single PDF with all labels in the order you selected.",
      },
      {
        at: 21,
        body: "That works, thank you! One more thing: the labels come out as A4, but we use a 4x6\" thermal printer. Can we change the label size?\n\nZoe",
      },
    ],
  },
  {
    key: "lumen-onboarding",
    inbox: "support",
    subject: "Onboarding call – recap and next steps",
    contact: "priya",
    status: "closed",
    assignees: ["omar"],
    assignedBy: "omar",
    closedBy: "omar",
    messages: [
      {
        out: "omar",
        at: 236,
        body: "Hi Priya,\n\nThanks for your time today! Here's a quick recap of what we covered:\n\n1. Shopify connection and initial product import (done)\n2. Reorder points for your top 50 products\n3. Purchase orders and supplier management\n\nI'll check in next week to see how the first purchase orders went. Don't hesitate to reach out in the meantime.",
      },
      {
        at: 230,
        body: "Thanks Omar, super helpful session. The team is already creating their first purchase orders!\n\nPriya",
      },
    ],
  },
  {
    key: "brume-wholesale",
    inbox: "support",
    subject: "Customer-specific wholesale price lists?",
    contact: "hugo",
    status: "open",
    assignedBy: "maya",
    labels: ["feature"],
    unread: true,
    messages: [
      {
        at: 11,
        body: "Bonjour,\n\nWe sell coffee to about 30 cafés, and each one has negotiated its own prices. Can Northwind store a price list per wholesale customer and apply it automatically to their orders?\n\nMerci,\nHugo Lefèvre\nCafé Brume",
      },
    ],
  },
  {
    key: "kente-count",
    inbox: "support",
    subject: "Quantities doubled after last stock count",
    contact: "samuel",
    status: "open",
    assignees: ["sara"],
    assignedBy: "maya",
    unread: true,
    messages: [
      {
        at: 10,
        body: "Hi,\n\nAfter our stock count on Sunday, several products show exactly double the quantity we counted. For example, we counted 24 Adinkra tote bags and Northwind shows 48.\n\nCould the count have been saved twice?\n\nSamuel Osei\nFounder, Kente Collective",
      },
    ],
    comments: [
      {
        by: "sara",
        at: 8,
        body: "Looks like the count was saved offline and then merged twice when the device reconnected. @{maya} have we seen this before?",
      },
      {
        by: "maya",
        at: 7.5,
        body: "Once, in July. Engineering added a dedupe check, but maybe not for offline counts. Can you revert the second count from the stock history?",
        reactions: [["sara", "👍"]],
      },
    ],
  },
  {
    key: "bergmann-renewal",
    inbox: "sales",
    subject: "Renewal quote for 2027",
    contact: "laura",
    status: "open",
    assignees: ["leo"],
    assignedBy: "leo",
    labels: ["vip"],
    starred: true,
    messages: [
      {
        at: 73,
        body: "Dear Leo,\n\nOur contract renews on 1 January. Could you send us a renewal quote for 2027 for our current 60 users?\n\nWe're also considering a two-year commitment if the pricing works.\n\nKind regards,\nLaura Fischer\nPurchasing, Bergmann Tools",
      },
      {
        out: "leo",
        at: 62,
        signoff: "Kind regards,",
        body: "Dear Laura,\n\nThank you for your continued trust in Northwind! For 60 users on Business with annual billing, the 2027 renewal is $36,000, unchanged from this year.\n\nFor a two-year commitment we can offer an additional discount. I'll confirm the exact figure shortly.",
      },
      {
        at: 25,
        body: "Thanks Leo. Could you do 15% for a two-year commitment? That would make approval on our side much easier.\n\nLaura",
      },
    ],
    comments: [
      {
        by: "leo",
        at: 24,
        body: "@{me} are we OK going to 12% for a two-year commitment? They've been a customer since 2023 and plan to grow to 80 seats next year.",
      },
    ],
  },
  {
    key: "brightpath-2fa",
    inbox: "support",
    subject: "Enforcing 2FA for our staff",
    contact: "hannah",
    status: "closed",
    assignees: ["maya"],
    assignedBy: "maya",
    closedBy: "maya",
    messages: [
      {
        at: 158,
        body: "Hi,\n\nOur insurance now requires two-factor authentication for all staff accounts. Can we enforce 2FA for everyone in our Northwind workspace?\n\nHannah",
      },
      {
        out: "maya",
        at: 155,
        body: "Hi Hannah,\n\nYes: go to Settings → Security and turn on \"Require two-factor authentication\". Team members without 2FA will be asked to set it up the next time they sign in.\n\nYou can see who has already enabled it under Settings → Team.",
      },
      { at: 150, body: "Done, that was easy. Thanks Maya!" },
    ],
  },
  {
    key: "copperleaf-report",
    inbox: "support",
    subject: "Weekly sales report doesn't match Shopify",
    contact: "marcus",
    status: "open",
    assignees: ["me"],
    assignedBy: "maya",
    messages: [
      {
        at: 31,
        body: "Hi,\n\nOur weekly sales report in Northwind shows $18,240 for last week, but Shopify says $18,915. Which one is right?\n\nMarcus",
      },
      {
        out: "me",
        at: 27,
        body: "Hi Marcus,\n\nGood question! Both are right, they just use different time zones: your Northwind workspace reports in UTC, while your Shopify store uses Pacific time, so a few hours of Sunday orders land in different weeks.\n\nYou can change the reporting time zone under Settings → General → Time zone. After that, both reports will match.",
      },
    ],
  },
  {
    key: "solsalt-bundles",
    inbox: "support",
    subject: "Feature idea: bundles & kits",
    contact: "isabella",
    status: "closed",
    assignees: ["maya"],
    assignedBy: "maya",
    labels: ["feature"],
    closedBy: "maya",
    messages: [
      {
        at: 136,
        body: "Hi!\n\nWe sell gift boxes that combine 3–4 of our products. Right now we have to adjust the stock of each item manually when a box sells.\n\nAny plans to support bundles or kits that deduct stock from their components automatically?\n\nIsabella\nSol & Salt",
      },
      {
        out: "maya",
        at: 131,
        body: "Hi Isabella,\n\nBundles are one of our most requested features, and I'm happy to say they're in development! Selling a bundle will automatically deduct stock from each component.\n\nI've added you to the early access list, so you'll be among the first to try it.",
      },
    ],
  },
]

const CHAT_GENERAL: CommentSpec[] = [
  {
    by: "maya",
    at: 50,
    body: "Morning all ☀️ Reminder: the support rota changes next week. The new schedule is pinned in the shared drive.",
    reactions: [["sara", "👍"]],
  },
  {
    by: "leo",
    at: 47,
    body: "Big week for sales: Atlas Fitness and Bergmann Tools are both in the pipeline 🎯",
    reactions: [
      ["maya", "🔥"],
      ["omar", "🔥"],
    ],
  },
  {
    by: "sara",
    at: 23,
    body: "Heads up: the Shopify API version bump is causing token refresh failures for some stores. Workaround: re-authorise the connection from the admin. Engineering is on it.",
    reactions: [["me", "👀"]],
  },
  {
    by: "omar",
    at: 3.8,
    body: "Nice work on the Brightpath backfill @{sara} 🙌",
    reactions: [
      ["maya", "🙌"],
      ["me", "🙌"],
    ],
  },
  { by: "maya", at: 2.2, body: "Reminder: team retro on Friday at 4pm. Add your topics to the doc!" },
]

const CHAT_DM: CommentSpec[] = [
  { by: "maya", at: 26, body: "Hey! Do you have 10 minutes today to go over the Q4 support goals?" },
  { by: "me", at: 25.5, body: "Sure, 2pm works?" },
  { by: "maya", at: 25.4, body: "Perfect, I'll send an invite 👍" },
  {
    by: "maya",
    at: 1.1,
    body: "Btw, Brightpath looks stable again. Thanks for jumping on it so quickly.",
    reactions: [["me", "🙏"]],
  },
]

type TaskSpec = {
  title: string
  description?: string
  status: "todo" | "in_progress" | "done"
  assignee: Person | null
  team?: Inbox
  /** Due date offset in days (negative = overdue) */
  dueDays?: number
  conv?: string
  createdBy: Person
  createdHours: number
  completedHours?: number
}

const TASKS: TaskSpec[] = [
  {
    title: "Check backfilled Brightpath orders with quantity 0",
    description:
      "Hannah reported quantity 0 on #10497 and #10501 after the backfill. Verify the line items against Shopify and confirm before their 3pm pick run.",
    status: "in_progress",
    assignee: "me",
    team: "support",
    dueDays: 0,
    conv: "brightpath-sync",
    createdBy: "maya",
    createdHours: 2.5,
  },
  {
    title: "Return security questionnaire to Summit Supply",
    description: "Sections 1–3: Leo. Sections 4–6 (data retention): Maya. Attach the 2026 SOC 2 Type II report.",
    status: "todo",
    assignee: "leo",
    team: "sales",
    dueDays: 2,
    conv: "summit-security",
    createdBy: "leo",
    createdHours: 48,
  },
  {
    title: "Refund duplicate charges for accounts hit by the retry bug",
    description: "Three other accounts were double-charged by the retry job on the 14th. Refund and email each of them.",
    status: "done",
    assignee: "maya",
    team: "support",
    dueDays: -2,
    conv: "verde-refund",
    createdBy: "sara",
    createdHours: 70,
    completedHours: 60,
  },
  {
    title: "Write help-center article: multi-warehouse setup",
    description:
      "Cover creating locations, transferring stock and combined availability. Link it from the Growth plan page.",
    status: "todo",
    assignee: "maya",
    team: "support",
    dueDays: 6,
    createdBy: "maya",
    createdHours: 46,
  },
  {
    title: "Prepare two-year renewal proposal for Bergmann Tools",
    description: "Laura asked for 15%. Get approval for 12% and include the 80-seat expansion.",
    status: "todo",
    assignee: "leo",
    team: "sales",
    dueDays: -1,
    conv: "bergmann-renewal",
    createdBy: "leo",
    createdHours: 24,
  },
  {
    title: "Reproduce CSV export timeout (ENG-1182)",
    status: "in_progress",
    assignee: "sara",
    team: "support",
    dueDays: 0,
    conv: "harbor-export",
    createdBy: "sara",
    createdHours: 32,
  },
  {
    title: "Update canned responses for the new pricing",
    description: "Growth is now $39/user. Update \"Demo follow-up\" and the pricing FAQ snippets.",
    status: "todo",
    assignee: "me",
    createdBy: "maya",
    createdHours: 20,
  },
  {
    title: "Prepare Atlas Fitness demo (multi-location setup)",
    description: "Sandbox with 3 sample locations, transfers between gyms and a combined stock dashboard.",
    status: "todo",
    assignee: "me",
    team: "sales",
    dueDays: 3,
    conv: "atlas-demo",
    createdBy: "leo",
    createdHours: 5.5,
  },
]

const CANNED_RESPONSES = [
  {
    name: "Refund processed",
    shortcut: "refund",
    subject: null,
    usageCount: 14,
    body: "<p>Hi {{contact.first_name}},</p><p>Good news: your refund has been processed. Depending on your bank, it should appear on your statement within 5–10 business days.</p><p>If there's anything else I can help with, just reply to this email.</p><p>Best,<br>{{user.first_name}}</p>",
  },
  {
    name: "Bug acknowledged",
    shortcut: "bug",
    subject: null,
    usageCount: 22,
    body: "<p>Hi {{contact.first_name}},</p><p>Thanks for the detailed report! I was able to reproduce the issue and have passed it on to our engineering team with all the details.</p><p>I'll keep this conversation open and update you as soon as a fix is available.</p><p>Best,<br>{{user.first_name}}</p>",
  },
  {
    name: "Demo follow-up",
    shortcut: "demo",
    subject: "Following up on our demo",
    usageCount: 9,
    body: "<p>Hi {{contact.first_name}},</p><p>Thanks again for taking the time to see Northwind in action! As promised, here's a quick summary:</p><ul><li>Central inventory across all your locations</li><li>Automatic reorder points and purchase orders</li><li>Real-time sync with your online store</li></ul><p>I've set up a 14-day trial workspace for your team. Would a short onboarding call next week be helpful?</p><p>Best,<br>{{user.first_name}}</p>",
  },
]

/* -------------------------------------------------------------------------- */
/*                               Attachment files                             */
/* -------------------------------------------------------------------------- */

type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number; x?: number }

/** Minimal single-page PDF (Helvetica, WinAnsi) — enough for a realistic preview. */
function makePdf(lines: PdfLine[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  let y = 790
  const ops: string[] = []
  for (const l of lines) {
    y -= l.gap ?? Math.round((l.size ?? 10) * 1.6)
    if (l.text === "---") {
      ops.push(`0.85 G 0.8 w 56 ${y + 4} m 539 ${y + 4} l S 0 G`)
      continue
    }
    ops.push(`BT /${l.bold ? "F2" : "F1"} ${l.size ?? 10} Tf ${l.x ?? 56} ${y} Td (${esc(l.text)}) Tj ET`)
  }
  const content = ops.join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ]
  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, "latin1")
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, "latin1")
}

function invoicePdf(): Buffer {
  const row = (a: string, b: string, c: string, d: string): PdfLine[] => [
    { text: a, gap: 20 },
    { text: b, x: 330, gap: 0 },
    { text: c, x: 400, gap: 0 },
    { text: d, x: 480, gap: 0 },
  ]
  return makePdf([
    { text: "Northwind", size: 22, bold: true, gap: 20 },
    { text: "Inventory & order management", size: 9, gap: 14 },
    { text: "INVOICE", size: 14, bold: true, x: 440, gap: 0 },
    { text: "---", gap: 22 },
    { text: "Invoice number: INV-2291", gap: 18 },
    { text: "Invoice date: September 14, 2026" },
    { text: "Billed to: Verde Botanicals S.L., Calle de Alcala 112, 28009 Madrid, Spain" },
    { text: "---", gap: 24 },
    { text: "Description", bold: true, gap: 16 },
    { text: "Qty", bold: true, x: 330, gap: 0 },
    { text: "Unit", bold: true, x: 400, gap: 0 },
    { text: "Amount", bold: true, x: 480, gap: 0 },
    ...row("Northwind Growth plan (monthly), 5 users", "5", "$39.00", "$195.00"),
    ...row("Additional warehouse location", "1", "$29.00", "$29.00"),
    ...row("Priority support add-on", "1", "$25.00", "$25.00"),
    { text: "---", gap: 22 },
    { text: "Total due", bold: true, x: 400, gap: 18 },
    { text: "$249.00", bold: true, x: 480, gap: 0 },
    { text: "Paid by card ending in 4417 on September 14, 2026.", size: 9, gap: 40 },
    { text: "Questions? billing@northwind.demo", size: 9 },
  ])
}

function questionnairePdf(): Buffer {
  return makePdf([
    { text: "Summit Supply Group", size: 18, bold: true, gap: 20 },
    { text: "Vendor Security Questionnaire (v3.2)", size: 12 },
    { text: "---", gap: 22 },
    { text: "Vendor: Northwind Inc.        Due: Friday", gap: 18 },
    { text: "1. Governance", bold: true, size: 11, gap: 28 },
    { text: "1.1 Do you maintain a documented information security policy?  [ ] Yes  [ ] No" },
    { text: "1.2 Name of the person responsible for information security:" },
    { text: "2. Access control", bold: true, size: 11, gap: 28 },
    { text: "2.1 Is multi-factor authentication enforced for all employees?" },
    { text: "2.2 Do you support SAML single sign-on for customers?" },
    { text: "3. Certifications & testing", bold: true, size: 11, gap: 28 },
    { text: "3.1 Please attach your most recent SOC 2 Type II report or ISO 27001 certificate." },
    { text: "3.2 Date of the last external penetration test:" },
    { text: "4. Data retention & deletion", bold: true, size: 11, gap: 28 },
    { text: "4.1 How long is customer data retained after contract termination?" },
    { text: "4.2 Where is customer data stored (regions / sub-processors)?" },
    { text: "5. Incident response", bold: true, size: 11, gap: 28 },
    { text: "5.1 Maximum time to notify customers of a security incident:" },
    { text: "Please return the completed form to procurement@summitsupply.demo", size: 9, gap: 40 },
  ])
}

function catalogCsv(): Buffer {
  const rows = [
    ["sku", "title", "variant", "price", "stock", "location", "barcode"],
    ["HP-1001", "Walnut Serving Board", "Large", "68.00", "42", "Portland", "0850012340017"],
    ["HP-1002", "Walnut Serving Board", "Small", "48.00", "57", "Portland", "0850012340024"],
    ["HP-1010", "Linen Table Runner", "Oat", "36.00", "120", "Portland", "0850012340109"],
    ["HP-1011", "Linen Table Runner", "Charcoal", "36.00", "88", "Portland", "0850012340116"],
    ["HP-1020", "Stoneware Mug", "Sand", "24.00", "310", "Portland", "0850012340208"],
    ["HP-1021", "Stoneware Mug", "Moss", "24.00", "0", "Portland", "0850012340215"],
    ["HP-1030", "Beeswax Candle Set", "3-pack", "29.00", "64", "Seattle", "0850012340307"],
    ["HP-1040", "Cedar Coat Hooks", "Set of 4", "54.00", "19", "Seattle", "0850012340406"],
    ["HP-1050", "Wool Throw Blanket", "Natural", "129.00", "23", "Seattle", "0850012340505"],
    ["HP-1051", "Wool Throw Blanket", "Slate", "129.00", "11", "Seattle", "0850012340512"],
    ["HP-1060", "Ceramic Planter", "Medium", "42.00", "76", "Portland", "0850012340604"],
    ["HP-1061", "Ceramic Planter", "Large", "58.00", "38", "Portland", "0850012340611"],
    ["HP-1070", "Enamel Colander", "White", "46.00", "0", "Seattle", "0850012340703"],
  ]
  return Buffer.from(rows.map((r) => r.join(",")).join("\n") + "\nHP-1080,Brass Bottle Op", "utf8")
}

// 5x7 bitmap glyphs (rows of 5 bits) for the generated screenshot
const GLYPHS: Record<string, string> = {
  A: "01110100011000111111100011000110001",
  B: "11110100011000111110100011000111110",
  C: "01110100011000010000100001000101110",
  D: "11110100011000110001100011000111110",
  E: "11111100001000011110100001000011111",
  F: "11111100001000011110100001000010000",
  G: "01110100011000010111100011000101111",
  H: "10001100011000111111100011000110001",
  I: "01110001000010000100001000010001110",
  J: "00111000100001000010000101001001100",
  K: "10001100101010011000101001001010001",
  L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001",
  N: "10001100011100110101100111000110001",
  O: "01110100011000110001100011000101110",
  P: "11110100011000111110100001000010000",
  Q: "01110100011000110001101011001001101",
  R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110",
  T: "11111001000010000100001000010000100",
  U: "10001100011000110001100011000101110",
  V: "10001100011000110001100010101000100",
  W: "10001100011000110101101011010101010",
  X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100",
  Z: "11111000010001000100010001000011111",
  "0": "01110100011001110101110011000101110",
  "1": "00100011000010000100001000010001110",
  "2": "01110100010000100010001000100011111",
  "3": "11111000100010000010000011000101110",
  "4": "00010001100101010010111110001000010",
  "5": "11111100001111000001000011000101110",
  "6": "00110010001000011110100011000101110",
  "7": "11111000010001000100010000100001000",
  "8": "01110100011000101110100011000101110",
  "9": "01110100011000101111000010001001100",
  "#": "01010010101111101010111110101001010",
  "-": "00000000000000011111000000000000000",
  ":": "00000011000110000000011000110000000",
  ".": "00000000000000000000000000110001100",
  $: "00100011111010001110001011111000100",
  "/": "00001000100001000100010000100010000",
  " ": "00000000000000000000000000000000000",
}

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A small generated "screenshot" of an order with a zero-quantity line highlighted. */
function screenshotPng(): Buffer {
  const W = 640
  const Hh = 360
  const px = Buffer.alloc(W * Hh * 3)
  const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    const [r, g, b] = hex(color)
    for (let yy = Math.max(0, y); yy < Math.min(Hh, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
        const i = (yy * W + xx) * 3
        px[i] = r
        px[i + 1] = g
        px[i + 2] = b
      }
  }
  const text = (x: number, y: number, s: string, color: string, scale = 2) => {
    let cx = x
    for (const ch of s.toUpperCase()) {
      const g = GLYPHS[ch] ?? GLYPHS[" "]!
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 5; col++) if (g[row * 5 + col] === "1") rect(cx + col * scale, y + row * scale, scale, scale, color)
      cx += 6 * scale
    }
  }
  rect(0, 0, W, Hh, "#f4f2ef")
  rect(0, 0, W, 44, "#1c1c1c")
  rect(16, 14, 16, 16, "#22c55e")
  text(42, 15, "NORTHWIND", "#ffffff")
  text(170, 15, "ORDERS", "#9ca3af")
  rect(24, 64, W - 48, 272, "#ffffff")
  text(44, 84, "ORDER #10497", "#1c1c1c", 3)
  rect(300, 84, 118, 22, "#fef3c7")
  text(308, 89, "BACKFILLED", "#92400e")
  text(44, 124, "BRIGHTPATH OUTFITTERS - 3 ITEMS", "#6b7280")
  rect(44, 152, W - 88, 30, "#f3f4f6")
  text(56, 160, "SKU", "#6b7280")
  text(200, 160, "PRODUCT", "#6b7280")
  text(520, 160, "QTY", "#6b7280")
  const rows: [string, string, string, boolean][] = [
    ["BP-2291", "TRAIL JACKET M", "0", true],
    ["BP-1180", "WOOL BEANIE", "2", false],
    ["BP-3307", "HIKING SOCKS L", "0", true],
  ]
  rows.forEach(([sku, name, qty, bad], i) => {
    const y = 190 + i * 40
    if (bad) rect(44, y, W - 88, 34, "#fee2e2")
    rect(44, y + 36, W - 88, 1, "#e5e7eb")
    text(56, y + 10, sku, "#1c1c1c")
    text(200, y + 10, name, "#1c1c1c")
    text(526, y + 10, qty, bad ? "#dc2626" : "#1c1c1c")
  })
  const raw = Buffer.alloc((W * 3 + 1) * Hh)
  for (let y = 0; y < Hh; y++) {
    raw[y * (W * 3 + 1)] = 0
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(Hh, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

const ATTACHMENTS: Record<AttachmentKind, { filename: string; contentType: string; build: () => Buffer }> = {
  screenshot: { filename: "order-10497.png", contentType: "image/png", build: screenshotPng },
  invoice: { filename: "INV-2291.pdf", contentType: "application/pdf", build: invoicePdf },
  csv: { filename: "catalog-export-partial.csv", contentType: "text/csv", build: catalogCsv },
  questionnaire: {
    filename: "Vendor-Security-Questionnaire.pdf",
    contentType: "application/pdf",
    build: questionnairePdf,
  },
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const uuid = () => crypto.randomUUID()

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

function snippetOf(text: string, max = 180) {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function domainOf(email: string) {
  return email.split("@")[1] ?? DEMO_DOMAIN
}

function messageIdFor(domain: string) {
  return `${Date.now().toString(36)}.${crypto.randomBytes(6).toString("hex")}@mail.${domain}`
}

type Manifest = {
  version: 1
  seededAt: string
  seededBy: string
  teamIds: string[]
  labelIds: string[]
  cannedResponseIds: string[]
  signatureIds: string[]
  ruleIds: string[]
  taskIds: string[]
  userIds: string[]
}

async function demoConversationIds(orgId: string, tx: DbOrTx = db) {
  const demoAccounts = await tx
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.orgId, orgId), eq(schema.accounts.provider, "demo")))
  const accountIds = demoAccounts.map((a) => a.id)
  const convs = await tx
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.orgId, orgId),
        or(
          like(schema.conversations.providerThreadId, `${THREAD_PREFIX}%`),
          accountIds.length ? inArray(schema.conversations.accountId, accountIds) : sql`false`
        )
      )
    )
  return { accountIds, conversationIds: convs.map((c) => c.id) }
}

/** True when demo data was seeded into the workspace (and not removed since). */
export async function hasDemoData(orgId: string, tx: DbOrTx = db): Promise<boolean> {
  const [acc] = await tx
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.orgId, orgId), eq(schema.accounts.provider, "demo")))
    .limit(1)
  if (acc) return true
  const [conv] = await tx
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.orgId, orgId), like(schema.conversations.providerThreadId, `${THREAD_PREFIX}%`)))
    .limit(1)
  return Boolean(conv)
}

/* -------------------------------------------------------------------------- */
/*                                    Seed                                    */
/* -------------------------------------------------------------------------- */

/**
 * Fill a workspace with a realistic demo (teammates, two shared inboxes, ~30
 * conversations, chats, contacts, tasks, responses, a rule and a signature).
 * `userId` is the member who asked for it: they get assignments, mentions and
 * notifications so the workspace feels alive. Safe to call twice.
 */
export async function seedDemoData(
  orgId: string,
  userId: string
): Promise<{ conversations: number; skipped?: boolean }> {
  if (await hasDemoData(orgId)) {
    const { conversationIds } = await demoConversationIds(orgId)
    return { conversations: conversationIds.length, skipped: true }
  }

  const [me] = await db
    .select({ user: schema.users, membership: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)))
    .limit(1)
  if (!me) throw new Error("seedDemoData: user is not a member of the workspace")

  // Store attachment files first (storage is not transactional).
  const stored = {} as Record<AttachmentKind, { key: string; size: number; filename: string; contentType: string }>
  for (const [kind, def] of Object.entries(ATTACHMENTS) as [AttachmentKind, (typeof ATTACHMENTS)[AttachmentKind]][]) {
    const buf = def.build()
    const key = makeStorageKey(orgId, def.filename)
    await putObject(key, buf, def.contentType)
    stored[kind] = { key, size: buf.length, filename: def.filename, contentType: def.contentType }
  }

  let result: { conversations: number; manifest: Manifest } | null
  try {
    result = await db.transaction(async (tx) => {
      // Serialize concurrent seeds for the same workspace
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dispatch:demo:${orgId}`}))`)
      if (await hasDemoData(orgId, tx)) return null
      return seedInTransaction(tx, orgId, me.user, me.membership, stored)
    })
  } catch (err) {
    await Promise.all(Object.values(stored).map((s) => deleteObject(s.key).catch(() => {})))
    throw err
  }

  if (!result) {
    await Promise.all(Object.values(stored).map((s) => deleteObject(s.key).catch(() => {})))
    const { conversationIds } = await demoConversationIds(orgId)
    return { conversations: conversationIds.length, skipped: true }
  }

  for (const type of ["conversation.created", "labels.updated", "task.updated", "account.updated", "org.updated"] as const) {
    await publish({ orgId, type, actorId: userId })
  }
  await publish({ orgId, type: "notification.created", userIds: [userId] })
  return { conversations: result.conversations }
}

async function seedInTransaction(
  tx: DbOrTx,
  orgId: string,
  meUser: typeof schema.users.$inferSelect,
  meMembership: typeof schema.memberships.$inferSelect,
  stored: Record<AttachmentKind, { key: string; size: number; filename: string; contentType: string }>
): Promise<{ conversations: number; manifest: Manifest }> {
  const now = Date.now()
  const ago = (hours: number) => new Date(now - hours * H)
  const clampPast = (d: Date) => (d.getTime() > now - 60_000 ? new Date(now - 60_000) : d)
  const manifest: Manifest = {
    version: 1,
    seededAt: new Date(now).toISOString(),
    seededBy: meUser.id,
    teamIds: [],
    labelIds: [],
    cannedResponseIds: [],
    signatureIds: [],
    ruleIds: [],
    taskIds: [],
    userIds: [],
  }

  /* ------------------------------ Teammates ------------------------------ */
  // Demo teammates are shared across workspaces: serialize with removals elsewhere
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dispatch:demo-users'))`)
  const memberRole = await tx.query.roles.findFirst({
    where: and(eq(schema.roles.orgId, orgId), eq(schema.roles.key, "member")),
  })
  if (!memberRole) throw new Error("seedDemoData: workspace has no member role")

  const people = {} as Record<Person, { id: string; name: string; first: string; title: string }>
  const meName = meUser.name?.trim() || meUser.email.split("@")[0]!.replace(/^./, (c) => c.toUpperCase())
  people.me = { id: meUser.id, name: meName, first: meName.split(/\s+/)[0]!, title: meMembership.title || "Northwind team" }

  for (const [key, t] of Object.entries(TEAMMATES) as [Teammate, (typeof TEAMMATES)[Teammate]][]) {
    let user = await tx.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${t.email}` })
    if (!user) {
      ;[user] = await tx
        .insert(schema.users)
        .values({ email: t.email, name: t.name, timezone: t.timezone, lastSeenAt: ago(Math.random() * 3) })
        .returning()
      manifest.userIds.push(user!.id)
    }
    await tx
      .insert(schema.memberships)
      .values({ orgId, userId: user!.id, roleId: memberRole.id, title: t.title, createdAt: ago(24 * 60) })
      .onConflictDoNothing()
    people[key] = { id: user!.id, name: t.name, first: t.name.split(" ")[0]!, title: t.title }
  }
  const pid = (p: Person) => people[p].id

  /* -------------------------------- Teams -------------------------------- */
  const existingTeams = await tx.select().from(schema.teams).where(eq(schema.teams.orgId, orgId))
  const teamIds = {} as Record<Inbox, string>
  const teamDefs: Record<Inbox, { name: string; description: string; color: string; members: [Person, boolean][] }> = {
    support: {
      name: "Support",
      description: "Customer support for all Northwind plans",
      color: "#0ea5e9",
      members: [
        ["maya", true],
        ["sara", false],
        ["omar", false],
        ["me", false],
      ],
    },
    sales: {
      name: "Sales",
      description: "New business, renewals and partnerships",
      color: "#f59e0b",
      members: [
        ["leo", true],
        ["omar", false],
        ["me", false],
      ],
    },
  }
  for (const [key, def] of Object.entries(teamDefs) as [Inbox, (typeof teamDefs)[Inbox]][]) {
    const found = existingTeams.find((t) => t.name.toLowerCase() === def.name.toLowerCase())
    if (found) teamIds[key] = found.id
    else {
      const [team] = await tx
        .insert(schema.teams)
        .values({ orgId, name: def.name, description: def.description, color: def.color })
        .returning({ id: schema.teams.id })
      teamIds[key] = team!.id
      manifest.teamIds.push(team!.id)
    }
    // Existing (real) teams only get the demo teammates, never leads and never
    // the current user, so removing the demo leaves real access unchanged.
    const members = found ? def.members.filter(([p]) => p !== "me").map(([p]) => [p, false] as const) : def.members
    await tx
      .insert(schema.teamMembers)
      .values(members.map(([p, isLead]) => ({ teamId: teamIds[key], userId: pid(p), isLead })))
      .onConflictDoNothing()
  }

  /* -------------------------------- Labels ------------------------------- */
  const existingLabels = await tx
    .select({ id: schema.labels.id, name: schema.labels.name, position: schema.labels.position })
    .from(schema.labels)
    .where(and(eq(schema.labels.orgId, orgId), eq(schema.labels.visibility, "shared")))
  let position = existingLabels.reduce((m, l) => Math.max(m, l.position), -1) + 1
  const labelIds = {} as Record<LabelKey, string>
  for (const [key, def] of Object.entries(LABELS) as [LabelKey, (typeof LABELS)[LabelKey]][]) {
    const found = existingLabels.find((l) => l.name.toLowerCase() === def.name.toLowerCase())
    if (found) labelIds[key] = found.id
    else {
      const [label] = await tx
        .insert(schema.labels)
        .values({ orgId, name: def.name, color: def.color, position: position++ })
        .returning({ id: schema.labels.id })
      labelIds[key] = label!.id
      manifest.labelIds.push(label!.id)
    }
  }

  /* ------------------------- Signature & inboxes ------------------------- */
  const signatureId = uuid()
  await tx.insert(schema.signatures).values({
    id: signatureId,
    orgId,
    name: "Northwind team signature",
    body: '<p>{{user.name}}<br><span style="color:#6b7280">{{user.title}} · Northwind</span><br><a href="https://northwind.demo">northwind.demo</a></p>',
    isDefault: true,
  })
  manifest.signatureIds.push(signatureId)

  const accounts: Record<Inbox, { id: string; email: string; fromName: string; team: string }> = {
    support: { id: uuid(), email: `support@${DEMO_DOMAIN}`, fromName: "Northwind Support", team: "Support" },
    sales: { id: uuid(), email: `sales@${DEMO_DOMAIN}`, fromName: "Northwind Sales", team: "Sales" },
  }
  await tx.insert(schema.accounts).values([
    {
      id: accounts.support.id,
      orgId,
      teamId: teamIds.support,
      provider: "demo",
      name: "Support",
      email: accounts.support.email,
      fromName: accounts.support.fromName,
      color: "#0ea5e9",
      status: "active",
      lastSyncedAt: new Date(now),
      signatureId,
      createdAt: ago(24 * 60),
    },
    {
      id: accounts.sales.id,
      orgId,
      teamId: teamIds.sales,
      provider: "demo",
      name: "Sales",
      email: accounts.sales.email,
      fromName: accounts.sales.fromName,
      color: "#f59e0b",
      status: "active",
      lastSyncedAt: new Date(now),
      signatureId,
      createdAt: ago(24 * 60),
    },
  ])
  await tx.insert(schema.accountAccess).values([
    { accountId: accounts.support.id, teamId: teamIds.support, level: "reply" },
    { accountId: accounts.sales.id, teamId: teamIds.sales, level: "reply" },
    { accountId: accounts.support.id, userId: pid("maya"), level: "manage" },
    { accountId: accounts.sales.id, userId: pid("leo"), level: "manage" },
  ])

  /* --------------------------------- Rule -------------------------------- */
  const ruleId = uuid()
  const ruleName = "Tag billing emails"
  const ruleRuns = CONVERSATIONS.filter((c) => c.ruleLabel)
  await tx.insert(schema.rules).values({
    id: ruleId,
    orgId,
    name: ruleName,
    description: "Adds the Billing label to incoming emails about invoices.",
    trigger: "incoming",
    conditions: { match: "any", conditions: [{ field: "subject", operator: "contains", value: "invoice" }] },
    actions: [{ type: "add_label", labelId: labelIds.billing }],
    // Only the demo inboxes, so the rule never touches real mail
    accountIds: [accounts.support.id, accounts.sales.id],
    runCount: ruleRuns.length,
    lastRunAt: ruleRuns.length ? ago(Math.min(...ruleRuns.map((c) => c.messages[0]!.at))) : null,
    createdBy: meUser.id,
    createdAt: ago(24 * 30),
  })
  manifest.ruleIds.push(ruleId)

  /* ---------------------------- Conversations ---------------------------- */
  const contactSpec = (k: ContactKey): ContactSpec => (k === "spammer" ? SPAMMER : CONTACTS[k])
  const contactStats = new Map<string, { count: number; last: Date }>()
  const bumpContact = (email: string, at: Date) => {
    const s = contactStats.get(email)
    if (!s) contactStats.set(email, { count: 1, last: at })
    else {
      s.count++
      if (at > s.last) s.last = at
    }
  }

  const convRows: (typeof schema.conversations.$inferInsert)[] = []
  const messageRows: (typeof schema.messages.$inferInsert)[] = []
  const attachmentRows: (typeof schema.attachments.$inferInsert)[] = []
  const commentRows: (typeof schema.comments.$inferInsert)[] = []
  const reactionRows: (typeof schema.reactions.$inferInsert)[] = []
  const eventRows: (typeof schema.conversationEvents.$inferInsert)[] = []
  const assigneeRows: (typeof schema.conversationAssignees.$inferInsert)[] = []
  const labelRows: (typeof schema.conversationLabels.$inferInsert)[] = []
  const stateRows: (typeof schema.conversationUserState.$inferInsert)[] = []
  const notificationRows: (typeof schema.notifications.$inferInsert)[] = []
  const convIds = new Map<string, string>()

  const renderComment = (body: string) => {
    const mentions: string[] = []
    const html = escapeHtml(body).replace(/@\{(me|maya|leo|sara|omar)\}/g, (_, p: Person) => {
      mentions.push(pid(p))
      const label = escapeHtml(people[p].name)
      return `<span data-type="mention" data-id="${pid(p)}" data-label="${label}">@${label}</span>`
    })
    const plain = body.replace(/@\{(me|maya|leo|sara|omar)\}/g, (_, p: Person) => `@${people[p].name}`)
    return { html: `<p>${html}</p>`, plain, mentions: [...new Set(mentions)] }
  }

  const addComments = (conversationId: string, specs: CommentSpec[], subject: string, number: number | null) => {
    for (const c of specs) {
      const id = uuid()
      const { html, plain, mentions } = renderComment(c.body)
      const createdAt = ago(c.at)
      commentRows.push({ id, orgId, conversationId, authorId: pid(c.by), body: html, mentions, createdAt })
      for (const [p, emoji] of c.reactions ?? []) {
        reactionRows.push({ commentId: id, userId: pid(p), emoji, createdAt: clampPast(new Date(createdAt.getTime() + 0.2 * H)) })
      }
      if (mentions.includes(meUser.id) && c.by !== "me") {
        notificationRows.push({
          orgId,
          userId: meUser.id,
          type: "mention",
          actorId: pid(c.by),
          conversationId,
          commentId: id,
          title: `${people[c.by].name} mentioned you${number ? ` in #${number}` : ""}`,
          body: plain,
          data: { subject },
          readAt: c.at > 20 ? ago(c.at - 1) : null,
          createdAt,
        })
      }
    }
  }

  // Oldest first so conversation numbers follow creation time
  const specs = [...CONVERSATIONS].sort((a, b) => b.messages[0]!.at - a.messages[0]!.at)
  for (const spec of specs) {
    const id = uuid()
    convIds.set(spec.key, id)
    const number = await nextConversationNumber(orgId, tx)
    const account = accounts[spec.inbox]
    const customer = contactSpec(spec.contact)
    const participants = new Map<string, { name: string; email: string }>()
    participants.set(customer.email, { name: customer.name, email: customer.email })

    let prev: { messageId: string; references: string[]; id: string } | null = null
    let lastInbound: { id: string; messageId: string; references: string[] } | null = null
    let firstInboundAt: Date | null = null
    let firstResponseAt: Date | null = null
    let lastInboundAt: Date | null = null
    let lastOutboundAt: Date | null = null
    let lastMessage: { at: Date; snippet: string } | null = null
    let hasAttachments = false

    spec.messages.forEach((m, i) => {
      const at = ago(m.at)
      const msgId = uuid()
      const outbound = Boolean(m.out)
      const sender = m.from ? contactSpec(m.from) : customer
      const cc = (m.cc ?? []).map((k) => contactSpec(k))
      for (const p of cc) participants.set(p.email, { name: p.name, email: p.email })
      const signoff = outbound
        ? `\n\n${m.signoff ?? "Best,"}\n${people[m.out!].name}\n${people[m.out!].title} · Northwind`
        : ""
      const text = m.body + signoff
      const rfcId = messageIdFor(outbound ? DEMO_DOMAIN : domainOf(sender.email))
      const references = prev ? [...prev.references, prev.messageId] : []
      const attachment = m.attach ? stored[m.attach] : null
      messageRows.push({
        id: msgId,
        orgId,
        conversationId: id,
        accountId: account.id,
        direction: outbound ? "outbound" : "inbound",
        status: outbound ? "sent" : "received",
        messageId: rfcId,
        inReplyTo: prev?.messageId ?? null,
        references,
        fromName: outbound ? people[m.out!].name : sender.name,
        fromEmail: outbound ? account.email : sender.email,
        to: outbound
          ? [{ name: customer.name, email: customer.email }]
          : [{ name: account.fromName, email: account.email }],
        cc: cc.map((p) => ({ name: p.name, email: p.email })),
        subject: i === 0 ? spec.subject : `Re: ${spec.subject}`,
        textBody: text,
        htmlBody: textToHtml(text),
        snippet: snippetOf(text),
        hasAttachments: Boolean(attachment),
        authorId: outbound ? pid(m.out!) : null,
        sentAt: outbound ? at : null,
        receivedAt: outbound ? null : at,
        size: Buffer.byteLength(text) + (attachment?.size ?? 0),
        createdAt: at,
        updatedAt: at,
      })
      if (attachment) {
        hasAttachments = true
        attachmentRows.push({
          orgId,
          messageId: msgId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
          storageKey: attachment.key,
          createdAt: at,
        })
      }
      // Contact stats (the spammer is not added to the address book)
      if (spec.contact !== "spammer") {
        if (outbound) {
          bumpContact(customer.email, at)
          for (const p of cc) bumpContact(p.email, at)
        } else {
          bumpContact(sender.email, at)
        }
      }
      if (outbound) {
        lastOutboundAt = at
        if (firstInboundAt && !firstResponseAt) firstResponseAt = at
      } else {
        firstInboundAt ??= at
        lastInboundAt = at
        lastInbound = { id: msgId, messageId: rfcId, references }
      }
      lastMessage = { at, snippet: snippetOf(m.body) }
      prev = { messageId: rfcId, references, id: msgId }
    })

    const firstAt = ago(spec.messages[0]!.at)
    const lastMsg = lastMessage! as { at: Date; snippet: string }
    let lastActivity = lastMsg.at.getTime()
    const touch = (d: Date) => {
      lastActivity = Math.max(lastActivity, d.getTime())
      return d
    }

    // Assignments
    const assignedBy = spec.assignedBy ?? (spec.inbox === "sales" ? "leo" : "maya")
    const firstOut = spec.messages.find((m) => m.out)
    const assignAt = clampPast(
      new Date(firstAt.getTime() + Math.min(0.25 * H, firstOut ? (spec.messages[0]!.at - firstOut.at) * H * 0.5 : 0.25 * H))
    )
    for (const a of spec.assignees ?? []) {
      assigneeRows.push({ conversationId: id, userId: pid(a), assignedBy: pid(assignedBy), createdAt: assignAt })
      eventRows.push({
        orgId,
        conversationId: id,
        actorId: pid(assignedBy),
        type: "assigned",
        data: { userId: pid(a), userName: people[a].name },
        createdAt: touch(assignAt),
      })
      if (a === "me" && assignedBy !== "me") {
        notificationRows.push({
          orgId,
          userId: meUser.id,
          type: "assigned",
          actorId: pid(assignedBy),
          conversationId: id,
          title: `${people[assignedBy].name} assigned #${number} to you`,
          body: spec.subject,
          data: { subject: spec.subject },
          readAt: spec.unread ? null : clampPast(new Date(assignAt.getTime() + H)),
          createdAt: assignAt,
        })
      }
    }

    // Labels (rule first, then manual)
    if (spec.ruleLabel) {
      const at = clampPast(new Date(firstAt.getTime() + 1000))
      labelRows.push({ conversationId: id, labelId: labelIds.billing, addedBy: null, createdAt: at })
      eventRows.push({ orgId, conversationId: id, actorId: null, type: "rule_applied", data: { ruleId, ruleName }, createdAt: touch(at) })
      eventRows.push({
        orgId,
        conversationId: id,
        actorId: null,
        type: "labeled",
        data: { labelId: labelIds.billing, labelName: LABELS.billing.name, color: LABELS.billing.color },
        createdAt: at,
      })
    }
    for (const l of spec.labels ?? []) {
      if (spec.ruleLabel && l === "billing") continue
      const at = clampPast(new Date(assignAt.getTime() + 60_000))
      labelRows.push({ conversationId: id, labelId: labelIds[l], addedBy: pid(assignedBy), createdAt: at })
      eventRows.push({
        orgId,
        conversationId: id,
        actorId: pid(assignedBy),
        type: "labeled",
        data: { labelId: labelIds[l], labelName: LABELS[l].name, color: LABELS[l].color },
        createdAt: touch(at),
      })
    }

    // Comments
    if (spec.comments) {
      addComments(id, spec.comments, spec.subject, number)
      for (const c of spec.comments) touch(ago(c.at))
    }

    // Closed / snoozed
    let closedAt: Date | null = null
    const closedBy = spec.status === "closed" ? (spec.closedBy ?? spec.assignees?.[0] ?? assignedBy) : null
    if (closedBy) {
      closedAt = touch(clampPast(new Date(lastMsg.at.getTime() + 0.4 * H)))
      eventRows.push({ orgId, conversationId: id, actorId: pid(closedBy), type: "closed", data: {}, createdAt: closedAt })
    }
    let snoozedUntil: Date | null = null
    if (spec.snoozeHours) {
      snoozedUntil = new Date(now + spec.snoozeHours * H)
      const at = touch(clampPast(new Date(lastActivity + 0.1 * H)))
      eventRows.push({
        orgId,
        conversationId: id,
        actorId: pid(spec.snoozedBy ?? assignedBy),
        type: "snoozed",
        data: { until: snoozedUntil.toISOString() },
        createdAt: at,
      })
    }

    // Shared draft & scheduled reply
    if (spec.draft) {
      const at = ago(spec.draft.at)
      messageRows.push({
        orgId,
        conversationId: id,
        accountId: account.id,
        direction: "outbound",
        status: "draft",
        fromName: people[spec.draft.by].name,
        fromEmail: account.email,
        to: [{ name: customer.name, email: customer.email }],
        subject: `Re: ${spec.subject}`,
        textBody: spec.draft.body,
        htmlBody: textToHtml(spec.draft.body),
        snippet: snippetOf(spec.draft.body),
        authorId: pid(spec.draft.by),
        isSharedDraft: true,
        draftVersion: 3,
        lastEditedBy: pid(spec.draft.by),
        replyToMessageId: (lastInbound as { id: string } | null)?.id ?? null,
        createdAt: at,
        updatedAt: at,
      })
    }
    if (spec.scheduled) {
      const at = ago(spec.scheduled.at)
      const text = `${spec.scheduled.body}\n\nBest,\n${people[spec.scheduled.by].name}\n${people[spec.scheduled.by].title} · Northwind`
      const p = prev as { messageId: string; references: string[] } | null
      messageRows.push({
        orgId,
        conversationId: id,
        accountId: account.id,
        direction: "outbound",
        status: "scheduled",
        messageId: messageIdFor(DEMO_DOMAIN),
        inReplyTo: p?.messageId ?? null,
        references: p ? [...p.references, p.messageId] : [],
        fromName: people[spec.scheduled.by].name,
        fromEmail: account.email,
        to: [{ name: customer.name, email: customer.email }],
        subject: `Re: ${spec.subject}`,
        textBody: text,
        htmlBody: textToHtml(text),
        snippet: snippetOf(text),
        authorId: pid(spec.scheduled.by),
        replyToMessageId: (lastInbound as { id: string } | null)?.id ?? null,
        sendAt: new Date(now + spec.scheduled.inHours * H),
        createdAt: at,
        updatedAt: at,
      })
    }

    const lastActivityAt = new Date(lastActivity)
    convRows.push({
      id,
      orgId,
      number,
      kind: "email",
      accountId: account.id,
      teamId: teamIds[spec.inbox],
      subject: spec.subject,
      snippet: lastMsg.snippet,
      status: spec.status,
      isSpam: Boolean(spec.spam),
      snoozedUntil,
      snoozedBy: snoozedUntil ? pid(spec.snoozedBy ?? assignedBy) : null,
      priority: Boolean(spec.priority),
      participants: [...participants.values()],
      messageCount: spec.messages.length,
      commentCount: spec.comments?.length ?? 0,
      hasAttachments,
      lastMessageAt: lastMsg.at,
      lastInboundAt,
      lastOutboundAt,
      lastActivityAt,
      firstResponseAt,
      closedAt,
      closedBy: closedBy ? pid(closedBy) : null,
      providerThreadId: `${THREAD_PREFIX}${spec.key}`,
      createdBy: spec.messages[0]!.out ? pid(spec.messages[0]!.out) : null,
      createdAt: firstAt,
      updatedAt: lastActivityAt,
    })

    const involvesMe =
      spec.assignees?.includes("me") ||
      spec.messages.some((m) => m.out === "me") ||
      spec.comments?.some((c) => c.body.includes("@{me}"))
    stateRows.push({
      conversationId: id,
      userId: meUser.id,
      unread: Boolean(spec.unread),
      lastReadAt: spec.unread ? (lastOutboundAt ?? null) : lastActivityAt,
      starred: Boolean(spec.starred),
      pinned: Boolean(spec.pinned),
      following: Boolean(involvesMe),
      updatedAt: lastActivityAt,
    })
  }

  /* -------------------------------- Chats -------------------------------- */
  const orgMembers = await tx
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.status, "active")))
  const chats: { key: string; subject: string; members: string[]; comments: CommentSpec[] }[] = [
    { key: "chat-general", subject: "general", members: orgMembers.map((m) => m.userId), comments: CHAT_GENERAL },
    { key: "chat-dm-maya", subject: "", members: [meUser.id, pid("maya")], comments: CHAT_DM },
  ]
  for (const chat of chats) {
    const id = uuid()
    const number = await nextConversationNumber(orgId, tx)
    addComments(id, chat.comments, chat.subject ? `#${chat.subject}` : people.maya.name, null)
    const last = chat.comments[chat.comments.length - 1]!
    const lastAt = ago(last.at)
    convRows.push({
      id,
      orgId,
      number,
      kind: "chat",
      subject: chat.subject,
      snippet: snippetOf(renderComment(last.body).plain),
      status: "open",
      chatMemberIds: [...new Set(chat.members)],
      commentCount: chat.comments.length,
      lastMessageAt: lastAt,
      lastActivityAt: lastAt,
      providerThreadId: `${THREAD_PREFIX}${chat.key}`,
      createdBy: pid("maya"),
      createdAt: ago(24 * 45),
      updatedAt: lastAt,
    })
    const unread = last.by !== "me"
    stateRows.push({
      conversationId: id,
      userId: meUser.id,
      unread,
      lastReadAt: unread ? ago(chat.comments.find((c) => c.by === "me")?.at ?? 30) : lastAt,
      following: true,
      updatedAt: lastAt,
    })
  }

  /* ------------------------------- Contacts ------------------------------ */
  const contactRows: (typeof schema.contacts.$inferInsert)[] = Object.values(CONTACTS).map((c: ContactSpec) => {
    const stats = contactStats.get(c.email)
    return {
      orgId,
      email: c.email,
      name: c.name,
      company: c.company ?? null,
      title: c.title ?? null,
      phone: c.phone ?? null,
      notes: c.notes ?? null,
      tags: c.tags ?? [],
      customFields: c.customFields ?? {},
      lastContactedAt: stats?.last ?? null,
      messageCount: stats?.count ?? 0,
      createdAt: ago(24 * 40),
      updatedAt: stats?.last ?? ago(24 * 40),
    }
  })
  contactRows.push({
    orgId,
    ownerUserId: meUser.id,
    email: "jordan@ellisadvisory.demo",
    name: "Jordan Ellis",
    company: "Ellis Advisory",
    title: "Board advisor",
    notes: "Private contact: only visible to you.",
    tags: ["advisor"],
    createdAt: ago(24 * 20),
  })

  /* ------------------------ Inserts (dependency order) ------------------- */
  const chunked = async <T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 200) await insert(rows.slice(i, i + 200))
  }
  await tx.insert(schema.contacts).values(contactRows).onConflictDoNothing()
  await chunked(convRows, (b) => tx.insert(schema.conversations).values(b))
  await chunked(messageRows, (b) => tx.insert(schema.messages).values(b))
  if (attachmentRows.length) await tx.insert(schema.attachments).values(attachmentRows)
  await chunked(commentRows, (b) => tx.insert(schema.comments).values(b))
  if (reactionRows.length) await tx.insert(schema.reactions).values(reactionRows).onConflictDoNothing()
  await chunked(eventRows, (b) => tx.insert(schema.conversationEvents).values(b))
  if (assigneeRows.length) await tx.insert(schema.conversationAssignees).values(assigneeRows).onConflictDoNothing()
  if (labelRows.length) await tx.insert(schema.conversationLabels).values(labelRows).onConflictDoNothing()
  await tx.insert(schema.conversationUserState).values(stateRows).onConflictDoNothing()

  /* -------------------------------- Tasks -------------------------------- */
  const dayAt = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(17, 0, 0, 0)
    return d
  }
  const positions: Record<string, number> = {}
  const taskRows = TASKS.map((t) => {
    const id = uuid()
    manifest.taskIds.push(id)
    return {
      id,
      orgId,
      conversationId: t.conv ? (convIds.get(t.conv) ?? null) : null,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      assigneeId: t.assignee ? pid(t.assignee) : null,
      teamId: t.team ? teamIds[t.team] : null,
      dueAt: t.dueDays === undefined ? null : dayAt(t.dueDays),
      completedAt: t.completedHours ? ago(t.completedHours) : null,
      position: (positions[t.status] = (positions[t.status] ?? -1) + 1),
      createdBy: pid(t.createdBy),
      createdAt: ago(t.createdHours),
      updatedAt: t.completedHours ? ago(t.completedHours) : ago(t.createdHours),
    }
  })
  await tx.insert(schema.tasks).values(taskRows)
  TASKS.forEach((t, i) => {
    if (t.assignee !== "me" || t.createdBy === "me") return
    notificationRows.push({
      orgId,
      userId: meUser.id,
      type: "task",
      actorId: pid(t.createdBy),
      conversationId: taskRows[i]!.conversationId,
      title: `${people[t.createdBy].name} assigned you a task`,
      body: t.title,
      data: { taskId: taskRows[i]!.id },
      readAt: t.createdHours > 10 ? ago(t.createdHours - 2) : null,
      createdAt: ago(t.createdHours),
    })
  })

  /* ------------------------ Responses & notifications -------------------- */
  const cannedRows = CANNED_RESPONSES.map((r) => {
    const id = uuid()
    manifest.cannedResponseIds.push(id)
    return { id, orgId, ...r, createdBy: pid("maya"), createdAt: ago(24 * 30) }
  })
  await tx.insert(schema.cannedResponses).values(cannedRows)
  if (notificationRows.length) await tx.insert(schema.notifications).values(notificationRows)

  // The manifest lets removeDemoData find rows that carry no demo marker; it is
  // written in the same transaction so it can't be lost.
  await tx.insert(schema.auditLogs).values({
    orgId,
    actorId: meUser.id,
    actorEmail: meUser.email,
    action: "demo.seeded",
    targetType: "organization",
    targetId: orgId,
    metadata: manifest,
  })

  return { conversations: convRows.length, manifest }
}

/* -------------------------------------------------------------------------- */
/*                                   Remove                                   */
/* -------------------------------------------------------------------------- */

/** Remove all demo data from a workspace. Real conversations, members and settings are untouched. */
export async function removeDemoData(orgId: string): Promise<void> {
  const [manifestRow] = await db
    .select({ metadata: schema.auditLogs.metadata })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.orgId, orgId), eq(schema.auditLogs.action, "demo.seeded")))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(1)
  const manifest = (manifestRow?.metadata ?? {}) as Partial<Manifest>
  const ids = (k: keyof Manifest) => (Array.isArray(manifest[k]) ? (manifest[k] as string[]) : [])

  const storageKeys = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dispatch:demo:${orgId}`}))`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dispatch:demo-users'))`)
    const { accountIds, conversationIds } = await demoConversationIds(orgId, tx)

    const demoUsers = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, orgId), like(sql`lower(${schema.users.email})`, `%@${DEMO_DOMAIN}`)))
    const demoUserIds = demoUsers.map((u) => u.id)

    let keys: string[] = []
    if (conversationIds.length) {
      const files = await tx
        .select({ key: schema.attachments.storageKey })
        .from(schema.attachments)
        .innerJoin(schema.messages, eq(schema.messages.id, schema.attachments.messageId))
        .where(and(eq(schema.attachments.orgId, orgId), inArray(schema.messages.conversationId, conversationIds)))
      keys = [...new Set(files.map((f) => f.key))]
      // Cascades: messages, attachments, comments, reactions, events, assignees, labels, user state, tasks, notifications
      await tx.delete(schema.conversations).where(and(eq(schema.conversations.orgId, orgId), inArray(schema.conversations.id, conversationIds)))
    }

    const { tasks, cannedResponses, rules, accounts, signatures, labels, teams } = schema
    if (ids("taskIds").length) await tx.delete(tasks).where(and(eq(tasks.orgId, orgId), inArray(tasks.id, ids("taskIds"))))
    if (ids("cannedResponseIds").length)
      await tx
        .delete(cannedResponses)
        .where(and(eq(cannedResponses.orgId, orgId), inArray(cannedResponses.id, ids("cannedResponseIds"))))
    if (ids("ruleIds").length) await tx.delete(rules).where(and(eq(rules.orgId, orgId), inArray(rules.id, ids("ruleIds"))))
    if (accountIds.length) await tx.delete(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, accountIds)))
    if (ids("signatureIds").length)
      await tx.delete(signatures).where(and(eq(signatures.orgId, orgId), inArray(signatures.id, ids("signatureIds"))))
    if (ids("labelIds").length) await tx.delete(labels).where(and(eq(labels.orgId, orgId), inArray(labels.id, ids("labelIds"))))
    if (ids("teamIds").length) await tx.delete(teams).where(and(eq(teams.orgId, orgId), inArray(teams.id, ids("teamIds"))))
    await tx.delete(schema.contacts).where(and(eq(schema.contacts.orgId, orgId), like(sql`lower(${schema.contacts.email})`, "%.demo")))

    if (demoUserIds.length) {
      await tx
        .delete(schema.notifications)
        .where(and(eq(schema.notifications.orgId, orgId), inArray(schema.notifications.actorId, demoUserIds)))
      await tx
        .update(schema.tasks)
        .set({ assigneeId: null })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.assigneeId, demoUserIds)))
      const orgTeams = tx.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.orgId, orgId))
      await tx
        .delete(schema.teamMembers)
        .where(and(inArray(schema.teamMembers.userId, demoUserIds), inArray(schema.teamMembers.teamId, orgTeams)))
      const orgConversations = tx
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(eq(schema.conversations.orgId, orgId))
      await tx
        .delete(schema.conversationAssignees)
        .where(
          and(
            inArray(schema.conversationAssignees.userId, demoUserIds),
            inArray(schema.conversationAssignees.conversationId, orgConversations)
          )
        )
      await tx.delete(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), inArray(schema.memberships.userId, demoUserIds)))
      // Delete demo users that no longer belong to any workspace
      const stillMember = await tx
        .select({ userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(inArray(schema.memberships.userId, demoUserIds))
      const keep = new Set(stillMember.map((m) => m.userId))
      const orphaned = demoUserIds.filter((u) => !keep.has(u))
      if (orphaned.length) await tx.delete(schema.users).where(inArray(schema.users.id, orphaned))
    }
    return keys
  })

  // Attachment files may be shared with nothing else; delete after commit
  await Promise.all(storageKeys.map((k) => deleteObject(k).catch(() => {})))
  for (const type of ["conversation.deleted", "labels.updated", "task.updated", "account.updated", "org.updated"] as const) {
    await publish({ orgId, type })
  }
}
