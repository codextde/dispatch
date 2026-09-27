import {
  Archive,
  AtSign,
  BarChart3,
  Building2,
  CalendarClock,
  Contact,
  Container,
  Eye,
  Fingerprint,
  Globe,
  Hash,
  ImageOff,
  Inbox,
  KeyRound,
  Keyboard,
  Languages,
  Layers,
  ListTodo,
  Lock,
  Mail,
  MessagesSquare,
  MonitorSmartphone,
  PenLine,
  Reply,
  ScrollText,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  Signature,
  Smartphone,
  Sparkles,
  Tag,
  Terminal,
  Undo2,
  UserCog,
  Users,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react"
import type { Feature, FeatureCategory, FeatureCategorySlug, FeatureItem } from "./types"

export const featureCategories: FeatureCategory[] = [
  {
    slug: "collaboration",
    name: "Collaboration",
    description: "Work on email together: shared inboxes, internal comments, clear owners and drafts you write as a team.",
  },
  {
    slug: "email",
    name: "Email power tools",
    description: "Everything you expect from a great mail client, on top of the Gmail, Outlook or IMAP mailbox you already have.",
  },
  {
    slug: "workflow",
    name: "Workflow & automation",
    description: "Route, label and follow up automatically so the busywork happens before anyone opens the inbox.",
  },
  {
    slug: "chat-tasks",
    name: "Team chat & tasks",
    description: "Talk and track follow-ups right next to the conversations they are about, without another tool.",
  },
  {
    slug: "ai",
    name: "AI assistant",
    description: "Summaries, drafts and rewrites powered by your own Anthropic or OpenAI key, and only when you switch it on.",
  },
  {
    slug: "admin-security",
    name: "Admin & security",
    description: "Passwordless sign-in, fine-grained roles, an audit log and encryption at rest, built in from day one.",
  },
  {
    slug: "developer",
    name: "Developer platform",
    description: "A REST API, signed webhooks and an open codebase you can run on your own servers.",
  },
]

export const features: Feature[] = [
  {
    slug: "shared-inbox",
    name: "Shared inbox",
    category: "collaboration",
    icon: Inbox,
    tagline: "Turn support@, sales@ and hello@ into inboxes the whole team can work from.",
    headline: ["One inbox for the whole team.", "Without sharing a single password."],
    description:
      "Connect Gmail, Outlook or any IMAP mailbox and give your team one place to read, reply and resolve. Everyone sees the same conversations, statuses and owners in real time.",
    metaDescription:
      "Shared inboxes on top of Gmail, Outlook or any IMAP mailbox. Give your team one place to read, assign and resolve email, with no shared passwords.",
    visual: "inbox",
    benefits: [
      {
        title: "Bring the mailbox you already have.",
        quiet: "Keep your address, keep your history.",
        body:
          "Dispatch connects to Gmail and Google Workspace, Outlook and Microsoft 365, or any IMAP/SMTP provider. Mail stays in your mailbox and syncs both ways, so nothing about your domain or deliverability changes.",
        visual: "providers",
        points: ["Gmail & Google Workspace", "Outlook & Microsoft 365", "Any IMAP/SMTP mailbox", "Two-way sync"],
      },
      {
        title: "Team inboxes, not forwarding rules.",
        body:
          "Group addresses into team inboxes like Support, Sales or Billing and decide who can see each one. New teammates get access with an invite, not a password handed over in chat.",
        visual: "security",
        points: ["Inbox-level access", "Unlimited teammates", "Personal and shared inboxes side by side"],
      },
      {
        title: "Always know who has it.",
        quiet: "And what is still open.",
        body:
          "Every conversation has a status and an owner. Archive when it is done, snooze it until it matters, and see at a glance what is waiting for a reply.",
        visual: "assign",
        points: ["Open, snoozed and done", "Assigned to me view", "Unread and mention counts"],
      },
      {
        title: "Realtime by default.",
        body:
          "When someone opens, comments on or replies to a conversation, everyone else sees it immediately. No refresh button, no stale lists, no double replies.",
        visual: "presence",
      },
    ],
    related: ["assignments", "internal-comments", "collaborative-drafts"],
  },
  {
    slug: "internal-comments",
    name: "Internal comments",
    category: "collaboration",
    icon: AtSign,
    tagline: "Discuss any email right next to it. @mention a teammate instead of forwarding.",
    headline: ["Talk about the email.", "Right next to the email."],
    description:
      "Leave internal comments on any conversation and @mention teammates to pull them in. Customers never see them, and the context never gets lost in a forward chain.",
    metaDescription:
      "Internal comments and @mentions on every email conversation. Discuss replies with your team in context instead of forwarding or pasting into chat.",
    visual: "comments",
    benefits: [
      {
        title: "Stop forwarding emails to ask a question.",
        body:
          "Comments live inside the conversation thread, between the messages they refer to. Anyone who opens the email later sees the full story: what the customer wrote and what the team decided.",
        visual: "comments",
        points: ["Private to your workspace", "Threaded with the email", "Rich text formatting"],
      },
      {
        title: "@mention the right person.",
        quiet: "They get notified instantly.",
        body:
          "Type @ to bring in a colleague. They get an in-app notification and the conversation shows up in their Mentions view, so nothing that needs them gets lost.",
        visual: "presence",
        points: ["Mentions view", "In-app notifications", "Pull in anyone on the team"],
      },
      {
        title: "Decide, then reply as one.",
        body:
          "Agree on the answer in the comments, then draft the reply together. When the email goes out, the discussion stays behind for the next person who needs context.",
        visual: "drafts",
      },
    ],
    related: ["collaborative-drafts", "assignments", "team-chat"],
  },
  {
    slug: "assignments",
    name: "Assignments",
    category: "collaboration",
    icon: Users,
    tagline: "Give every conversation a clear owner, and see who is working on what.",
    headline: ["Every email has an owner.", "No more \"did anyone reply?\""],
    description:
      "Assign conversations to a teammate in one click or with a shortcut. Everyone knows who is responsible, and nothing sits in the inbox waiting for someone else to pick it up.",
    metaDescription:
      "Assign emails to teammates, reassign in one click and track workload. Dispatch gives every conversation a clear owner so nothing falls through the cracks.",
    visual: "assign",
    benefits: [
      {
        title: "One click, one owner.",
        body:
          "Assign from the conversation, from the list, or by pressing a key. The assignee is notified and the conversation lands in their Assigned to me view.",
        visual: "assign",
        points: ["Assign and reassign instantly", "Assigned to me view", "Keyboard shortcut"],
      },
      {
        title: "Route work automatically.",
        quiet: "Before anyone has to triage.",
        body:
          "Use rules to assign by sender, domain, subject or inbox. Invoices go to finance, bug reports go to the on-call engineer, VIPs go to their account manager.",
        visual: "rules",
      },
      {
        title: "See the workload at a glance.",
        body:
          "Analytics show open conversations and reply times per teammate, so you can rebalance before anyone is overwhelmed and nothing waits too long.",
        visual: "analytics",
        points: ["Open conversations per person", "Median first reply time", "Resolution time"],
      },
    ],
    related: ["rules-automation", "shared-inbox", "analytics"],
  },
  {
    slug: "collaborative-drafts",
    name: "Collaborative drafts",
    category: "collaboration",
    icon: PenLine,
    tagline: "Write a reply together in real time, then send it from the shared address.",
    headline: ["Write the reply together.", "See every cursor, live."],
    description:
      "Open a draft and invite a teammate to edit it with you, live. Presence and collision detection make sure two people never answer the same customer twice.",
    metaDescription:
      "Collaborative email drafts with live cursors, presence and collision detection. Write and review replies together before they go out.",
    visual: "drafts",
    benefits: [
      {
        title: "Edit the same draft at the same time.",
        body:
          "Drafts sync in real time with named cursors, so a colleague can fix a number or soften a sentence while you are still writing. No copy-paste, no version confusion.",
        visual: "drafts",
        points: ["Live cursors", "Shared or private drafts", "Rich-text composer"],
      },
      {
        title: "Never reply twice.",
        quiet: "Collision detection is built in.",
        body:
          "See who is viewing or typing in a conversation before you start. If a teammate is already replying, Dispatch tells you, so customers get one clear answer.",
        visual: "presence",
        points: ["Viewing and typing indicators", "Collision warnings", "Works on mobile too"],
      },
      {
        title: "Review before it leaves.",
        body:
          "Ask for a second pair of eyes with an @mention in the comments. Schedule the reply for later, and undo send if you spot something in the last seconds.",
        visual: "sendlater",
      },
    ],
    related: ["internal-comments", "canned-responses", "snooze-send-later"],
  },
  {
    slug: "rules-automation",
    name: "Rules & automation",
    category: "workflow",
    icon: Workflow,
    tagline: "When an email matches, label, assign, move or notify. Automatically.",
    headline: ["Set it up once.", "Let the inbox sort itself."],
    description:
      "Rules watch incoming and outgoing mail and act on it: add labels, assign a teammate, move to a team inbox, archive or call a webhook. The busywork is done before anyone looks.",
    metaDescription:
      "Email rules and automation for teams: label, assign, move, archive, notify or trigger webhooks based on sender, subject, content and more.",
    visual: "rules",
    benefits: [
      {
        title: "Conditions you can read.",
        quiet: "Actions that do the work.",
        body:
          "Build rules from plain conditions like sender, domain, recipient, subject or body text, then chain actions. Anyone on the team can understand what a rule does by reading it.",
        visual: "rules",
        points: ["Sender, domain, subject, body", "Combine with AND / OR", "Multiple actions per rule"],
      },
      {
        title: "Route to the right person.",
        body:
          "Assign conversations by topic or customer, move them into the right team inbox, and label them on arrival. Your triage queue shrinks to the few emails that really need judgment.",
        visual: "assign",
      },
      {
        title: "Keep noise out of the inbox.",
        body:
          "Archive newsletters and notifications automatically, or label them for later. The shared inbox stays focused on conversations that need a human.",
        visual: "labels",
        points: ["Auto-archive", "Auto-label", "Skip the inbox"],
      },
      {
        title: "Reach beyond the inbox.",
        body:
          "Notify a teammate or fire a signed webhook when a rule matches, so your CRM, ticket tracker or internal tools stay in sync without polling.",
        visual: "webhooks",
      },
    ],
    related: ["assignments", "labels", "api-webhooks"],
  },
  {
    slug: "canned-responses",
    name: "Canned responses",
    category: "workflow",
    icon: Reply,
    tagline: "Reusable replies with variables like {{first_name}}. Consistent answers in seconds.",
    headline: ["Answer the common questions", "in two keystrokes."],
    description:
      "Save the replies your team writes every day and insert them with a slash command. Variables fill in names and details, so every answer still feels personal.",
    metaDescription:
      "Canned responses and email templates for teams, with variables like {{first_name}}. Insert saved replies in seconds and keep answers consistent.",
    visual: "canned",
    benefits: [
      {
        title: "Type /, pick a reply, done.",
        body:
          "Search your team's saved replies right from the composer. Insert, adjust a sentence if needed, and send. Your best answers become everyone's best answers.",
        visual: "canned",
        points: ["Slash-command picker", "Searchable library", "Shared or personal"],
      },
      {
        title: "Personal, not robotic.",
        quiet: "Variables fill in the details.",
        body:
          "Use variables like {{first_name}} and {{company}} to personalize every reply automatically, pulled from the contact you are writing to.",
        visual: "contacts",
      },
      {
        title: "Pairs well with your signature.",
        body:
          "Canned responses slot in above your signature, so replies stay on-brand whoever sends them. Combine with send later to answer tonight and deliver in the morning.",
        visual: "signatures",
      },
    ],
    related: ["collaborative-drafts", "ai-assistant", "rules-automation"],
  },
  {
    slug: "labels",
    name: "Labels",
    category: "workflow",
    icon: Tag,
    tagline: "Color-coded labels to organize conversations by topic, customer or priority.",
    headline: ["Organize by what it is about.", "Not by where it landed."],
    description:
      "Tag conversations with shared labels like Urgent, VIP or Refund. Filter any view by label, apply them by hand or automatically with rules.",
    metaDescription:
      "Shared, color-coded email labels for teams. Organize conversations by topic, customer or priority and apply labels automatically with rules.",
    visual: "labels",
    benefits: [
      {
        title: "A shared vocabulary for the team.",
        body:
          "Labels are defined once per workspace and used by everyone, so \"Refund\" means the same thing to support and finance. Colors make them easy to spot in a busy list.",
        visual: "labels",
        points: ["Workspace-wide labels", "Custom colors", "Multiple labels per conversation"],
      },
      {
        title: "Filter any view in a click.",
        body:
          "Click a label in the sidebar to see every matching conversation across inboxes, or combine it with search to find exactly the thread you need.",
        visual: "search",
      },
      {
        title: "Applied before you look.",
        quiet: "Thanks to rules.",
        body:
          "Let rules add labels on arrival based on sender, subject or content. Your inbox arrives pre-sorted, and reports can break volume down by label.",
        visual: "rules",
      },
    ],
    related: ["rules-automation", "shared-inbox", "analytics"],
  },
  {
    slug: "snooze-send-later",
    name: "Snooze & send later",
    category: "email",
    icon: CalendarClock,
    tagline: "Hide an email until it matters, schedule replies, and undo a send in time.",
    headline: ["Deal with it later.", "On purpose."],
    description:
      "Snooze conversations until tomorrow morning or next week and they come back to the top of the inbox. Schedule replies for the right moment, and undo a send before it leaves.",
    metaDescription:
      "Snooze emails, schedule replies with send later and undo send. Keep a clean shared inbox and reach people at the right time.",
    visual: "snooze",
    benefits: [
      {
        title: "Snooze it. It comes back.",
        body:
          "Pick a preset like later today or next week, or choose an exact date. When the time comes, the conversation returns to the inbox and its owner is reminded.",
        visual: "snooze",
        points: ["Quick presets", "Custom date and time", "Returns to the top of the inbox"],
      },
      {
        title: "Send at the right time.",
        quiet: "In their time zone, not yours.",
        body:
          "Write the reply now and schedule it for tomorrow at 8:00. Scheduled messages are visible to the team and can be edited or canceled until they go out.",
        visual: "sendlater",
      },
      {
        title: "Undo send, for real.",
        body:
          "Every message waits a few seconds before it leaves. Catch the typo, the missing attachment or the wrong recipient and pull it back.",
        visual: "sendlater",
        points: ["Configurable delay", "Edit before it goes", "Works with scheduled sends"],
      },
    ],
    related: ["shared-inbox", "tasks", "collaborative-drafts"],
  },
  {
    slug: "team-chat",
    name: "Team chat",
    category: "chat-tasks",
    icon: MessagesSquare,
    tagline: "Channels and direct messages for your team, right next to your inbox.",
    headline: ["Chat where the work is.", "Not in another app."],
    description:
      "Team channels and direct messages live inside Dispatch, next to the conversations they are about. Share a thread into chat with one click and keep the context attached.",
    metaDescription:
      "Built-in team chat with channels and direct messages, next to your shared inbox. Discuss emails and share conversations without switching apps.",
    visual: "chat",
    benefits: [
      {
        title: "Channels and DMs, built in.",
        body:
          "Create channels for teams or projects and message colleagues directly. Everyone who works the inbox is already there, so there's nothing extra to invite them to.",
        visual: "chat",
        points: ["Public channels", "Direct messages", "@mentions and notifications"],
      },
      {
        title: "Share an email in one click.",
        body:
          "Post a conversation into a channel to ask for help or give a heads-up. Teammates can jump straight from the chat message to the email thread.",
        visual: "comments",
      },
      {
        title: "Know who's around.",
        body:
          "Presence shows who is online and what they are looking at, so you know whether to wait for an answer or pick it up yourself.",
        visual: "presence",
      },
    ],
    related: ["internal-comments", "tasks", "mobile"],
  },
  {
    slug: "tasks",
    name: "Tasks",
    category: "chat-tasks",
    icon: ListTodo,
    tagline: "Turn follow-ups into tasks with owners and due dates, linked to the email.",
    headline: ["Follow-ups with an owner", "and a due date."],
    description:
      "Create tasks on their own or straight from a conversation. Assign them, set a due date, and check them off when the work is done, with the email always one click away.",
    metaDescription:
      "Team tasks linked to emails: create follow-ups from conversations, assign owners, set due dates and track progress without a separate tool.",
    visual: "tasks",
    benefits: [
      {
        title: "From email to task in a click.",
        body:
          "Turn \"we'll send the updated contract\" into a task linked to the conversation. Whoever picks it up has the full thread for context.",
        visual: "tasks",
        points: ["Linked to conversations", "Or standalone", "Checklist-style"],
      },
      {
        title: "Clear owners, real deadlines.",
        body:
          "Assign tasks to a teammate and set a due date. Everyone sees what's open, what's overdue and who is on it.",
        visual: "assign",
        points: ["Assignees", "Due dates", "My tasks view"],
      },
      {
        title: "Pairs with snooze.",
        quiet: "Nothing slips.",
        body:
          "Snooze the conversation while the task is in progress and it comes back when it is time to reply. The inbox stays clean and the follow-up stays visible.",
        visual: "snooze",
      },
    ],
    related: ["team-chat", "assignments", "snooze-send-later"],
  },
  {
    slug: "analytics",
    name: "Analytics",
    category: "workflow",
    icon: BarChart3,
    tagline: "Volume, first-reply time, resolution time and workload per teammate.",
    headline: ["See how the inbox is doing.", "Before customers tell you."],
    description:
      "Track conversation volume, first-reply and resolution times, and workload per teammate and inbox. Spot bottlenecks early and staff for the busy days.",
    metaDescription:
      "Team email analytics: conversation volume, first-reply time, resolution time and per-teammate workload across your shared inboxes.",
    visual: "analytics",
    benefits: [
      {
        title: "The numbers that matter.",
        body:
          "Median first-reply time, resolution time and conversation volume, over any date range. Filter by inbox, teammate or label to see what is driving the trend.",
        visual: "analytics",
        points: ["First-reply time", "Resolution time", "Volume over time"],
      },
      {
        title: "Fair workload.",
        quiet: "Visible to the whole team.",
        body:
          "See open and resolved conversations per teammate. Rebalance assignments before someone burns out or a queue quietly grows.",
        visual: "assign",
      },
      {
        title: "Your data, queryable.",
        body:
          "Everything behind the charts is available through the REST API, and self-hosted instances keep it in your own Postgres database.",
        visual: "api",
      },
    ],
    related: ["assignments", "labels", "api-webhooks"],
  },
  {
    slug: "ai-assistant",
    name: "AI assistant",
    category: "ai",
    icon: Sparkles,
    tagline: "Summarize threads, draft and improve replies. Bring your own Anthropic or OpenAI key.",
    headline: ["AI that works for your team.", "With your key, on your terms."],
    description:
      "Summarize long threads, draft replies, fix tone or translate in one click. Dispatch uses your own Anthropic or OpenAI key, and nothing is sent anywhere until an admin switches it on.",
    metaDescription:
      "AI email assistant for teams: summarize threads, draft and improve replies, translate. Bring your own Anthropic or OpenAI key. Off until you enable it.",
    visual: "ai",
    benefits: [
      {
        title: "Catch up in seconds.",
        body:
          "Get a short summary of a long thread, including the internal comments, before you jump in. Perfect for handovers and escalations.",
        visual: "ai",
        points: ["Thread summaries", "Includes internal context", "One click"],
      },
      {
        title: "Draft, improve, translate.",
        body:
          "Generate a first draft from the conversation, shorten a rambling reply, adjust the tone or translate it. You always review before anything is sent.",
        visual: "drafts",
        points: ["Draft a reply", "Improve and shorten", "Change tone", "Translate"],
      },
      {
        title: "Bring your own key.",
        quiet: "Off until you say so.",
        body:
          "Connect an Anthropic or OpenAI key for the whole instance, or let each workspace use its own. No key, no AI: nothing leaves your server unless you configure it.",
        visual: "security",
        points: ["Anthropic or OpenAI", "Instance or workspace keys", "Disabled by default"],
      },
    ],
    related: ["canned-responses", "collaborative-drafts", "internal-comments"],
  },
  {
    slug: "contacts",
    name: "Contacts",
    category: "email",
    icon: Contact,
    tagline: "Contacts built automatically from your mail, with every past conversation.",
    headline: ["Know who you're talking to.", "And everything you've discussed."],
    description:
      "Dispatch builds a shared contact list from the mail you send and receive. Open a contact to see every conversation the team has had with them, across all inboxes.",
    metaDescription:
      "Shared contacts built from your email, with full conversation history across team inboxes. Know who you are talking to before you reply.",
    visual: "contacts",
    benefits: [
      {
        title: "Built from your mail.",
        quiet: "No data entry.",
        body:
          "Contacts are created automatically from senders and recipients. Names, email addresses and companies stay up to date without anyone maintaining a spreadsheet.",
        visual: "contacts",
        points: ["Automatic contact creation", "Grouped by company domain", "Shared across the workspace"],
      },
      {
        title: "Full history, one click away.",
        body:
          "See every past conversation with a contact next to the email you're reading, including who handled it and how it ended.",
        visual: "inbox",
      },
      {
        title: "Personalize every reply.",
        body:
          "Contact details power variables in canned responses, so {{first_name}} is always right, even when a colleague wrote the template.",
        visual: "canned",
      },
    ],
    related: ["canned-responses", "shared-inbox", "api-webhooks"],
  },
  {
    slug: "api-webhooks",
    name: "API & webhooks",
    category: "developer",
    icon: Webhook,
    tagline: "A REST API with API keys and signed webhooks for everything in your inbox.",
    headline: ["Your inbox, programmable.", "REST API and signed webhooks."],
    description:
      "Read and act on conversations, messages, contacts and tasks through a REST API. Subscribe to events with signed webhooks and connect Dispatch to the tools you already run.",
    metaDescription:
      "Dispatch REST API and signed webhooks: automate conversations, contacts and tasks, and sync your shared inbox with your CRM and internal tools.",
    visual: "api",
    benefits: [
      {
        title: "A clean REST API.",
        body:
          "Create API keys per workspace and work with conversations, messages, labels, contacts and tasks over JSON. Build internal dashboards, sync your CRM or script bulk changes.",
        visual: "api",
        points: ["Workspace API keys", "JSON over HTTPS", "Conversations, contacts, tasks"],
      },
      {
        title: "Webhooks you can trust.",
        quiet: "Every payload is signed.",
        body:
          "Subscribe to events like new conversations, assignments or replies. Payloads are signed so your endpoint can verify they really came from your Dispatch instance.",
        visual: "webhooks",
        points: ["Event subscriptions", "Signed payloads", "Delivery log"],
      },
      {
        title: "Trigger from rules.",
        body:
          "Call a webhook from any automation rule, so a matching email can open a ticket, update a deal or ping an internal service the moment it arrives.",
        visual: "rules",
      },
      {
        title: "Open source all the way down.",
        body:
          "When the API isn't enough, read the code. Dispatch is AGPL-3.0, so you can self-host it, inspect it and extend it.",
        visual: "selfhost",
      },
    ],
    related: ["rules-automation", "analytics", "security-permissions"],
  },
  {
    slug: "security-permissions",
    name: "Security & permissions",
    category: "admin-security",
    icon: ShieldCheck,
    tagline: "Passwordless login, custom roles, inbox access, audit log and encryption at rest.",
    headline: ["Secure by default.", "Configurable when you need it."],
    description:
      "Magic-link sign-in, per-device sessions, role-based permissions, inbox-level access and a full audit log. Mailbox credentials are encrypted at rest with AES-256-GCM.",
    metaDescription:
      "Security and permissions in Dispatch: magic-link login, custom roles, inbox-level access, audit log, encrypted credentials and self-hosting.",
    visual: "security",
    benefits: [
      {
        title: "Roles that fit your team.",
        body:
          "Start with owner, admin and member, then create custom roles with exactly the permissions you need. Control who can see each inbox, manage rules or invite people.",
        visual: "security",
        points: ["Owner, admin, member", "Custom roles", "Inbox-level access"],
      },
      {
        title: "No passwords to leak.",
        quiet: "Sign in with a magic link.",
        body:
          "Passwordless magic links are single-use and stored hashed. Sessions are per device and can be revoked any time, and Google or Microsoft sign-in can be enabled if you prefer.",
        visual: "mobile",
        points: ["Single-use magic links", "Per-device sessions", "Optional Google / Microsoft sign-in"],
      },
      {
        title: "Every change on the record.",
        body:
          "The audit log records who changed what and when: role updates, inbox access, rules, API keys and more. Useful for reviews and required for peace of mind.",
        visual: "audit",
      },
      {
        title: "Safe email rendering.",
        body:
          "Email bodies render in a sandbox without scripts, and remote images can be blocked until you choose to load them, so tracking pixels don't phone home.",
        visual: "inbox",
        points: ["Sandboxed rendering", "Remote image blocking", "Credentials encrypted at rest"],
      },
    ],
    related: ["api-webhooks", "shared-inbox", "mobile"],
  },
  {
    slug: "mobile",
    name: "Mobile",
    category: "admin-security",
    icon: Smartphone,
    tagline: "A fully responsive app you can install on your phone's home screen.",
    headline: ["The whole inbox in your pocket.", "Installable, no app store needed."],
    description:
      "Dispatch is fully responsive and installs to your home screen as a web app. Read, reply, assign and comment from your phone with the same realtime updates as on desktop.",
    metaDescription:
      "Dispatch on mobile: a fully responsive, installable web app. Read, reply, assign and comment on shared inbox conversations from your phone.",
    visual: "mobile",
    benefits: [
      {
        title: "Built for small screens.",
        body:
          "Every screen is designed to work at phone width, from the inbox list to the composer and settings. Triage conversations and reply with one thumb.",
        visual: "mobile",
        points: ["Responsive on every screen", "Touch-friendly composer", "Works on iOS and Android browsers"],
      },
      {
        title: "Install it like an app.",
        quiet: "Straight from the browser.",
        body:
          "Add Dispatch to your home screen for a full-screen, app-like experience. No app store, no separate download, always the latest version.",
        visual: "inbox",
      },
      {
        title: "Stay signed in.",
        body:
          "Sessions last up to a year per device, so your phone stays signed in while your laptop does too. Revoke any device from your security settings.",
        visual: "security",
      },
    ],
    related: ["shared-inbox", "team-chat", "security-permissions"],
  },
]

export const featureItems: Record<FeatureCategorySlug, FeatureItem[]> = {
  collaboration: [
    {
      name: "Shared inbox",
      description: "Turn team addresses into inboxes everyone can work from, without sharing passwords.",
      icon: Inbox,
      slug: "shared-inbox",
    },
    {
      name: "Internal comments",
      description: "Discuss any email next to the thread and @mention teammates to pull them in.",
      icon: AtSign,
      slug: "internal-comments",
    },
    {
      name: "Assignments",
      description: "Give every conversation a clear owner and an Assigned to me view.",
      icon: Users,
      slug: "assignments",
    },
    {
      name: "Collaborative drafts",
      description: "Write replies together with live cursors before they go out.",
      icon: PenLine,
      slug: "collaborative-drafts",
    },
    {
      name: "Presence & collision detection",
      description: "See who is viewing or typing so no customer gets two answers.",
      icon: Eye,
    },
    {
      name: "Contacts",
      description: "A shared contact list built from your mail, with every past conversation.",
      icon: Contact,
      slug: "contacts",
    },
  ],
  email: [
    {
      name: "Gmail & Google Workspace",
      description: "Connect personal or Workspace accounts and keep your existing addresses.",
      icon: Mail,
    },
    {
      name: "Outlook & Microsoft 365",
      description: "Bring Outlook.com and Microsoft 365 mailboxes into shared inboxes.",
      icon: Building2,
    },
    {
      name: "Any IMAP/SMTP mailbox",
      description: "Fastmail, iCloud, Zoho or your own mail server: if it speaks IMAP, it works.",
      icon: Globe,
    },
    {
      name: "Snooze & send later",
      description: "Hide emails until they matter and schedule replies for the right moment.",
      icon: CalendarClock,
      slug: "snooze-send-later",
    },
    {
      name: "Undo send",
      description: "A short delay before every message leaves, so you can pull it back.",
      icon: Undo2,
    },
    {
      name: "Signatures",
      description: "Personal and shared signatures per address, applied automatically.",
      icon: Signature,
    },
    {
      name: "Full-text search",
      description: "Find any conversation by sender, subject, body, label or inbox.",
      icon: Search,
    },
    {
      name: "Keyboard shortcuts & command palette",
      description: "Reply, assign, archive and jump anywhere without touching the mouse.",
      icon: Keyboard,
    },
  ],
  workflow: [
    {
      name: "Rules & automation",
      description: "Label, assign, move, archive, notify or call a webhook when mail matches.",
      icon: Workflow,
      slug: "rules-automation",
    },
    {
      name: "Canned responses",
      description: "Reusable replies with variables like {{first_name}}, inserted with a slash.",
      icon: Reply,
      slug: "canned-responses",
    },
    {
      name: "Labels",
      description: "Shared, color-coded labels to organize conversations across inboxes.",
      icon: Tag,
      slug: "labels",
    },
    {
      name: "Analytics",
      description: "Volume, first-reply time, resolution time and workload per teammate.",
      icon: BarChart3,
      slug: "analytics",
    },
    {
      name: "Auto-archive noise",
      description: "Keep newsletters and notifications out of the shared inbox automatically.",
      icon: Archive,
    },
  ],
  "chat-tasks": [
    {
      name: "Team chat",
      description: "Channels and direct messages right next to your inbox.",
      icon: MessagesSquare,
      slug: "team-chat",
    },
    {
      name: "Tasks",
      description: "Follow-ups with owners and due dates, linked to the conversation.",
      icon: ListTodo,
      slug: "tasks",
    },
    {
      name: "Share to channel",
      description: "Post an email thread into a channel to ask for help in one click.",
      icon: Hash,
    },
    {
      name: "In-app notifications",
      description: "Mentions, assignments and replies surface instantly, wherever you are in the app.",
      icon: Zap,
    },
    {
      name: "Mobile",
      description: "A fully responsive app you can install on your phone's home screen.",
      icon: Smartphone,
      slug: "mobile",
    },
  ],
  ai: [
    {
      name: "AI assistant",
      description: "Summaries, drafts and rewrites inside the conversation you're working on.",
      icon: Sparkles,
      slug: "ai-assistant",
    },
    {
      name: "Thread summaries",
      description: "Catch up on long threads and their internal comments in seconds.",
      icon: ScrollText,
    },
    {
      name: "Draft & improve replies",
      description: "Generate a first draft, shorten it or adjust the tone before you send.",
      icon: PenLine,
    },
    {
      name: "Translate",
      description: "Read and answer customers in their language.",
      icon: Languages,
    },
    {
      name: "Bring your own key",
      description: "Use your Anthropic or OpenAI key per instance or per workspace. Off by default.",
      icon: KeyRound,
    },
  ],
  "admin-security": [
    {
      name: "Security & permissions",
      description: "Custom roles, inbox-level access and secure defaults across the board.",
      icon: ShieldCheck,
      slug: "security-permissions",
    },
    {
      name: "Magic-link login",
      description: "Passwordless sign-in with single-use, hashed links. Optional Google or Microsoft sign-in.",
      icon: Fingerprint,
    },
    {
      name: "Per-device sessions",
      description: "Stay signed in on every device for up to a year and revoke any of them.",
      icon: MonitorSmartphone,
    },
    {
      name: "Custom roles",
      description: "Owner, admin and member out of the box, plus roles you define.",
      icon: UserCog,
    },
    {
      name: "Audit log",
      description: "A record of who changed what, from roles to rules to API keys.",
      icon: ScrollText,
    },
    {
      name: "Encrypted credentials",
      description: "Mailbox and API secrets encrypted at rest with AES-256-GCM.",
      icon: Lock,
    },
    {
      name: "Remote image blocking",
      description: "Sandboxed email rendering, with tracking pixels blocked until you allow them.",
      icon: ImageOff,
    },
    {
      name: "Multiple workspaces",
      description: "Run many isolated workspaces on one instance, managed from a super-admin panel.",
      icon: Layers,
    },
  ],
  developer: [
    {
      name: "API & webhooks",
      description: "A REST API and signed webhooks for conversations, contacts and tasks.",
      icon: Webhook,
      slug: "api-webhooks",
    },
    {
      name: "API keys",
      description: "Create and revoke keys per workspace for scripts and integrations.",
      icon: KeyRound,
    },
    {
      name: "Rule-triggered webhooks",
      description: "Call your own endpoints the moment a matching email arrives.",
      icon: Send,
    },
    {
      name: "Self-hosting with Docker Compose",
      description: "Run the whole stack on your server. The only required setting is DOMAIN.",
      icon: Container,
    },
    {
      name: "Super-admin panel",
      description: "Manage workspaces, users and instance settings from the browser.",
      icon: ServerCog,
    },
    {
      name: "Open source (AGPL-3.0)",
      description: "Read, audit and extend the code. Contributions welcome.",
      icon: Terminal,
    },
  ],
}

export const featureSlugs: string[] = features.map((f) => f.slug)

export function getFeature(slug: string): Feature | undefined {
  return features.find((f) => f.slug === slug)
}

export function getFeaturesByCategory(category: FeatureCategorySlug): Feature[] {
  return features.filter((f) => f.category === category)
}
