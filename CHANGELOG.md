# Changelog

All notable changes to Dispatch are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Dispatch follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-27

The first public release of Dispatch: an open-source collaborative inbox for teams on top of Gmail, Outlook or any IMAP mailbox. Licensed under AGPL-3.0, free to self-host, and available as hosted Dispatch Cloud.

### Shared inboxes

- Connect Gmail / Google Workspace and Outlook / Microsoft 365 via OAuth, or any IMAP/SMTP mailbox
- Shared team inboxes with per-user and per-team access (read, reply, manage), plus personal inboxes
- Labels, snooze, send later and undo send
- Rich-text composer with signatures, attachments and canned responses with variables
- Full-text search across conversations
- Sandboxed email rendering with remote-image blocking

### Collaboration

- Internal comments with @mentions on any conversation
- Assignments with an "Assigned to me" view
- Realtime presence, typing indicators, collision detection and collaborative drafts
- In-app and email notifications for mentions and assignments
- Team chat with channels and direct messages
- Tasks with assignees and due dates, standalone or linked to conversations
- Contacts built automatically from your mail

### Automation & insights

- Rules with conditions and actions: label, assign, move, archive, notify, call a webhook
- Analytics for volume, first-reply time, resolution time and workload
- AI assistant for summaries and drafts with your own Anthropic or OpenAI key
- Keyboard shortcuts and a command palette

### Administration

- Multiple workspaces per instance, each with its own admin area
- Custom roles and permissions, teams and an audit log
- Passwordless magic-link sign-in, sessions valid for a year on any number of devices
- Super-admin panel for instance settings: email delivery (SMTP, Amazon SES), OAuth apps, storage (local or S3), AI, branding, security and legal pages
- Optional Stripe billing for operators who host Dispatch for others

### Developers

- REST API with workspace API keys
- Signed webhooks for conversation, message, comment and task events

### Self-hosting

- Docker image for `linux/amd64` and `linux/arm64` (`ghcr.io/codextde/dispatch`)
- Docker Compose deployment whose `.env` only needs `DOMAIN`. All secrets are generated on first boot.
- Works on Coolify with the bundled compose file
- First-run setup wizard, automatic database migrations, health endpoint at `/api/health`

[Unreleased]: https://github.com/codextde/dispatch/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/codextde/dispatch/releases/tag/v1.0.0
