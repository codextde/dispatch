import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isUuid, parseBox, boxKey } from "@/lib/inbox/boxes"
import { ConversationView } from "@/components/inbox/conversation/conversation-view"

export const metadata: Metadata = { title: "Conversation" }

export default async function ConversationPage({ params }: { params: Promise<{ box: string; conversationId: string }> }) {
  const { box, conversationId } = await params
  const parsed = parseBox(box)
  if (!parsed || !isUuid(conversationId)) notFound()
  return <ConversationView key={conversationId} id={conversationId} box={boxKey(parsed)} />
}
