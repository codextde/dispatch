import type { ChangelogEntry } from "./types"

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0",
    date: "2026-09-27",
    title: "Dispatch is open source",
    summary:
      "The first public release of Dispatch: a collaborative inbox for teams on top of Gmail, Outlook or any IMAP mailbox. Licensed under AGPL-3.0, free to self-host with Docker Compose, and available as a hosted Cloud workspace.",
    groups: [
      {
        name: "Shared inboxes",
        items: [
          "Connect Gmail and Google Workspace, Outlook and Microsoft 365, or any IMAP/SMTP mailbox",
          "Team inboxes shared with the people who need them, plus personal inboxes",
          "Labels, snooze, send later and undo send",
          "Rich-text composer with signatures and attachments",
          "Full-text search across conversations",
          "Sandboxed email rendering with remote-image blocking",
        ],
      },
      {
        name: "Collaboration",
        items: [
          "Internal comments and @mentions on any conversation",
          "Assignments with an \"Assigned to me\" view",
          "Realtime presence showing who is viewing or typing",
          "Collision detection and collaborative drafts",
          "In-app notifications for mentions and assignments",
        ],
      },
      {
        name: "Workflow & automation",
        items: [
          "Rules with conditions and actions: label, assign, snooze, close, auto-reply, forward or call a webhook",
          "Canned responses with variables such as {{contact.first_name}}",
          "Keyboard shortcuts and a command palette",
          "Analytics for volume, first-reply time, resolution time and busiest hours, per inbox, team and teammate",
        ],
      },
      {
        name: "Team chat & tasks",
        items: [
          "Team chat with group chats and direct messages",
          "Tasks with assignees and due dates, standalone or linked to a conversation",
          "Contacts built automatically from your mail, with conversation history",
        ],
      },
      {
        name: "AI",
        items: [
          "Summarize long threads and draft or improve replies",
          "Bring your own Anthropic or OpenAI key, per instance or per workspace",
          "Off by default until an admin configures a provider",
        ],
      },
      {
        name: "Admin & security",
        items: [
          "Passwordless magic-link login; sessions stay valid for a year and renew while in use",
          "Stay signed in on multiple devices and revoke any of them",
          "Roles with custom permissions and inbox-level access",
          "Audit log for important actions",
          "Mail credentials encrypted at rest with AES-256-GCM",
          "Multiple workspaces per instance at /w/[slug] and a super-admin panel",
        ],
      },
      {
        name: "Developer",
        items: [
          "REST API with API keys",
          "Webhooks with signed payloads",
        ],
      },
      {
        name: "Self-hosting",
        items: [
          "Docker Compose deployment; the .env file only needs DOMAIN",
          "Works on Coolify with the bundled compose file",
          "Everything else is configured in the UI through a first-run setup wizard",
          "SMTP or Amazon SES for login and notification emails",
          "Optional Stripe-based billing for operators who host Dispatch for others",
        ],
      },
    ],
  },
]
