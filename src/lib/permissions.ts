/**
 * Workspace permissions. Shared between client and server.
 *
 * Every member has exactly one role per workspace. Roles are a set of the
 * permission keys below. The four system roles are created with every
 * workspace; admins can create custom roles in Settings → Roles.
 *
 * Access to individual inboxes (email accounts) is managed separately via
 * inbox access (per user or per team) — see `accountAccess`.
 */

export const PERMISSIONS = {
  // Conversations
  "conversations.read": {
    group: "Conversations",
    label: "Read conversations",
    description: "Read conversations, messages and comments in the inboxes they can access (required scope for restricted API keys).",
  },
  "conversations.view_all": {
    group: "Conversations",
    label: "View all shared inboxes",
    description: "See every shared inbox in the workspace, regardless of inbox access.",
  },
  "conversations.reply": {
    group: "Conversations",
    label: "Reply to customers",
    description: "Send emails from shared inboxes they have access to.",
  },
  "conversations.assign": {
    group: "Conversations",
    label: "Assign conversations",
    description: "Assign conversations to teammates and teams.",
  },
  "conversations.delete": {
    group: "Conversations",
    label: "Delete conversations",
    description: "Move conversations to trash and permanently delete them.",
  },
  "conversations.export": {
    group: "Conversations",
    label: "Export conversations",
    description: "Download conversations and attachments.",
  },
  // Collaboration
  "chats.create": {
    group: "Collaboration",
    label: "Create team chats",
    description: "Start internal chat rooms with teammates.",
  },
  "tasks.read": {
    group: "Collaboration",
    label: "Read tasks",
    description: "Read the tasks they can see (required scope for restricted API keys).",
  },
  "tasks.manage": {
    group: "Collaboration",
    label: "Manage tasks",
    description: "Create and edit tasks for anyone in the workspace.",
  },
  "contacts.view": {
    group: "Collaboration",
    label: "View shared contacts",
    description: "See the whole shared address book. Without it, only contacts from conversations they can see.",
  },
  "contacts.read": {
    group: "Collaboration",
    label: "Read contacts",
    description: "Read the contacts they can see (required scope for restricted API keys).",
  },
  "contacts.manage": {
    group: "Collaboration",
    label: "Manage shared contacts",
    description: "Edit the shared address book.",
  },
  // Workspace configuration
  "inboxes.manage": {
    group: "Workspace",
    label: "Manage shared inboxes",
    description: "Connect, configure and remove shared email accounts and their access.",
  },
  "inboxes.connect_personal": {
    group: "Workspace",
    label: "Connect personal inboxes",
    description: "Connect their own email accounts to the workspace.",
  },
  "labels.manage": {
    group: "Workspace",
    label: "Manage shared labels",
    description: "Create, edit and delete shared labels.",
  },
  "responses.manage": {
    group: "Workspace",
    label: "Manage shared responses",
    description: "Create and edit canned responses shared with the team.",
  },
  "signatures.manage": {
    group: "Workspace",
    label: "Manage signatures",
    description: "Create and enforce workspace signatures.",
  },
  "rules.manage": {
    group: "Workspace",
    label: "Manage rules",
    description: "Create workspace-wide automation rules.",
  },
  "teams.manage": {
    group: "Workspace",
    label: "Manage teams",
    description: "Create teams and manage team membership.",
  },
  "integrations.manage": {
    group: "Workspace",
    label: "Manage integrations",
    description: "Create API keys and webhooks.",
  },
  // Administration
  "members.invite": {
    group: "Administration",
    label: "Invite members",
    description: "Invite new people to the workspace.",
  },
  "members.manage": {
    group: "Administration",
    label: "Manage members",
    description: "Change roles, suspend and remove members.",
  },
  "roles.manage": {
    group: "Administration",
    label: "Manage roles & permissions",
    description: "Create custom roles and edit permissions.",
  },
  "settings.manage": {
    group: "Administration",
    label: "Manage workspace settings",
    description: "Edit workspace name, security and behaviour settings.",
  },
  "billing.manage": {
    group: "Administration",
    label: "Manage billing",
    description: "Manage the subscription and invoices.",
  },
  "analytics.view": {
    group: "Administration",
    label: "View analytics",
    description: "See team performance reports.",
  },
  "audit.view": {
    group: "Administration",
    label: "View audit log",
    description: "See the security audit log of the workspace.",
  },
} as const

export type Permission = keyof typeof PERMISSIONS
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export const PERMISSION_GROUPS = ALL_PERMISSIONS.reduce<Record<string, Permission[]>>((acc, key) => {
  const g = PERMISSIONS[key].group
  ;(acc[g] ??= []).push(key)
  return acc
}, {})

export type SystemRoleKey = "owner" | "admin" | "member" | "guest"

export const SYSTEM_ROLES: Record<
  SystemRoleKey,
  { name: string; description: string; color: string; permissions: Permission[] }
> = {
  owner: {
    name: "Owner",
    description: "Full access, including billing and deleting the workspace.",
    color: "#f59e0b",
    permissions: ALL_PERMISSIONS,
  },
  admin: {
    name: "Admin",
    description: "Manage members, inboxes and all workspace settings.",
    color: "#8b5cf6",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "billing.manage"),
  },
  member: {
    name: "Member",
    description: "Work in the inboxes they have access to and collaborate with the team.",
    color: "#22c55e",
    permissions: [
      "conversations.read",
      "conversations.reply",
      "conversations.assign",
      "conversations.export",
      "chats.create",
      "tasks.read",
      "tasks.manage",
      "contacts.view",
      "contacts.read",
      "contacts.manage",
      "inboxes.connect_personal",
      "members.invite",
      "analytics.view",
    ],
  },
  guest: {
    name: "Guest",
    description: "Limited access: can comment and reply only where explicitly invited.",
    color: "#64748b",
    permissions: ["conversations.read", "conversations.reply"],
  },
}

export function hasPermission(perms: readonly string[] | Set<string>, perm: Permission): boolean {
  return perms instanceof Set ? perms.has(perm) : perms.includes(perm)
}
