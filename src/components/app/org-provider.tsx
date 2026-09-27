"use client"

import { createContext, useContext, useMemo } from "react"
import type { Permission } from "@/lib/permissions"

/**
 * Client-side workspace context: current user, workspace, role and
 * permissions. Provided by /w/[slug]/layout.tsx.
 *
 *   const { org, user, can } = useOrg()
 *   if (can("labels.manage")) ...
 */
export type OrgClientContext = {
  org: { id: string; name: string; slug: string; logoUrl: string | null; plan: string; subscriptionStatus: string; trialEndsAt: string | null }
  user: {
    id: string
    email: string
    name: string | null
    avatarUrl: string | null
    isSuperAdmin: boolean
    timezone: string | null
    preferences: Record<string, unknown>
  }
  role: { id: string; key: string | null; name: string }
  permissions: string[]
  locked: false | { reason: "suspended" | "billing"; message: string }
  impersonating: boolean
  workspaces: { id: string; name: string; slug: string; logoUrl: string | null }[]
  productName: string
}

const Ctx = createContext<(OrgClientContext & { can: (p: Permission) => boolean }) | null>(null)

export function OrgProvider({ value, children }: { value: OrgClientContext; children: React.ReactNode }) {
  const v = useMemo(() => {
    const set = new Set(value.permissions)
    return { ...value, can: (p: Permission) => set.has(p) }
  }, [value])
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}

export function useOrg() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useOrg must be used inside <OrgProvider>")
  return v
}

/** Base path helper: `wp("/inbox")` → `/w/acme/inbox` */
export function useWorkspacePath() {
  const { org } = useOrg()
  return (path = "") => `/w/${org.slug}${path.startsWith("/") || path === "" ? path : `/${path}`}`
}
