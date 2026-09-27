"use client"

import {
  Bell,
  Building2,
  Code2,
  CreditCard,
  Inbox,
  KeyRound,
  MailPlus,
  MessageSquareText,
  PenLine,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  User,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import type { Permission } from "@/lib/permissions"

export type SettingsNavItem = {
  /** Path segment below /w/[slug]/settings */
  href: string
  label: string
  icon: LucideIcon
  /** Visible when the member has any of these permissions (omit = everyone) */
  permission?: Permission | Permission[]
  keywords?: string
}

export type SettingsNavGroup = { label: string; items: SettingsNavItem[] }

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: "Personal",
    items: [
      { href: "profile", label: "Profile", icon: User, keywords: "name avatar timezone away out of office" },
      { href: "preferences", label: "Preferences", icon: SlidersHorizontal, keywords: "theme density shortcuts undo send" },
      { href: "notifications", label: "Notifications", icon: Bell, keywords: "email desktop mentions" },
      { href: "security", label: "Security & devices", icon: ShieldCheck, keywords: "sessions devices sign out" },
      {
        href: "personal-inboxes",
        label: "My inboxes",
        icon: MailPlus,
        permission: "inboxes.connect_personal",
        keywords: "personal email account connect",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "general", label: "General", icon: Building2, permission: "settings.manage", keywords: "name slug logo ai" },
      { href: "members", label: "Members", icon: Users, permission: ["members.manage", "members.invite"], keywords: "invite people" },
      { href: "teams", label: "Teams", icon: UsersRound, permission: "teams.manage" },
      { href: "roles", label: "Roles & permissions", icon: KeyRound, permission: "roles.manage" },
      { href: "inboxes", label: "Inboxes", icon: Inbox, permission: "inboxes.manage", keywords: "shared email imap gmail outlook" },
    ],
  },
  {
    label: "Productivity",
    items: [
      { href: "labels", label: "Labels", icon: Tags },
      { href: "responses", label: "Canned responses", icon: MessageSquareText, keywords: "templates snippets" },
      { href: "signatures", label: "Signatures", icon: PenLine },
      { href: "rules", label: "Rules", icon: Workflow, permission: ["rules.manage", "inboxes.connect_personal"], keywords: "automation filters" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "integrations", label: "API & webhooks", icon: Code2, permission: "integrations.manage", keywords: "api keys webhooks" },
      { href: "billing", label: "Billing", icon: CreditCard, permission: "billing.manage", keywords: "subscription plan invoices" },
      { href: "audit-log", label: "Audit log", icon: ScrollText, permission: "audit.view", keywords: "security events" },
    ],
  },
]

export function visibleNav(can: (p: Permission) => boolean): SettingsNavGroup[] {
  return SETTINGS_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (!i.permission) return true
      const perms = Array.isArray(i.permission) ? i.permission : [i.permission]
      return perms.some(can)
    }),
  })).filter((g) => g.items.length > 0)
}
