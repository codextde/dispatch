import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { parseBox, STATIC_BOX_META } from "@/lib/inbox/boxes"
import { getCurrentSession } from "@/server/auth/session"
import { NoConversation } from "@/components/inbox/conversation/no-conversation"

const BOX_TITLES_IT: Record<string, string> = {
  inbox: "Posta in arrivo",
  assigned: "Assegnate a me",
  mentions: "Menzioni",
  starred: "Speciali",
  snoozed: "Posticipate",
  drafts: "Bozze",
  scheduled: "Programmate",
  sent: "Inviate",
  unassigned: "Non assegnate",
  all: "Tutte le conversazioni",
  closed: "Chiuse",
  spam: "Spam",
  trash: "Cestino",
  chats: "Chat",
  search: "Ricerca avanzata",
}

export async function generateMetadata({ params }: { params: Promise<{ box: string }> }): Promise<Metadata> {
  const box = parseBox((await params).box)
  if (box?.kind !== "static") return { title: "Inbox" }
  // Same locale resolution as the root layout, so the server-rendered tab title matches the UI language.
  const session = await getCurrentSession()
  const acceptLanguage = (await headers()).get("accept-language") ?? ""
  const preferredCookie = (await cookies()).get("dispatch-locale")?.value
  const it = session?.user.locale === "it" || (!session && (preferredCookie === "it" || (!preferredCookie && acceptLanguage.toLowerCase().startsWith("it"))))
  return { title: it ? (BOX_TITLES_IT[box.id] ?? STATIC_BOX_META[box.id].title) : STATIC_BOX_META[box.id].title }
}

export default function BoxPage() {
  return <NoConversation />
}
