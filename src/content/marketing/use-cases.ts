import { Briefcase, Calculator, Handshake, Headphones, House, Layers, Scale, ShoppingBag } from "lucide-react"
import type { UseCase } from "./types"

export const useCases: UseCase[] = [
  {
    slug: "customer-support",
    name: "Customer support",
    icon: Headphones,
    tagline: "Answer every customer once, fast, and in one voice from a shared support inbox.",
    headline: ["Support that feels like one person.", "Even when it's ten of you."],
    description:
      "Turn support@ into a shared inbox with clear owners, internal notes and saved replies, so every customer gets one fast, consistent answer instead of two conflicting ones.",
    metaDescription:
      "Shared support inbox with assignments, internal comments, canned responses and reply-time analytics. Open source and free to self-host.",
    pains: [
      {
        title: "Two agents, one customer, two replies",
        body: "Without visibility into who is already answering, teammates collide and customers get duplicate or contradicting emails.",
      },
      {
        title: "Context lives in side channels",
        body: "The why behind an answer is buried in chat threads and forwarded emails that the next agent never sees.",
      },
      {
        title: "Nobody knows what's overdue",
        body: "A single mailbox can't show who owns what, how long customers have waited, or which threads quietly slipped.",
      },
    ],
    workflow: [
      {
        label: "Share",
        title: "One queue for support@",
        body: "Connect your support mailbox as a team inbox. Every agent works the same queue, with presence showing who is viewing or typing.",
        visual: "inbox",
      },
      {
        label: "Assign",
        title: "Give every thread an owner",
        body: "Rules route billing questions to billing and bugs to the product team. Agents claim or reassign with a single shortcut.",
        visual: "assign",
      },
      {
        label: "Resolve",
        title: "Reply fast, measure it",
        body: "Canned responses and AI drafts speed up replies, internal comments carry context, and analytics track first-reply and resolution time.",
        visual: "analytics",
      },
    ],
    features: ["shared-inbox", "assignments", "internal-comments", "canned-responses", "rules-automation", "analytics"],
    setup: [
      "Connect support@ as a team inbox",
      "Create labels for Bug, Billing, Feature request and Urgent",
      "Add canned responses for your ten most common questions",
      "Route billing emails to the billing team with a rule",
      "Track first-reply time per teammate in analytics",
    ],
  },
  {
    slug: "sales",
    name: "Sales",
    icon: Handshake,
    tagline: "Work every deal thread together without CC chains or forwarded quotes.",
    headline: ["Close deals as a team.", "Without CC-ing the whole company."],
    description:
      "Share prospect conversations across your sales team, loop in legal or product with an @mention, and never let a hot lead wait because its owner is on vacation.",
    metaDescription:
      "Collaborative sales inbox: shared prospect threads, @mentions, send later, follow-up snoozes and contact history. Open-source Missive alternative.",
    pains: [
      {
        title: "Deals stall behind one inbox",
        body: "When a rep is out, their prospects wait. Nobody else can see the thread, the quote or the last promise that was made.",
      },
      {
        title: "Approvals by forward",
        body: "Discounts and contract questions get forwarded to managers and legal, then the answer comes back in a different thread.",
      },
      {
        title: "Follow-ups fall through",
        body: "Prospects who go quiet disappear from view unless someone remembers to check back at exactly the right time.",
      },
    ],
    workflow: [
      {
        label: "Share",
        title: "Deal threads the team can see",
        body: "Connect sales@ and personal mailboxes you choose to share. Every conversation with a prospect is visible to the people who need it.",
        visual: "inbox",
      },
      {
        label: "Discuss",
        title: "Approve without forwarding",
        body: "@mention your manager for a discount or legal for a clause, right on the email. The prospect never sees the internal thread.",
        visual: "comments",
      },
      {
        label: "Follow up",
        title: "Bring quiet deals back",
        body: "Snooze a thread until the day you promised to follow up, or schedule your reply to land first thing in the morning.",
        visual: "snooze",
      },
    ],
    features: ["shared-inbox", "internal-comments", "snooze-send-later", "contacts", "collaborative-drafts", "canned-responses"],
    setup: [
      "Connect sales@ as a team inbox",
      "Label threads by stage: Lead, Proposal, Negotiation, Won",
      "Snooze quiet prospects until your follow-up date",
      "Save pricing and demo replies as canned responses",
      "Give account managers access to the contacts they own",
    ],
  },
  {
    slug: "agencies",
    name: "Agencies",
    icon: Briefcase,
    tagline: "One inbox per client, one place for the team, and no per-seat bill for freelancers.",
    headline: ["Every client, one calm inbox.", "Freelancers included, at no extra cost."],
    description:
      "Give each client its own label or inbox, bring designers, developers and account managers into the same thread, and add freelancers without paying per seat.",
    metaDescription:
      "Shared inboxes for agencies: client labels, internal comments, tasks linked to emails and unlimited users on a flat workspace price.",
    pains: [
      {
        title: "Client emails scattered across people",
        body: "Feedback lands in whichever inbox the client happened to write to, so briefs and approvals get lost between teammates.",
      },
      {
        title: "Per-seat pricing punishes growth",
        body: "Adding a freelancer for a two-week project means another monthly seat, so people end up sharing logins instead.",
      },
      {
        title: "Requests turn into invisible work",
        body: "A client asks for a change by email and it only exists in someone's head until the deadline has already passed.",
      },
    ],
    workflow: [
      {
        label: "Organize",
        title: "A label for every client",
        body: "Rules label incoming mail by client domain, so each account has a clean view without anyone filing emails by hand.",
        visual: "labels",
      },
      {
        label: "Collaborate",
        title: "Bring the right people in",
        body: "@mention the designer on a feedback email, draft the reply together and send it from the shared address.",
        visual: "drafts",
      },
      {
        label: "Deliver",
        title: "Turn requests into tasks",
        body: "Create a task from any client email with an assignee and a due date, linked back to the conversation it came from.",
        visual: "tasks",
      },
    ],
    features: ["labels", "rules-automation", "internal-comments", "collaborative-drafts", "tasks", "team-chat"],
    setup: [
      "Connect hello@ and your project mailboxes",
      "Create a label per client and auto-apply it with domain rules",
      "Invite freelancers with a limited role for their projects",
      "Turn change requests into tasks with due dates",
      "Start a Clients group chat for quick internal questions",
    ],
  },
  {
    slug: "operations",
    name: "Operations",
    icon: Layers,
    tagline: "Vendors, logistics and internal requests in one shared queue with clear owners.",
    headline: ["Run operations from one queue.", "Not from forwarded threads."],
    description:
      "Suppliers, facilities, IT and HR requests all arrive by email. Dispatch gives each one an owner, a status and an automation that files it where it belongs.",
    metaDescription:
      "Shared inbox for operations teams: vendor and request routing with rules, assignments, tasks and webhooks into your other tools.",
    pains: [
      {
        title: "Requests without owners",
        body: "An ops@ mailbox shared by five people means everyone reads everything and nobody is sure who is handling what.",
      },
      {
        title: "Vendors reply to the wrong person",
        body: "Supplier emails go to whoever placed the last order, so critical updates wait until that person is back.",
      },
      {
        title: "Manual copy and paste",
        body: "Important emails have to be re-typed into spreadsheets, trackers and ticket systems before anything happens.",
      },
    ],
    workflow: [
      {
        label: "Route",
        title: "Rules sort the queue",
        body: "Match on sender, subject or content to label them and assign them to the right person or team the moment they arrive.",
        visual: "rules",
      },
      {
        label: "Own",
        title: "Clear owner, clear status",
        body: "Every request is assigned, snoozed until it needs attention again, or closed. Nothing sits in limbo.",
        visual: "assign",
      },
      {
        label: "Connect",
        title: "Push events to your stack",
        body: "Signed webhooks and the REST API let you sync conversations into the tools your operations already run on.",
        visual: "webhooks",
      },
    ],
    features: ["rules-automation", "assignments", "tasks", "api-webhooks", "snooze-send-later", "analytics"],
    setup: [
      "Connect ops@, purchasing@ and facilities@ as team inboxes",
      "Route supplier domains to purchasing with rules",
      "Snooze delivery confirmations until the expected date",
      "Send new requests to your tracker with a webhook",
      "Review weekly volume per inbox in analytics",
    ],
  },
  {
    slug: "accounting",
    name: "Accounting",
    icon: Calculator,
    tagline: "Invoices, receipts and client questions organized for month-end, not buried in mail.",
    headline: ["Close the books, not the inbox.", "Every invoice filed and owned."],
    description:
      "Turn invoices@ and your client mailboxes into shared inboxes where every receipt is labeled by client, every question has an owner, and month-end is a filter away.",
    metaDescription:
      "Shared inbox for accounting firms and finance teams: invoice routing rules, client labels, month-end snoozes and a full audit log.",
    pains: [
      {
        title: "Receipts in a hundred places",
        body: "Invoices arrive in personal inboxes, forwarded chains and shared mailboxes, and month-end becomes a search party.",
      },
      {
        title: "Client questions with no owner",
        body: "When several accountants share a client, it's never clear who answered the last question about the VAT return.",
      },
      {
        title: "Deadlines hide in email",
        body: "Filing dates and payment reminders live in threads that scroll out of view long before they are due.",
      },
    ],
    workflow: [
      {
        label: "Collect",
        title: "One inbox for invoices@",
        body: "Rules label incoming invoices and receipts by client or vendor, so each account has its own filtered view.",
        visual: "rules",
      },
      {
        label: "Assign",
        title: "An owner for every client",
        body: "Assign client conversations to their accountant and let the team see the full history in one thread.",
        visual: "assign",
      },
      {
        label: "Close",
        title: "Month-end on schedule",
        body: "Snooze reminders until the filing date and turn missing documents into tasks with due dates.",
        visual: "snooze",
      },
    ],
    features: ["shared-inbox", "labels", "rules-automation", "assignments", "tasks", "security-permissions"],
    setup: [
      "Connect invoices@ and receipts@ as team inboxes",
      "Create one label per client and apply it with sender rules",
      "Assign each client label's threads to its accountant",
      "Snooze filing reminders until the week before the deadline",
      "Restrict payroll inboxes to the people who need them",
    ],
  },
  {
    slug: "legal",
    name: "Legal",
    icon: Scale,
    tagline: "Matter-based inboxes with private internal notes, audit trails and your own servers.",
    headline: ["Confidential by design.", "Collaborative by default."],
    description:
      "Organize correspondence by matter, discuss strategy in internal notes the other side never sees, and keep everything on infrastructure you control.",
    metaDescription:
      "Collaborative email for law firms: matter labels, private internal comments, audit log, role-based access and self-hosting for confidentiality.",
    pains: [
      {
        title: "Strategy discussed in forwards",
        body: "Internal commentary on client emails gets forwarded around, creating copies of privileged material in every inbox.",
      },
      {
        title: "No trail of who did what",
        body: "When a deadline is missed or a document was sent, reconstructing who handled it means digging through personal mailboxes.",
      },
      {
        title: "Data leaves your control",
        body: "Most collaboration tools store your correspondence on their servers, which clashes with confidentiality obligations.",
      },
    ],
    workflow: [
      {
        label: "Organize",
        title: "Label every matter",
        body: "Apply a matter label to each thread and let rules tag new correspondence from known counterparties automatically.",
        visual: "labels",
      },
      {
        label: "Discuss",
        title: "Internal notes stay internal",
        body: "Comment and @mention colleagues directly on an email. Internal comments are never sent to external recipients.",
        visual: "comments",
      },
      {
        label: "Control",
        title: "Your servers, your audit log",
        body: "Self-host Dispatch, restrict inboxes by role and review every important action in the audit log.",
        visual: "audit",
      },
    ],
    features: ["labels", "internal-comments", "security-permissions", "assignments", "collaborative-drafts", "rules-automation"],
    setup: [
      "Self-host Dispatch on your own infrastructure",
      "Create a label per matter and apply it with counterparty rules",
      "Limit each practice group's inbox to its members",
      "Discuss drafts in internal comments before sending",
      "Review sensitive actions in the audit log",
    ],
  },
  {
    slug: "ecommerce",
    name: "E-commerce",
    icon: ShoppingBag,
    tagline: "Orders, returns and carrier updates answered fast with saved replies and rules.",
    headline: ["Answer \"where's my order?\" in seconds.", "Then get back to selling."],
    description:
      "Route order questions, returns and carrier notifications automatically, reply with personalized canned responses, and keep peak-season queues under control.",
    metaDescription:
      "Shared inbox for online stores: order and returns routing, canned responses with variables, carrier rules and reply-time analytics.",
    pains: [
      {
        title: "The same five questions, all day",
        body: "Order status, returns, exchanges and shipping times make up most of the queue, and each reply is typed by hand.",
      },
      {
        title: "Carrier noise drowns customers",
        body: "Tracking updates and marketplace notifications bury the emails from customers who actually need an answer.",
      },
      {
        title: "Peak season breaks the inbox",
        body: "When volume doubles, a single mailbox can't show who is on which order or how long customers have been waiting.",
      },
    ],
    workflow: [
      {
        label: "Sort",
        title: "Rules clear the noise",
        body: "Carrier and marketplace notifications are labeled and closed automatically, so the queue only shows customers.",
        visual: "rules",
      },
      {
        label: "Reply",
        title: "Saved replies with variables",
        body: "Insert canned responses with the customer's name filled in, add the order details and send.",
        visual: "canned",
      },
      {
        label: "Measure",
        title: "Watch the queue in real time",
        body: "See volume, first-reply time and workload per teammate, and rebalance assignments before customers notice.",
        visual: "analytics",
      },
    ],
    features: ["canned-responses", "rules-automation", "shared-inbox", "assignments", "analytics", "ai-assistant"],
    setup: [
      "Connect orders@ and returns@ as team inboxes",
      "Label and close carrier notifications with a rule",
      "Save replies for order status, returns and exchanges",
      "Assign returns to the fulfillment team automatically",
      "Track first-reply time during peak season",
    ],
  },
  {
    slug: "real-estate",
    name: "Real estate",
    icon: House,
    tagline: "Listings, viewing requests and offers handled by the whole brokerage, not one inbox.",
    headline: ["Never miss a viewing request.", "Every lead answered by someone."],
    description:
      "Share listings@ across your agents, assign each inquiry to the agent on the property, and snooze follow-ups until the day of the viewing.",
    metaDescription:
      "Shared inbox for real estate agencies: listing inquiries, agent assignments, viewing follow-ups with snooze, and a mobile-friendly inbox.",
    pains: [
      {
        title: "Inquiries wait for one agent",
        body: "Portal leads land in a shared mailbox and wait until the right agent happens to check it, often after a competitor replied.",
      },
      {
        title: "Follow-ups live in memory",
        body: "Buyers who viewed a property need a call back, but there is no reminder tied to the actual conversation.",
      },
      {
        title: "Agents are rarely at a desk",
        body: "Most work happens between viewings, and a desktop-only tool means answers wait until the evening.",
      },
    ],
    workflow: [
      {
        label: "Capture",
        title: "One inbox for every listing",
        body: "Connect listings@ and label inquiries by property with rules, so each listing has its own view.",
        visual: "labels",
      },
      {
        label: "Assign",
        title: "The right agent, instantly",
        body: "Route each inquiry to the listing agent, with the team able to step in when they are showing another property.",
        visual: "assign",
      },
      {
        label: "Follow up",
        title: "Snooze until the viewing",
        body: "Snooze a buyer's thread until the day after their viewing and reply from your phone in the installable web app.",
        visual: "mobile",
      },
    ],
    features: ["shared-inbox", "assignments", "labels", "snooze-send-later", "mobile", "canned-responses"],
    setup: [
      "Connect listings@ and your portal lead address",
      "Create a label per property and apply it with subject rules",
      "Assign each property's inquiries to its listing agent",
      "Save replies for viewing times and required documents",
      "Install Dispatch on agents' phones as a web app",
    ],
  },
]

export const useCaseSlugs = useCases.map((u) => u.slug)

export function getUseCase(slug: string): UseCase | undefined {
  return useCases.find((u) => u.slug === slug)
}
