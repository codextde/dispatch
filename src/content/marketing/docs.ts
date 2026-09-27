import {
  ArchiveRestore,
  CircleArrowUp,
  CodeXml,
  CreditCard,
  Inbox,
  Layers,
  Mail,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Webhook,
  Wrench,
} from "lucide-react"
import type { DocPage } from "./types"

/** The guides in the repo's docs/ folder, grouped like docs/README.md. */
export const docGroups: { title: string; description: string; pages: DocPage[] }[] = [
  {
    title: "Running Dispatch",
    description: "Install, configure and operate your own instance.",
    pages: [
      {
        file: "self-hosting.md",
        title: "Self-hosting",
        description: "Requirements, quick start with Docker Compose, reverse proxy and TLS, where data lives.",
        icon: Server,
        related: { label: "Self-hosting guide", href: "/self-hosting" },
      },
      {
        file: "coolify.md",
        title: "Deploy on Coolify",
        description: "Deploy the compose file on Coolify v4 in about ten minutes, step by step.",
        icon: Layers,
      },
      {
        file: "configuration.md",
        title: "Configuration",
        description: "The DOMAIN variable, advanced overrides, and every admin and workspace setting.",
        icon: SlidersHorizontal,
      },
      {
        file: "email-delivery.md",
        title: "Email delivery",
        description: "SMTP or Amazon SES for sign-in links, invitations and notifications, plus SPF, DKIM and DMARC.",
        icon: Mail,
        related: { label: "Amazon SES integration", href: "/integrations/amazon-ses" },
      },
      {
        file: "connecting-inboxes.md",
        title: "Connecting inboxes",
        description: "IMAP presets and the Google and Microsoft OAuth apps for Gmail and Microsoft 365.",
        icon: Inbox,
        related: { label: "Mail integrations", href: "/integrations#mail" },
      },
      {
        file: "billing.md",
        title: "Billing",
        description: "Run Dispatch as a paid service with Stripe Checkout, trials and the Customer Portal.",
        icon: CreditCard,
      },
      {
        file: "upgrading.md",
        title: "Upgrading",
        description: "Pull, restart and let the migrations run. Pinning versions and rolling back.",
        icon: CircleArrowUp,
      },
      {
        file: "backup.md",
        title: "Backup & restore",
        description: "Back up the database and the master key together, automate it, and restore.",
        icon: ArchiveRestore,
      },
    ],
  },
  {
    title: "Building with Dispatch",
    description: "Automate your workspace, understand the internals, contribute.",
    pages: [
      {
        file: "api.md",
        title: "REST API & webhooks",
        description: "API keys, conventions, resources, webhook events, signatures and retries.",
        icon: Webhook,
        related: { label: "Webhooks & API integration", href: "/integrations/webhooks-api" },
      },
      {
        file: "architecture.md",
        title: "Architecture",
        description: "App, worker and Postgres; the data model, permissions and realtime without Redis.",
        icon: CodeXml,
      },
      {
        file: "security.md",
        title: "Security",
        description: "The threat model, the controls behind it and an operator checklist.",
        icon: ShieldCheck,
        related: { label: "Security overview", href: "/security" },
      },
      {
        file: "development.md",
        title: "Development",
        description: "Run Dispatch locally, how the code is organized, and the project's conventions.",
        icon: Wrench,
        related: { label: "Contributing", href: "/open-source" },
      },
    ],
  },
]

export const docsQuickStart = `mkdir -p /opt/dispatch && cd /opt/dispatch

# Compose file + Caddy override for automatic HTTPS
curl -fsSLO https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.override.example.yml -o docker-compose.override.yml

# The only setting
echo "DOMAIN=mail.example.com" > .env
docker compose up -d

# One-time setup code for https://mail.example.com/setup
docker compose logs app | grep -A2 "setup code"`
