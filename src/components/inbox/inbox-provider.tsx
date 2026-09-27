"use client"

import { createContext, useContext, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useOrg } from "@/components/app/org-provider"
import { inboxKeys } from "@/hooks/inbox/queries"
import { schemeFromPreference, type ShortcutScheme } from "@/lib/inbox/shortcuts"
import type { AccountSummary, Bootstrap, LabelSummary, MemberSummary, SignatureSummary, TeamSummary } from "@/lib/inbox/types"

/**
 * Inbox data context: workspace slug, bootstrap data (members, teams,
 * accounts, labels, signatures, chats, settings) and lookup helpers.
 * The bootstrap is rendered on the server by the mail layout and kept fresh
 * by realtime invalidations.
 */
export type InboxContextValue = {
  slug: string
  meId: string
  bootstrap: Bootstrap
  members: MemberSummary[]
  member: (id: string | null | undefined) => MemberSummary | undefined
  account: (id: string | null | undefined) => AccountSummary | undefined
  label: (id: string | null | undefined) => LabelSummary | undefined
  team: (id: string | null | undefined) => TeamSummary | undefined
  signature: (id: string | null | undefined) => SignatureSummary | undefined
  /** Addresses of accounts I can see (to tell "me" apart from customers) */
  ownAddresses: Set<string>
  shortcutsEnabled: boolean
  shortcutScheme: ShortcutScheme
}

const Ctx = createContext<InboxContextValue | null>(null)

export function InboxProvider({ slug, initialBootstrap, children }: { slug: string; initialBootstrap: Bootstrap; children: React.ReactNode }) {
  const { user } = useOrg()
  const { data } = useQuery({
    queryKey: inboxKeys.bootstrap(slug),
    queryFn: () => api.get<Bootstrap>(`/api/w/${slug}/bootstrap`),
    initialData: initialBootstrap,
    staleTime: 60_000,
  })
  const bootstrap = data ?? initialBootstrap

  const value = useMemo<InboxContextValue>(() => {
    const byId = <T extends { id: string }>(list: T[]) => {
      const map = new Map(list.map((x) => [x.id, x]))
      return (id: string | null | undefined) => (id ? map.get(id) : undefined)
    }
    const own = new Set<string>()
    for (const a of bootstrap.accounts) {
      own.add(a.email.toLowerCase())
      for (const al of a.aliases) own.add(al.toLowerCase())
    }
    const shortcuts = schemeFromPreference((bootstrap.me.preferences as { shortcuts?: string }).shortcuts)
    return {
      slug,
      meId: user.id,
      bootstrap,
      members: bootstrap.members,
      member: byId(bootstrap.members),
      account: byId(bootstrap.accounts),
      label: byId(bootstrap.labels),
      team: byId(bootstrap.teams),
      signature: byId(bootstrap.signatures),
      ownAddresses: own,
      shortcutsEnabled: shortcuts.enabled,
      shortcutScheme: shortcuts.scheme,
    }
  }, [bootstrap, slug, user.id])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInbox() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useInbox must be used inside <InboxProvider>")
  return v
}

/** Optional variant for components that may render outside the mail area. */
export function useInboxOptional() {
  return useContext(Ctx)
}
