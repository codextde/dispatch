import {
  AtSign,
  Bell,
  Boxes,
  Container,
  Cpu,
  HardDrive,
  KeyRound,
  Languages,
  MailCheck,
  PenLine,
  Reply,
  Send,
  UserPlus,
  WandSparkles,
  Webhook,
  Zap,
} from "lucide-react"
import { docsUrl } from "./site"
import type { Integration, IntegrationCategory, IntegrationCategorySlug } from "./types"

/*
 * What Dispatch connects to today. Every entry is backed by code:
 * mail presets (src/server/mail/credentials.ts), Google / Microsoft OAuth
 * (src/server/oauth), system email (src/server/mail/system-mailer.ts), AI
 * providers (src/server/ai.ts), storage and billing settings
 * (src/server/settings.ts) and webhooks (src/server/jobs.ts, src/worker).
 * Marks are text tiles, never vendor logos.
 */

export const integrationCategories: IntegrationCategory[] = [
  {
    slug: "mail",
    name: "Mail providers",
    description:
      "Connect the mailboxes you already have. Dispatch syncs over IMAP and sends through each mailbox's own SMTP server, so your mail stays where it is.",
  },
  {
    slug: "delivery",
    name: "System email",
    description:
      "Where sign-in links, invitations and notifications come from. Customer replies always go out through the inbox's own server.",
  },
  {
    slug: "ai",
    name: "AI",
    description:
      "Bring your own key for summaries, drafts, rewrites and translation. Off until an admin switches it on.",
  },
  {
    slug: "automation",
    name: "Automation & API",
    description:
      "A REST API and signed webhooks, for your own code or the automation platform you already use.",
  },
  {
    slug: "storage",
    name: "Attachment storage",
    description: "Keep attachments on the server's disk or in any S3-compatible bucket, with a connection test.",
  },
  {
    slug: "billing",
    name: "Billing",
    description: "For operators who run Dispatch as a paid service for other companies.",
  },
  {
    slug: "deployment",
    name: "Deployment",
    description: "Run it on any server with Docker. One compose file, one DOMAIN variable.",
  },
]

