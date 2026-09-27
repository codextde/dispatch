"use client"

import { useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrg } from "@/components/app/org-provider"
import { api } from "@/lib/api-client"
import { parseBox } from "@/lib/inbox/boxes"
import type { DraftInfo } from "@/lib/inbox/types"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { useIsMobile } from "@/hooks/use-mobile"
import { EmailComposer } from "./composer/email-composer"
import { draftFromInfo, type EmailDraftState } from "./composer/use-email-draft"
import { useInbox } from "./inbox-provider"

/** New message: dialog on desktop, full-height drawer on mobile. */
export function ComposeDialog() {
  const { slug, bootstrap } = useInbox()
  const { can } = useOrg()
  const router = useRouter()
  const isMobile = useIsMobile()
  const params = useParams<{ box?: string }>()
  const compose = useInboxUI((s) => s.compose)
  const init = compose.init
  const accounts = useMemo(() => bootstrap.accounts.filter((a) => a.level !== "read"), [bootstrap.accounts])

  const draftQuery = useQuery({
    queryKey: ["inbox", slug, "draft", init?.draftId ?? ""],
    queryFn: () => api.get<DraftInfo>(`/api/w/${slug}/drafts/${init!.draftId}`),
    enabled: !!init?.draftId,
    staleTime: 0,
  })

  const initial = useMemo<EmailDraftState | null>(() => {
    const sigFor = (accountId: string | null) => bootstrap.accounts.find((a) => a.id === accountId)?.defaultSignatureId ?? null
    if (init?.draftId) return draftQuery.data ? draftFromInfo(draftQuery.data, sigFor(draftQuery.data.accountId)) : null
    const box = parseBox(params.box)
    const boxAccount = box?.kind === "account" ? accounts.find((a) => a.id === box.id) : undefined
    const account = accounts.find((a) => a.id === init?.accountId) ?? boxAccount ?? accounts.find((a) => a.isPersonal) ?? accounts[0]
    return {
      id: null,
      version: 0,
      conversationId: null,
      mode: "new",
      replyToMessageId: null,
      accountId: account?.id ?? null,
      fromEmail: account?.email ?? "",
      to: init?.to?.map((p) => ({ name: p.name ?? null, email: p.email })) ?? [],
      cc: [],
      bcc: [],
      subject: init?.subject ?? "",
      body: init?.html ?? "",
      signatureId: sigFor(account?.id ?? null),
      isShared: false,
    }
    // Recompute only when the dialog is (re)opened or the draft loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose.nonce, draftQuery.data])

  const close = () => inboxUI.closeCompose()

  const content = !accounts.length ? (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <Inbox className="size-5 text-muted-foreground" />
      </span>
      <p className="text-[15px] font-semibold tracking-tight">No inbox to send from</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">Connect an email account first, or ask an admin for reply access to a shared inbox.</p>
      {(can("inboxes.manage") || can("inboxes.connect_personal")) && (
        <Button
          size="sm"
          onClick={() => {
            close()
            router.push(`/w/${slug}/settings/inboxes`)
          }}
        >
          Connect an inbox
        </Button>
      )}
    </div>
  ) : !initial ? (
    <div className="space-y-3 p-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  ) : (
    <EmailComposer
      key={`${compose.nonce}:${initial.id ?? "new"}`}
      initial={initial}
      initialAttachments={draftQuery.data?.attachments}
      serverDraft={draftQuery.data}
      accounts={accounts}
      contact={initial.to[0] ?? null}
      header={<span className="shrink-0 text-[13px] font-semibold tracking-tight">New message</span>}
      variant="dialog"
      onClose={close}
      onSent={(result) => {
        close()
        router.push(`/w/${slug}/sent/${result.conversationId}`)
      }}
    />
  )

  if (isMobile) {
    return (
      <Drawer open={compose.open} onOpenChange={(o) => !o && close()} repositionInputs={false}>
        <DrawerContent className="h-[96dvh] max-h-[96dvh] p-0 data-[vaul-drawer-direction=bottom]:max-h-[96dvh]">
          <DrawerTitle className="sr-only">New message</DrawerTitle>
          <DrawerDescription className="sr-only">Write a new email</DrawerDescription>
          <div className="min-h-0 flex-1">{content}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={compose.open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(720px,88dvh)] w-[min(760px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">New message</DialogTitle>
        <DialogDescription className="sr-only">Write a new email</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  )
}
