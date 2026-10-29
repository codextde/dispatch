"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useI18n } from "@/lib/i18n"

const workspaceTitles: Record<string, string> = {
  analytics: "analytics",
  contacts: "contacts",
  tasks: "tasks",
  "audit-log": "auditLog",
  billing: "billing",
  general: "general",
  members: "members",
  teams: "teams",
  roles: "roles",
  inboxes: "inboxes",
  labels: "labels",
  responses: "responses",
  signatures: "signatures",
  rules: "rules",
  integrations: "integrations",
  notifications: "notifications",
  preferences: "preferences",
  profile: "profile",
  security: "security",
  "personal-inboxes": "myInboxes",
}

const boxTitles: Record<string, string> = {
  inbox: "inbox",
  assigned: "assigned",
  mentions: "inboxMentions",
  starred: "inboxStarred",
  snoozed: "inboxSnoozed",
  drafts: "inboxDrafts",
  scheduled: "inboxScheduled",
  sent: "inboxSent",
  unassigned: "inboxUnassigned",
  all: "inboxAllConversations",
  closed: "inboxClosed",
  spam: "inboxSpam",
  trash: "inboxTrash",
}

/** Keep the browser tab title in the selected UI language during client navigation. */
export function DocumentTitle() {
  const pathname = usePathname()
  const { locale, t } = useI18n()

  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean)
    let key: string | undefined

    if (segments[0] === "w" && segments[1]) {
      const area = segments[2]
      if (!area) key = "inbox"
      else if (area === "settings") {
        const section = segments[3]
        if (section === "rules" && segments[4] === "new") key = locale === "it" ? "Nuova regola" : "New rule"
        else key = section ? workspaceTitles[section] : "workspaceSettings"
      } else if (area === "analytics" || area === "contacts" || area === "tasks") key = workspaceTitles[area]
      else if (segments[3]) return // Conversation subject is set by the conversation view.
      else if (area === "chats") key = locale === "it" ? "Chat" : "Chats"
      else key = boxTitles[area] ?? "inbox"
    } else if (pathname === "/login") key = "signIn"
    else if (pathname === "/auth/verify") key = locale === "it" ? "Conferma accesso" : "Confirm sign-in"
    else if (pathname === "/setup") key = locale === "it" ? "Configura Dispatch" : "Set up Dispatch"
    else if (pathname.startsWith("/invite/")) key = locale === "it" ? "Invito" : "Invitation"
    else if (pathname.startsWith("/admin")) {
      const adminPath = segments.slice(1)
      const page = adminPath[0] === "settings" ? adminPath[1] ?? "settings" : adminPath[0] ?? "admin"
      const adminTitles: Record<string, string> = {
        admin: locale === "it" ? "Panoramica" : "Overview",
        audit: "auditLog",
        settings: "workspaceSettings",
        users: locale === "it" ? "Utenti" : "Users",
        workspaces: "workspaces",
        system: locale === "it" ? "Sistema" : "System",
        general: "general",
        email: locale === "it" ? "Email" : "Email",
        auth: locale === "it" ? "Accesso" : "Authentication",
        billing: "billing",
        security: "security",
        oauth: locale === "it" ? "App OAuth" : "OAuth apps",
        storage: locale === "it" ? "Archiviazione" : "Storage",
        ai: locale === "it" ? "IA" : "AI",
        branding: locale === "it" ? "Marchio" : "Branding",
        legal: locale === "it" ? "Note legali" : "Legal",
      }
      key = adminTitles[page]
    }

    if (!key) return
    const title = t(key as never)
    document.title = `${title} · Dispatch`
  }, [pathname, locale, t])

  return null
}
