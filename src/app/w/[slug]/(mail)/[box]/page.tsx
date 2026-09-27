import type { Metadata } from "next"
import { parseBox, STATIC_BOX_META } from "@/lib/inbox/boxes"
import { NoConversation } from "@/components/inbox/conversation/no-conversation"

export async function generateMetadata({ params }: { params: Promise<{ box: string }> }): Promise<Metadata> {
  const box = parseBox((await params).box)
  return { title: box?.kind === "static" ? STATIC_BOX_META[box.id].title : "Inbox" }
}

export default function BoxPage() {
  return <NoConversation />
}
