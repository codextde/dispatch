"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Download, RefreshCw } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { inboxUI } from "@/hooks/inbox/store"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useInbox } from "./inbox-provider"
import { CompactMailbox } from "./compact-mailbox"

type Folder = { path: string; name: string; specialUse?: string }
type MailAction = { action: "seen"; seen: boolean } | { action: "move"; destination: string } | { action: "trash" }
type Item = { uid: number; subject: string; from: string; to: string; date: string | null; seen: boolean }
type Page = { validity: string; items: Item[]; before: number | null }
type Body = { html: string; conversationId: string | null; isDraft: boolean; files: { part: string; name: string }[] }

const selectClass = "min-w-0 max-w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"

export function MailArchive() {
  const { slug, bootstrap } = useInbox()
  const { locale } = useI18n()
  const it = locale === "it"
  const { can } = useOrg()
  const router = useRouter()
  const queryClient = useQueryClient()
  const canTrash = can("conversations.delete")
  const [destination, setDestination] = useState("")
  const accounts = bootstrap.accounts.filter((account) => account.provider !== "demo")
  const [pickedAccount, setAccount] = useState("")
  const account = accounts.find((entry) => entry.id === pickedAccount)?.id ?? accounts[0]?.id ?? ""
  const access = accounts.find((entry) => entry.id === account)?.level
  const canWrite = access === "reply" || access === "manage"
  const [pickedFolder, setFolder] = useState("")
  const [selected, setSelected] = useState<Item | null>(null)
  const [revision, setRevision] = useState(0)
  const endpoint = `/api/w/${slug}/mail-archive`
  const url = (params: Record<string, string>) => `${endpoint}?${new URLSearchParams({ account, ...params })}`

  const folders = useQuery({
    queryKey: ["mail-archive", slug, account, "folders", revision],
    queryFn: ({ signal }) => api.get<{ folders: Folder[]; drafts: string | null; trash: string | null }>(url({}), { signal }),
    enabled: Boolean(account),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const choices = folders.data?.folders ?? []
  const folder = choices.find((entry) => entry.path === pickedFolder)?.path ?? choices[0]?.path ?? ""

  const listKey = ["mail-archive", slug, account, folder, "messages", revision] as const
  const list = useInfiniteQuery({
    queryKey: listKey,
    initialPageParam: null as { before: string; validity: string } | null,
    queryFn: ({ pageParam, signal }) => api.get<Page>(url({ folder, ...pageParam }), { signal }),
    getNextPageParam: (page) => page.before === null ? undefined : { before: String(page.before), validity: page.validity },
    enabled: Boolean(folder),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const validity = list.data?.pages[0]?.validity ?? ""
  const messageParams = { folder, validity, uid: String(selected?.uid ?? "") }
  const body = useQuery({
    queryKey: ["mail-archive", slug, account, folder, validity, "body", selected?.uid, revision],
    queryFn: ({ signal }) => api.get<Body>(url(messageParams), { signal }),
    enabled: Boolean(selected && validity),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const change = useMutation({
    mutationFn: (action: MailAction) => api.patch<void>(endpoint, { account, ...messageParams, ...action }),
    onSuccess: (_, action) => {
      if (action.action === "seen") {
        const mark = (item: Item) => item.uid === selected?.uid ? { ...item, seen: action.seen } : item
        queryClient.setQueryData<typeof list.data>(listKey, (data) => data && ({
          ...data,
          pages: data.pages.map((page) => ({ ...page, items: page.items.map(mark) })),
        }))
        setSelected((item) => item && mark(item))
      } else {
        setSelected(null)
        setDestination("")
        setRevision((value) => value + 1)
      }
    },
  })
  const isRemoteDraft = body.data?.isDraft || folders.data?.drafts === folder
  const importMessage = useMutation({
    mutationFn: () => api.post<{ conversationId: string } | { draftId: string }>(endpoint, { account, ...messageParams, asDraft: Boolean(isRemoteDraft) }),
    onSuccess: (result) => {
      if ("draftId" in result) {
        inboxUI.openCompose({ draftId: result.draftId })
        return
      }
      void queryClient.invalidateQueries({ queryKey: ["mail-archive", slug, account, folder, validity, "body", selected?.uid, revision] })
      router.push(`/w/${slug}/all/${result.conversationId}`)
    },
  })
  const busy = change.isPending || importMessage.isPending
  const trash = folders.data?.trash
  const moveChoices = choices.filter((choice) =>
    choice.path !== folder && (canTrash || (choice.path !== trash && choice.specialUse !== "\\Trash"))
  )
  const items = [...new Map(list.data?.pages.flatMap((page) => page.items.map((item) => [item.uid, item] as const))).values()]
  const emptySubject = it ? "(Senza oggetto)" : "(No subject)"

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <h1 className="mr-2 text-sm font-semibold">{it ? "Cartelle sul server" : "Server folders"}</h1>
        {accounts.length > 0 && (
          <select className={selectClass} aria-label={it ? "Casella" : "Inbox"} value={account} disabled={busy} onChange={(event) => {
            setAccount(event.target.value)
            setFolder("")
            setSelected(null)
            setDestination("")
            change.reset()
            importMessage.reset()
          }}>
            {accounts.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        )}
        {choices.length > 0 && (
          <select className={selectClass} aria-label={it ? "Cartella" : "Folder"} value={folder} disabled={busy} onChange={(event) => {
            setFolder(event.target.value)
            setSelected(null)
            setDestination("")
            change.reset()
            importMessage.reset()
          }}>
            {choices.map((entry) => <option key={entry.path} value={entry.path}>{entry.path}</option>)}
          </select>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={it ? "Aggiorna" : "Refresh"} disabled={busy} onClick={() => {
          setSelected(null)
          setRevision((value) => value + 1)
          change.reset()
          importMessage.reset()
        }}>
          <RefreshCw />
        </Button>
        {access === "manage" && account && <CompactMailbox key={account} slug={slug} account={account} />}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className={cn("min-w-0 flex-1 overflow-y-auto border-r md:max-w-sm", selected && "hidden md:block")}>
          {!account && <p className="p-4 text-sm text-muted-foreground">{it ? "Collega una casella di posta." : "Connect a mailbox."}</p>}
          {(folders.isFetching || (folder && list.isPending)) && <p role="status" className="p-4 text-sm">{it ? "Caricamento…" : "Loading…"}</p>}
          {(folders.error || list.error) && <p role="alert" className="p-4 text-sm text-destructive">{(folders.error || list.error)?.message}</p>}
          {((list.isSuccess && !items.length) || (folders.isSuccess && !choices.length)) && (
            <p className="p-4 text-sm text-muted-foreground">{it ? "Nessun messaggio da mostrare." : "No messages to show."}</p>
          )}
          {items.map((item) => (
            <button key={item.uid} type="button" aria-pressed={selected?.uid === item.uid} disabled={busy} onClick={() => {
              setSelected(item)
              setDestination("")
              change.reset()
              importMessage.reset()
            }}
              className={cn("block w-full border-b px-4 py-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selected?.uid === item.uid && "bg-muted")}>
              <span className="block truncate text-xs text-muted-foreground">{item.from || item.to}</span>
              <span className={cn("block truncate", !item.seen && "font-semibold")}>{item.subject || emptySubject}</span>
              {item.date && <time className="text-xs text-muted-foreground" dateTime={item.date}>{new Date(item.date).toLocaleDateString(locale)}</time>}
            </button>
          ))}
          {list.hasNextPage && (
            <Button className="m-3" variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {it ? "Mostra email precedenti" : "Show older emails"}
            </Button>
          )}
        </div>
        {selected && (
          <article className="min-w-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="ghost" size="sm" className="mb-2 md:hidden" disabled={busy} onClick={() => setSelected(null)}>
              <ArrowLeft /> {it ? "Torna all’elenco" : "Back to list"}
            </Button>
            <h2 className="break-words text-xl font-semibold tracking-tight">{selected.subject || emptySubject}</h2>
            <p className="mb-4 break-words text-sm text-muted-foreground">{selected.from} → {selected.to}</p>
            {canWrite && validity && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => change.mutate({ action: "seen", seen: !selected.seen })}>
                  {selected.seen ? (it ? "Segna come da leggere" : "Mark unread") : (it ? "Segna come letta" : "Mark read")}
                </Button>
                {moveChoices.length > 0 && (
                  <>
                    <select className={selectClass} value={destination} disabled={busy} aria-label={it ? "Cartella di destinazione" : "Destination folder"} onChange={(event) => setDestination(event.target.value)}>
                      <option value="">{it ? "Sposta in…" : "Move to…"}</option>
                      {moveChoices.map((choice) => <option key={choice.path} value={choice.path}>{choice.path}</option>)}
                    </select>
                    <Button size="sm" variant="outline" disabled={!destination || busy} onClick={() => change.mutate({ action: "move", destination })}>
                      {it ? "Sposta" : "Move"}
                    </Button>
                  </>
                )}
                {canTrash && trash && trash !== folder && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => change.mutate({ action: "trash" })}>
                    {it ? "Sposta nel cestino" : "Move to trash"}
                  </Button>
                )}
              </div>
            )}
            {change.error && <p role="alert" className="mb-4 text-sm text-destructive">{change.error.message}</p>}
            {body.data?.conversationId ? (
              <Button asChild size="sm" variant="outline" className="mb-4">
                <Link href={`/w/${slug}/all/${body.data.conversationId}`}>{it ? "Apri conversazione" : "Open conversation"}</Link>
              </Button>
            ) : body.data && canWrite && can("conversations.reply") && (
              <Button size="sm" variant="outline" className="mb-4" disabled={busy} onClick={() => importMessage.mutate()}>
                {isRemoteDraft ? (it ? "Copia bozza in Dispatch" : "Copy draft to Dispatch") : (it ? "Importa in Dispatch" : "Import into Dispatch")}
              </Button>
            )}
            {importMessage.error && <p role="alert" className="mb-4 text-sm text-destructive">{importMessage.error.message}</p>}
            {body.isPending && <p role="status" className="text-sm">{it ? "Caricamento…" : "Loading…"}</p>}
            {body.error && <p role="alert" className="text-sm text-destructive">{body.error.message}</p>}
            {body.data && (
              <>
                <div className="overflow-x-auto break-words text-sm" dangerouslySetInnerHTML={{ __html: body.data.html }} />
                {body.data.files.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t pt-4">
                    {body.data.files.map((file) => (
                      <li key={file.part}>
                        <a className="inline-flex max-w-full items-center gap-2 break-all text-sm underline" href={url({ ...messageParams, part: file.part })}>
                          <Download className="size-4 shrink-0" /> {file.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </article>
        )}
      </div>
    </section>
  )
}