export const integrations: Integration[] = [
  /* ------------------------------ Mail providers ------------------------------ */
  {
    id: "gmail",
    name: "Gmail & Google Workspace",
    category: "mail",
    mark: { text: "G", color: "#ea4335" },
    description: "Connect with Sign in with Google in one click, or over IMAP with an app password.",
    badges: ["OAuth 2.0", "App password"],
    detail: {
      headline: ["Gmail and Google Workspace,", "shared with your whole team."],
      description:
        "Connect support@, sales@ or any Gmail mailbox and work it together in Dispatch. Your mail stays in Gmail: Dispatch syncs it over IMAP and sends replies through Gmail, so they land in Sent as usual.",
      metaDescription:
        "Connect Gmail and Google Workspace to Dispatch with Sign in with Google or an app password. Shared inbox, comments and assignments on top of Gmail.",
      connect: {
        chips: ["OAuth 2.0", "IMAP IDLE", "SMTP"],
        rows: [
          { label: "support@acme.example", value: "Synced · live" },
          { label: "Threads", value: "Gmail thread IDs" },
          { label: "Sent mail", value: "Saved by Gmail" },
        ],
      },
      steps: [
        {
          title: "Create a Google OAuth app once",
          body: "An instance admin creates an OAuth client in Google Cloud, enables the Gmail API and pastes the client ID and secret into Admin → Settings → OAuth.",
        },
        {
          title: "Sign in with Google",
          body: "In Workspace → Settings → Inboxes, choose Connect inbox and sign in with the Google account. Tokens are stored encrypted and refreshed automatically.",
        },
        {
          title: "Mail syncs in",
          body: "The worker imports the last 30 days (or 7, 90 or 365, your choice), then listens with IMAP IDLE, so new mail shows up within seconds.",
        },
        {
          title: "Reply as the mailbox",
          body: "Replies go out through Gmail's SMTP server from the real address, and Gmail files them in Sent like any other client.",
        },
      ],
      enables: [
        {
          feature: "shared-inbox",
          title: "A shared Gmail inbox",
          body: "Give support@ one inbox the team works from, with read, reply or manage access per person or team.",
        },
        {
          feature: "internal-comments",
          title: "Comments next to the email",
          body: "Discuss a Gmail thread with @mentions. The customer never sees them.",
        },
        {
          feature: "assignments",
          title: "A clear owner",
          body: "Assign conversations and see everyone's open workload at a glance.",
        },
        {
          icon: KeyRound,
          title: "Sign in with Google",
          body: "The same OAuth app can let your team sign in to Dispatch with their Google accounts.",
        },
      ],
      visual: "providers",
      setup: {
        intro:
          "There are two ways to connect. Sign in with Google needs a one-time OAuth app per instance; IMAP with an app password works without one.",
        notes: [
          "Scopes: openid, email, profile and https://mail.google.com/, with offline access so the worker can refresh tokens.",
          "For a company Google Workspace, choose the Internal audience. Internal apps need no Google verification.",
          "External apps in Testing mode allow 100 test users and expire every 7 days. Production use needs Google's verification for the restricted Gmail scope.",
          "No OAuth app? Pick the Gmail preset (imap.gmail.com:993, smtp.gmail.com:465) and use an app password, which requires 2-Step Verification.",
        ],
        snippet: {
          title: "Authorized redirect URI",
          lang: "text",
          code: "https://mail.example.com/api/oauth/google/callback",
        },
        docs: [{ label: "Google OAuth app, step by step", file: "connecting-inboxes.md#google-oauth-app" }],
      },
      faq: [
        {
          q: "Do we have to move our email out of Gmail?",
          a: "No. Mail stays in Gmail. Dispatch keeps a synced copy to work with and sends through Gmail, so you can stop using Dispatch at any time and everything is still in the mailbox.",
        },
        {
          q: "Can we connect Gmail without an OAuth app?",
          a: "Yes. Choose the Gmail preset and connect with an app password; Google requires 2-Step Verification for those. Google Workspace admins can disable app passwords, in which case use Sign in with Google.",
        },
        {
          q: "Why does our Gmail inbox disconnect after a week?",
          a: "Your Google OAuth app is External and still in Testing mode, where Google expires authorizations after 7 days. Switch the audience to Internal (Workspace users only) or complete Google's app verification.",
        },
        {
          q: "How much history is imported?",
          a: "The last 30 days by default. When you connect an inbox you can choose 7, 30, 90 or 365 days.",
        },
        {
          q: "Do replies sent from Dispatch show up in Gmail?",
          a: "Yes. Replies are sent through Gmail's SMTP server with your address, and Gmail saves them to Sent automatically.",
        },
      ],
      related: ["microsoft-365", "imap", "anthropic-claude"],
    },
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365 & Outlook",
    category: "mail",
    mark: { text: "M", color: "#0078d4" },
    description: "Outlook.com and Microsoft 365 mailboxes with Sign in with Microsoft (OAuth 2.0).",
    badges: ["OAuth 2.0"],
    detail: {
      headline: ["Outlook and Microsoft 365,", "as a real team inbox."],
      description:
        "Connect Microsoft 365 mailboxes and Outlook.com accounts with Sign in with Microsoft. Dispatch syncs over IMAP with OAuth 2.0 and sends through Microsoft's SMTP servers, so nothing about your mailbox changes.",
      metaDescription:
        "Connect Microsoft 365 and Outlook.com to Dispatch with Sign in with Microsoft (OAuth 2.0) and turn team addresses into a collaborative inbox.",
      connect: {
        chips: ["Microsoft Entra", "IMAP · OAuth 2.0", "SMTP AUTH"],
        rows: [
          { label: "sales@acme.example", value: "Synced · live" },
          { label: "Tenant", value: "organizations" },
          { label: "Sent mail", value: "Saved by Exchange" },
        ],
      },
      steps: [
        {
          title: "Register an app in Microsoft Entra",
          body: "Once per instance: a Web app registration with the Dispatch redirect URI, a client secret, and the delegated IMAP and SMTP permissions.",
        },
        {
          title: "Add it to Dispatch",
          body: "Paste the client ID, the secret and the tenant (common, organizations, consumers or your tenant ID) into Admin → Settings → OAuth → Microsoft.",
        },
        {
          title: "Sign in with Microsoft",
          body: "Connect a mailbox from Workspace → Settings → Inboxes. Tokens are encrypted at rest and refreshed automatically.",
        },
        {
          title: "Work it together",
          body: "New mail arrives through IMAP IDLE within seconds, and replies go out as the mailbox through Microsoft's SMTP.",
        },
      ],
      enables: [
        {
          feature: "shared-inbox",
          title: "A shared Outlook inbox",
          body: "Everyone works from the same queue, signed in as themselves instead of sharing a mailbox password.",
        },
        {
          feature: "assignments",
          title: "Assignments",
          body: "One owner per conversation, with Assigned to me and team views.",
        },
        {
          feature: "snooze-send-later",
          title: "Snooze and send later",
          body: "Park mail until it's relevant and schedule replies for the customer's morning.",
        },
        {
          icon: KeyRound,
          title: "Sign in with Microsoft",
          body: "The same app registration lets your team sign in to Dispatch with their Microsoft accounts.",
        },
      ],
      visual: "inbox",
      setup: {
        intro:
          "Create one app registration per Dispatch instance in the Microsoft Entra admin center. It serves both Sign in with Microsoft and connecting mailboxes.",
        notes: [
          "Delegated permissions: openid, email, profile and offline_access, plus IMAP.AccessAsUser.All and SMTP.Send from Office 365 Exchange Online. Grant admin consent if your tenant requires it.",
          "Enable IMAP and Authenticated SMTP for every mailbox you connect. Many tenants switch SMTP AUTH off by default.",
          "Client secrets expire after 24 months at most. Set a reminder to rotate yours.",
          "Microsoft 365 has turned off password (basic) authentication for IMAP, so use Sign in with Microsoft instead of a password.",
        ],
        snippet: {
          title: "Enable IMAP and SMTP AUTH for a mailbox (Exchange Online PowerShell)",
          lang: "powershell",
          code: "Set-CASMailbox -Identity support@example.com -ImapEnabled $true -SmtpClientAuthenticationDisabled $false",
        },
        docs: [{ label: "Microsoft Entra app, step by step", file: "connecting-inboxes.md#microsoft-entra-app" }],
      },
      faq: [
        {
          q: "Does it work with personal Outlook.com accounts?",
          a: "Yes. Use the tenant common for work, school and personal accounts, or consumers for personal accounts only. A single-tenant app with your tenant ID limits connections to your organization.",
        },
        {
          q: "We see “SmtpClientAuthentication is disabled for the Tenant”.",
          a: "Authenticated SMTP is off for that mailbox or tenant. Enable it in the Microsoft 365 admin center under Users → Active users → Mail → Manage email apps, or with Set-CASMailbox.",
        },
        {
          q: "Can we connect with a password instead?",
          a: "Not for Microsoft 365: Microsoft has turned off basic authentication for IMAP. Sign in with Microsoft uses OAuth 2.0 tokens that Dispatch refreshes automatically.",
        },
        {
          q: "Can the team also sign in to Dispatch with Microsoft?",
          a: "Yes. The same app registration powers Sign in with Microsoft. Switch it on in Admin → Settings → Sign-in once the OAuth app is configured.",
        },
      ],
      related: ["gmail", "imap", "amazon-ses"],
    },
  },
  {
    id: "icloud",
    name: "iCloud Mail",
    category: "mail",
    mark: { text: "iC", color: "#3b82f6" },
    description: "Built-in preset. Connect with an app-specific password from your Apple Account.",
    badges: ["IMAP preset"],
    href: "/integrations/imap",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    category: "mail",
    mark: { text: "F", color: "#2563eb" },
    description: "Built-in preset for Fastmail's IMAP and SMTP servers. Connect with an app password.",
    badges: ["IMAP preset"],
    href: "/integrations/imap",
  },
  {
    id: "zoho",
    name: "Zoho Mail",
    category: "mail",
    mark: { text: "Zo", color: "#d97706" },
    description: "Built-in preset for Zoho's EU servers; use the .com hostnames elsewhere. Enable IMAP access first.",
    badges: ["IMAP preset"],
    href: "/integrations/imap",
  },
  {
    id: "ionos",
    name: "IONOS",
    category: "mail",
    mark: { text: "IO", color: "#1d4ed8" },
    description: "Built-in preset for IONOS mail. US accounts use the .com hostnames.",
    badges: ["IMAP preset"],
    href: "/integrations/imap",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    category: "mail",
    mark: { text: "Y", color: "#6001d2" },
    description: "Built-in preset. Connect with a Yahoo app password.",
    badges: ["IMAP preset"],
    href: "/integrations/imap",
  },
  {
    id: "imap",
    name: "Any IMAP / SMTP",
    category: "mail",
    mark: { text: "@" },
    description: "Any provider or your own mail server: enter the IMAP and SMTP hosts, test the login, done.",
    badges: ["IMAP", "SMTP"],
    detail: {
      headline: ["Any mailbox with IMAP,", "now a shared inbox."],
      description:
        "iCloud, Fastmail, Zoho, IONOS, Yahoo or your own mail server: if it speaks IMAP and SMTP, Dispatch works with it. Pick a preset or enter the servers, and Dispatch tests the login before saving anything.",
      metaDescription:
        "Connect any IMAP/SMTP mailbox to Dispatch: iCloud, Fastmail, Zoho, IONOS, Yahoo or your own server. Built-in presets, TLS and encrypted credentials.",
      connect: {
        chips: ["IMAP · TLS", "SMTP · TLS / STARTTLS", "AES-256-GCM"],
        rows: [
          { label: "hello@studio.example", value: "Synced · live" },
          { label: "IMAP", value: "imap.fastmail.com:993" },
          { label: "SMTP", value: "smtp.fastmail.com:465" },
        ],
      },
      steps: [
        {
          title: "Pick a preset",
          body: "Presets fill in the servers for Gmail, Outlook, iCloud, Fastmail, Zoho, IONOS and Yahoo. For anything else, enter the IMAP and SMTP hosts and ports yourself.",
        },
        {
          title: "Enter your credentials",
          body: "Usually the full email address and an app password. Dispatch tests both the IMAP and the SMTP login before it saves.",
        },
        {
          title: "Choose how much history",
          body: "Import the last 7, 30, 90 or 365 days. The worker keeps one live IMAP connection per inbox and uses IDLE for new mail, with a 60-second safety poll.",
        },
        {
          title: "Reply from the same address",
          body: "Replies go out through the mailbox's own SMTP server. For providers that don't file sent mail themselves, Dispatch can upload a copy to the Sent folder.",
        },
      ],
      enables: [
        {
          feature: "shared-inbox",
          title: "Shared inboxes",
          body: "Turn hello@ or info@ into an inbox the whole team works from, without sharing its password.",
        },
        {
          feature: "contacts",
          title: "Contacts from your mail",
          body: "Senders and recipients become shared contacts with their full conversation history.",
        },
        {
          icon: AtSign,
          title: "Aliases and auto CC/BCC",
          body: "Send from other addresses delivered to the same mailbox, and copy an archive address automatically.",
        },
        {
          icon: MailCheck,
          title: "Read status on the server",
          body: "Optionally mark mail as read in the mailbox when a teammate reads it in Dispatch.",
        },
      ],
      visual: "inbox",
      setup: {
        intro:
          "Everything happens in Workspace → Settings → Inboxes → Connect inbox. These are the presets the form fills in; you can change any value.",
        presets: true,
        notes: [
          "IMAP uses port 993 with TLS. SMTP uses 465 (TLS) or 587 (STARTTLS).",
          "iCloud, Fastmail and Yahoo need an app password. Zoho needs IMAP access switched on in its settings first.",
          "Your server needs outbound access to the provider's IMAP (993) and SMTP (465/587) ports.",
          "Mail server on a private IP? Private instances can turn off Admin → Settings → Security → Block private networks.",
          "Passwords are tested before saving, stored encrypted with AES-256-GCM and never shown again.",
        ],
        docs: [{ label: "IMAP presets and troubleshooting", file: "connecting-inboxes.md#imap--smtp" }],
      },
      faq: [
        {
          q: "Which providers work?",
          a: "Any provider that offers IMAP and SMTP. Presets cover Gmail, Outlook, iCloud Mail, Fastmail, Zoho Mail, IONOS and Yahoo Mail; for everything else, including your own Postfix/Dovecot or Exchange server, enter the hosts yourself.",
        },
        {
          q: "Why does the login fail with AUTHENTICATIONFAILED?",
          a: "Usually a wrong password, or the provider requires an app password (or OAuth) for IMAP. Create an app password in the provider's account settings and try again.",
        },
        {
          q: "Does Dispatch delete mail on our server?",
          a: "No. Dispatch reads mail over IMAP and keeps its own copy to work with. The only things it writes back are optional: a copy of sent replies in the Sent folder, and read status when you turn that on.",
        },
        {
          q: "Our mail server is on the local network. Can Dispatch reach it?",
          a: "Yes on private instances. If Block private networks is on (recommended for public SaaS instances), connections to private ranges such as 10.x, 192.168.x or localhost are refused; switch it off in Admin → Settings → Security.",
        },
      ],
      related: ["gmail", "microsoft-365", "webhooks-api"],
    },
  },

  /* ------------------------------- System email ------------------------------- */
  {
    id: "amazon-ses",
    name: "Amazon SES",
    category: "delivery",
    mark: { text: "SES", color: "#ff9900" },
    description: "High-volume system email through the SES SMTP interface. Enter a region and SMTP credentials.",
    badges: ["Built in"],
    detail: {
      headline: ["System email on Amazon SES.", "Every sign-in link, delivered."],
      description:
        "Dispatch sends a few emails itself: sign-in links and codes, workspace invitations, and notifications about mentions and assignments. Route them through Amazon SES with a region and a set of SMTP credentials.",
      metaDescription:
        "Send Dispatch's system emails (sign-in links, invitations and notifications) through Amazon SES. A region plus SMTP credentials, with a built-in test email.",
      connect: {
        chips: ["SES SMTP interface", "Port 587 · STARTTLS", "SPF · DKIM · DMARC"],
        rows: [
          { label: "Endpoint", value: "email-smtp.eu-central-1.amazonaws.com" },
          { label: "From", value: "no-reply@acme.example" },
          { label: "Test email", value: "Delivered" },
        ],
      },
      steps: [
        {
          title: "Verify your domain in SES",
          body: "Create a domain identity in the region you want to send from and add the Easy DKIM records. A custom MAIL FROM subdomain aligns SPF for DMARC.",
        },
        {
          title: "Create SMTP credentials",
          body: "SES creates an IAM user that may send. Copy the SMTP username and password; the password is shown once and is not your IAM secret key.",
        },
        {
          title: "Leave the sandbox",
          body: "Request production access for transactional mail, so Dispatch can email any address and not only verified ones.",
        },
        {
          title: "Configure Dispatch",
          body: "In Admin → Settings → Email (or the first-run wizard), choose Amazon SES, enter the region, credentials and a From address, then send a test email.",
        },
      ],
      enables: [
        {
          icon: KeyRound,
          title: "Passwordless sign-in",
          body: "Magic links and one-time codes are how everyone signs in, so they need to arrive quickly.",
        },
        {
          icon: UserPlus,
          title: "Workspace invitations",
          body: "Invite teammates by email from the members settings.",
        },
        {
          icon: Bell,
          title: "Mention and assignment emails",
          body: "If a mention or assignment is still unread after a minute, Dispatch emails it to the person.",
        },
        {
          icon: Reply,
          title: "Customer replies stay separate",
          body: "Replies to customers always leave through each inbox's own SMTP server, never through SES.",
        },
      ],
      visual: "delivery",
      setup: {
        intro:
          "SES is set up in the AWS console once. Dispatch then needs only the region, the SMTP credentials and a sender address on the verified domain.",
        notes: [
          "Dispatch connects to email-smtp.<region>.amazonaws.com. The region defaults to eu-central-1 (Frankfurt).",
          "Use SMTP credentials created in the same region as your verified identity.",
          "Publish SPF, DKIM and DMARC for the sender domain. Start DMARC at p=none and tighten it once reports look clean.",
          "Until email is configured, Dispatch prints system emails, including sign-in links, to the logs instead of sending them.",
          "Prefer another provider? Choose SMTP and use Postmark, Mailgun, Resend, Brevo or your own server.",
        ],
        snippet: {
          title: "DNS records (example)",
          lang: "dns",
          code: `# SPF on the custom MAIL FROM subdomain
bounce.example.com.           TXT    "v=spf1 include:amazonses.com ~all"
# DKIM: three CNAMEs from the SES console
abc._domainkey.example.com.   CNAME  abc.dkim.amazonses.com
# DMARC: start with p=none
_dmarc.example.com.           TXT    "v=DMARC1; p=none; rua=mailto:dmarc@example.com"`,
        },
        docs: [
          { label: "Amazon SES, step by step", file: "email-delivery.md#amazon-ses" },
          { label: "Sender address and DNS", file: "email-delivery.md#sender-address-and-dns" },
        ],
      },
      faq: [
        {
          q: "Does Dispatch send customer replies through SES?",
          a: "No. SES only carries Dispatch's own system emails. Replies to customers go out through the SMTP server of the connected inbox, so they come from your real mailbox and land in its Sent folder.",
        },
        {
          q: "Our SES account is new. Can we test before production access?",
          a: "Yes. In the sandbox you can only send to verified addresses, so verify your own address under Identities and send the test email there.",
        },
        {
          q: "We get “535 Authentication Credentials Invalid”.",
          a: "Make sure you use SES SMTP credentials, not an IAM access key, and that they were created in the same region you selected in Dispatch.",
        },
        {
          q: "Can we use a different email provider?",
          a: "Yes. Choose SMTP in Admin → Settings → Email for Postmark, Mailgun, Brevo, Resend, SendGrid, your own server or a Microsoft 365 or Google Workspace mailbox.",
        },
      ],
      related: ["imap", "microsoft-365", "webhooks-api"],
    },
  },
  {
    id: "postmark",
    name: "Postmark",
    category: "delivery",
    mark: { text: "P", color: "#e5b700" },
    description: "Transactional delivery through Postmark's SMTP server and your server token.",
    badges: ["via SMTP"],
    href: docsUrl("email-delivery.md#smtp"),
  },
  {
    id: "mailgun",
    name: "Mailgun",
    category: "delivery",
    mark: { text: "Mg", color: "#e5484d" },
    description: "Mailgun's SMTP credentials, in the US or EU region (smtp.eu.mailgun.org).",
    badges: ["via SMTP"],
    href: docsUrl("email-delivery.md#smtp"),
  },
  {
    id: "resend",
    name: "Resend",
    category: "delivery",
    mark: { text: "R" },
    description: "Resend's SMTP relay with your Resend credentials, using the standard SMTP settings.",
    badges: ["via SMTP"],
    href: docsUrl("email-delivery.md#smtp"),
  },
  {
    id: "brevo",
    name: "Brevo",
    category: "delivery",
    mark: { text: "B", color: "#0b996e" },
    description: "Brevo's SMTP relay (smtp-relay.brevo.com) with an SMTP key.",
    badges: ["via SMTP"],
    href: docsUrl("email-delivery.md#smtp"),
  },
  {
    id: "smtp",
    name: "Any SMTP server",
    category: "delivery",
    mark: { icon: Send },
    description: "SendGrid, your own Postfix, or a Microsoft 365 / Google Workspace mailbox. Port 587 or 465.",
    badges: ["SMTP"],
    href: docsUrl("email-delivery.md#smtp"),
  },

  /* ------------------------------------ AI ------------------------------------ */
  {
    id: "anthropic-claude",
    name: "Anthropic Claude",
    category: "ai",
    mark: { text: "A", color: "#d97757" },
    description: "Claude through the Anthropic Messages API, with your own key and the model of your choice.",
    badges: ["Your API key"],
    detail: {
      headline: ["Claude in your team inbox.", "With your own key."],
      description:
        "Summarize long threads, draft replies, rewrite and translate with Claude, right inside the conversation. Dispatch calls the Anthropic API with a key you control, and nothing is sent until an admin switches it on.",
      metaDescription:
        "Use Anthropic Claude in Dispatch: thread summaries, reply drafts, rewrites and translation with your own API key. Off by default, workspace keys optional.",
      connect: {
        chips: ["Messages API", "Your API key", "Off by default"],
        rows: [
          { label: "Provider", value: "Anthropic" },
          { label: "Model", value: "claude-sonnet-5" },
          { label: "API key", value: "Encrypted · instance" },
        ],
      },
      steps: [
        {
          title: "Add your key",
          body: "A super admin opens Admin → Settings → AI, chooses Anthropic, pastes an API key and picks a model, then tests the connection.",
        },
        {
          title: "Decide who pays",
          body: "Use one instance key for everyone, or let each workspace bring its own Anthropic key. A workspace can also switch AI off entirely.",
        },
        {
          title: "Ask from the conversation",
          body: "Summarize, draft, improve or translate in one click. Only the thread or text you ask about is sent, and email content is marked as untrusted data in the prompt.",
        },
        {
          title: "Review, then send",
          body: "Suggestions land in the composer. Nothing goes to a customer until a person sends it.",
        },
      ],
      enables: [
        {
          feature: "ai-assistant",
          title: "Thread summaries",
          body: "A one-line summary, the key facts, next steps and the customer's sentiment, internal comments included.",
        },
        {
          icon: PenLine,
          title: "Reply drafts",
          body: "Friendly, formal or concise, with optional instructions, building on what you've already typed.",
        },
        {
          icon: WandSparkles,
          title: "Improve writing",
          body: "Fix spelling and grammar, make it shorter or longer, friendlier or more formal.",
        },
        {
          icon: Languages,
          title: "Translation",
          body: "Translate a draft into any language, keeping names, numbers, links and placeholders.",
        },
      ],
      visual: "ai",
      setup: {
        intro:
          "The assistant is off by default. Configure it once for the instance; workspace admins can override it with their own key if you allow that.",
        notes: [
          "The default model is claude-sonnet-5. Any Claude model name your key can access works.",
          "API keys are stored encrypted with AES-256-GCM and never shown again.",
          "Allow or disallow workspace keys in Admin → Settings → AI.",
          "Drafts are written in the language of the customer's latest message; summaries follow the conversation.",
          "Prefer OpenAI or a local model? Choose OpenAI and set a base URL for OpenRouter, Ollama, LM Studio or vLLM.",
        ],
        docs: [
          { label: "AI settings in the configuration guide", file: "configuration.md" },
          { label: "What is sent where (security)", file: "security.md" },
        ],
      },
      faq: [
        {
          q: "What exactly is sent to Anthropic?",
          a: "Only what someone asks about: the conversation they're working on (emails and internal comments, most recent first, trimmed to a size limit) or the text they want rewritten or translated. Nothing is sent in the background.",
        },
        {
          q: "Is our data used to train models?",
          a: "Dispatch sends requests with your own API key, under your agreement with Anthropic. Check Anthropic's commercial terms for how API data is handled and retained.",
        },
        {
          q: "Can each workspace use its own key?",
          a: "Yes, if the instance allows workspace keys (on by default). The workspace key then takes precedence over the instance key, and usage is billed to that workspace's Anthropic account.",
        },
        {
          q: "Which Claude model does Dispatch use?",
          a: "claude-sonnet-5 by default. The admin can enter any other Claude model name, for example a faster, cheaper one for high-volume teams.",
        },
        {
          q: "Can we use OpenAI or a self-hosted model instead?",
          a: "Yes. Choose the OpenAI provider and optionally a base URL: OpenAI, OpenRouter, Ollama, LM Studio, vLLM and other OpenAI-compatible servers work. Local servers such as Ollama don't need a key.",
        },
      ],
      related: ["webhooks-api", "gmail", "imap"],
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    mark: { text: "O", color: "#10a37f" },
    description: "GPT models through the chat completions API, with your own OpenAI key.",
    badges: ["Your API key"],
    href: "/features/ai-assistant",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "ai",
    mark: { text: "OR", color: "#6366f1" },
    description: "Many providers' models behind one OpenAI-compatible endpoint. Set the base URL and key.",
    badges: ["OpenAI-compatible"],
    href: "/features/ai-assistant",
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "ai",
    mark: { text: "Ol" },
    description: "Open models on your own hardware. No API key needed, just the base URL.",
    badges: ["OpenAI-compatible", "Local"],
    href: "/features/ai-assistant",
  },
  {
    id: "openai-compatible",
    name: "Any OpenAI-compatible API",
    category: "ai",
    mark: { icon: Cpu },
    description: "LM Studio, vLLM and other servers that speak /chat/completions.",
    badges: ["OpenAI-compatible"],
    href: "/features/ai-assistant",
  },

  /* ----------------------------- Automation & API ----------------------------- */
  {
    id: "webhooks-api",
    name: "Webhooks & REST API",
    category: "automation",
    mark: { icon: Webhook, color: "#2fb56a" },
    description: "Workspace API keys, a JSON REST API and HMAC-signed webhooks for 10 events.",
    badges: ["Built in"],
    detail: {
      headline: ["Build your own integration.", "REST API and signed webhooks."],
      description:
        "The Dispatch web app runs on the same JSON API you get. Create a workspace API key, script conversations, comments, tasks and contacts, and receive signed webhooks the moment something happens. Zapier, Make and n8n connect through the same endpoints.",
      metaDescription:
        "Dispatch REST API and HMAC-signed webhooks: automate conversations, comments, tasks and contacts, and connect Zapier, Make or n8n via webhooks and the API.",
      connect: {
        chips: ["REST · JSON", "Bearer dsp_…", "HMAC-SHA256"],
        rows: [
          { label: "conversation.assigned", value: "200 · 61 ms" },
          { label: "comment.created", value: "200 · 72 ms" },
          { label: "message.sent", value: "503 · retry in 1 min" },
        ],
      },
      steps: [
        {
          title: "Create an API key",
          body: "In Workspace → Settings → Integrations → API keys. A key acts as the member who created it, so give integrations their own member with a narrow custom role.",
        },
        {
          title: "Call the API",
          body: "Send the key as a bearer token to https://<DOMAIN>/api/w/<workspace>/…: list and update conversations, reply, comment, create tasks and manage contacts.",
        },
        {
          title: "Subscribe to webhooks",
          body: "Choose events such as conversation.created or comment.created and copy the signing secret. Dispatch POSTs JSON to your endpoint as they happen.",
        },
        {
          title: "Verify and acknowledge",
          body: "Check the X-Dispatch-Signature HMAC, answer with a 2xx within 10 seconds and deduplicate on the event id. Failures are retried for up to 6 attempts.",
        },
      ],
      enables: [
        {
          feature: "api-webhooks",
          title: "REST API",
          body: "Conversations, messages, comments, tasks, contacts, labels, members and full-text search over JSON.",
        },
        {
          icon: Webhook,
          title: "10 webhook events",
          body: "Conversations created, closed, reopened, assigned or labeled; messages received and sent; comments; tasks created and completed.",
        },
        {
          feature: "rules-automation",
          title: "Rule webhooks",
          body: "A rule's Call a webhook action POSTs the matching conversation to any URL.",
        },
        {
          icon: Zap,
          title: "Zapier, Make and n8n",
          body: "Start a Zap, scenario or workflow from a webhook and call the API back with an HTTP step. No native app needed.",
        },
      ],
      visual: "api",
      setup: {
        intro:
          "API keys and webhooks live in Workspace → Settings → Integrations and need the Manage integrations permission.",
        notes: [
          "Keys look like dsp_… and are shown once. Dispatch stores only a hash; keys can expire and be revoked at any time.",
          "Large collections are cursor-paginated: pass limit (max 100) and follow nextCursor until it's null.",
          "Errors always have the same shape. Match on error.code, not on the message.",
          "Retries after 1 min, 5 min, 30 min, 2 h and 6 h. A webhook is disabled after 50 consecutive failed attempts.",
          "Each webhook keeps a 30-day delivery log with status codes and response bodies. Redirects are not followed.",
        ],
        snippet: {
          title: "Verify a webhook signature (Node.js)",
          lang: "js",
          code: `import crypto from "node:crypto"

export function verifyDispatchSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const t = Number(parts.t)
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > 300) return false
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(parts.v1, "hex")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}`,
        },
        docs: [
          { label: "REST API reference", file: "api.md" },
          { label: "Webhook events, payloads and retries", file: "api.md#webhooks" },
        ],
      },
      faq: [
        {
          q: "Is there a native Zapier or Make app?",
          a: "Not yet. Zapier, Make and n8n work today through webhooks and the REST API: use a webhook trigger (Webhooks by Zapier, Make's custom webhook or n8n's Webhook node) and HTTP steps to call Dispatch back.",
        },
        {
          q: "What can an API key access?",
          a: "Exactly what the member who created it can: same role, same inbox access, one workspace. Create a dedicated member such as “Automation” with a narrow custom role for integrations.",
        },
        {
          q: "How do I verify a webhook?",
          a: "The X-Dispatch-Signature header carries a timestamp t and v1, the HMAC-SHA256 of “t.rawBody” keyed with your webhook secret. Recompute it over the raw request body, compare in constant time and reject timestamps older than 5 minutes.",
        },
        {
          q: "What happens when our endpoint is down?",
          a: "Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. After 50 consecutive failed attempts the webhook is disabled and the audit log records it; re-enable it once your endpoint works again.",
        },
        {
          q: "Are rule webhooks signed too?",
          a: "No. The Call a webhook rule action sends no signature and no delivery ID. Put a secret token in the URL and check it on your side.",
        },
      ],
      related: ["anthropic-claude", "amazon-ses", "gmail"],
    },
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "automation",
    mark: { text: "Zp", color: "#ff4f00" },
    description: "Catch Dispatch webhooks with Webhooks by Zapier and call the REST API from any Zap.",
    badges: ["via webhooks & API"],
    href: "/integrations/webhooks-api",
  },
  {
    id: "make",
    name: "Make",
    category: "automation",
    mark: { text: "Mk", color: "#6d00cc" },
    description: "Start scenarios from a custom webhook and call the API with the HTTP module.",
    badges: ["via webhooks & API"],
    href: "/integrations/webhooks-api",
  },
  {
    id: "n8n",
    name: "n8n",
    category: "automation",
    mark: { text: "n8n", color: "#ea4b71" },
    description: "Self-host both: a Webhook trigger node for events, HTTP Request nodes for the API.",
    badges: ["via webhooks & API"],
    href: "/integrations/webhooks-api",
  },

  /* -------------------------------- Storage -------------------------------- */
  {
    id: "local-disk",
    name: "Local disk",
    category: "storage",
    mark: { icon: HardDrive },
    description: "The default. Attachments live in the /data volume, next to the master key.",
    badges: ["Default"],
    href: docsUrl("backup.md"),
  },
  {
    id: "aws-s3",
    name: "Amazon S3",
    category: "storage",
    mark: { text: "S3", color: "#3f8624" },
    description: "An S3 bucket with endpoint, region and access keys. Test the connection before saving.",
    badges: ["S3"],
    href: docsUrl("configuration.md"),
  },
  {
    id: "cloudflare-r2",
    name: "Cloudflare R2",
    category: "storage",
    mark: { text: "R2", color: "#f38020" },
    description: "Point the S3 driver at your R2 endpoint. The region defaults to auto.",
    badges: ["S3-compatible"],
    href: docsUrl("configuration.md"),
  },
  {
    id: "minio",
    name: "MinIO",
    category: "storage",
    mark: { text: "Mn", color: "#c72e49" },
    description: "Self-hosted object storage. Path-style addressing is on by default.",
    badges: ["S3-compatible"],
    href: docsUrl("configuration.md"),
  },
  {
    id: "hetzner",
    name: "Hetzner Object Storage",
    category: "storage",
    mark: { text: "H", color: "#d50c2d" },
    description: "S3-compatible buckets in Hetzner's European data centers.",
    badges: ["S3-compatible"],
    href: docsUrl("configuration.md"),
  },
  {
    id: "s3-compatible",
    name: "Any S3-compatible store",
    category: "storage",
    mark: { icon: Boxes },
    description: "Other providers with an S3 API: set the endpoint, region and the path-style option.",
    badges: ["S3-compatible"],
    href: docsUrl("configuration.md"),
  },

  /* -------------------------------- Billing -------------------------------- */
  {
    id: "stripe",
    name: "Stripe",
    category: "billing",
    mark: { text: "S", color: "#635bff" },
    description:
      "Checkout, the Customer Portal and signed webhooks for flat per-workspace subscriptions when Dispatch runs in SaaS mode.",
    badges: ["SaaS mode"],
    href: docsUrl("billing.md"),
  },

  /* ------------------------------- Deployment ------------------------------- */
  {
    id: "docker-compose",
    name: "Docker Compose",
    category: "deployment",
    mark: { icon: Container, color: "#1d63ed" },
    description: "App, worker and Postgres in one compose file, plus an optional Caddy override for automatic HTTPS.",
    badges: ["Official"],
    href: "/self-hosting",
  },
  {
    id: "coolify",
    name: "Coolify",
    category: "deployment",
    mark: { text: "C", color: "#7c3aed" },
    description: "Deploy the same compose file from the public repo. Coolify runs the proxy and issues the certificate.",
    badges: ["Compose build pack"],
    href: docsUrl("coolify.md"),
  },
]

/** Integrations with their own page at /integrations/[slug]. */
export const detailedIntegrations = integrations.filter(
  (i): i is Integration & { detail: NonNullable<Integration["detail"]> } => Boolean(i.detail)
)

export function getIntegration(slug: string) {
  return detailedIntegrations.find((i) => i.id === slug)
}

export function getIntegrationsByCategory(category: IntegrationCategorySlug) {
  return integrations.filter((i) => i.category === category)
}

/** Where an integration tile links to. */
export function integrationHref(i: Integration): string | undefined {
  return i.detail ? `/integrations/${i.id}` : i.href
}

/** Detailed integrations whose "What it enables" section links the given feature. */
export function getIntegrationsForFeature(featureSlug: string) {
  return detailedIntegrations.filter((i) => i.detail.enables.some((e) => e.feature === featureSlug))
}
