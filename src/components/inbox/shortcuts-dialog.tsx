"use client"

import { Fragment } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { useShortcutLabel } from "@/hooks/inbox/use-hotkeys"
import { SHORTCUTS, type ShortcutAction, type ShortcutGroup, type ShortcutScheme } from "@/lib/inbox/shortcuts"
import { useInbox } from "./inbox-provider"
import { useI18n } from "@/lib/i18n"
import { useOrg } from "@/components/app/org-provider"

type Shortcut = { keys: string[]; label: string }
type Group = { title: string; items: Shortcut[] }

const COMPOSER: Group = {
  title: "Composer",
  items: [
    { keys: ["mod+Enter"], label: "Send" },
    { keys: ["mod+shift+Enter"], label: "Send & close" },
    { keys: ["Escape"], label: "Close the composer" },
  ],
}

/** Help groups for the active scheme, from the shared shortcut table. */
function groupsFor(scheme: ShortcutScheme): Group[] {
  const order: ShortcutGroup[] = ["Navigation", "Conversation", "General"]
  const groups = order.map((title) => ({
    title,
    items: (Object.keys(SHORTCUTS) as ShortcutAction[])
      .filter((a) => SHORTCUTS[a].group === title && SHORTCUTS[a][scheme].length > 0)
      .map((a) => ({ keys: SHORTCUTS[a][scheme], label: SHORTCUTS[a].label })),
  }))
  return [groups[0]!, groups[1]!, COMPOSER, groups[2]!]
}

function Keys({ combo }: { combo: string }) {
  const { t } = useI18n()
  const shortcutLabel = useShortcutLabel()
  const parts = shortcutLabel(combo)
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-[11px] text-muted-foreground">{t("inboxUiThen")}</span>}
          <Kbd className="min-w-6 font-mono text-[11px]">{part}</Kbd>
        </Fragment>
      ))}
    </span>
  )
}

/** "?" — every keyboard shortcut of the inbox, grouped. */
export function ShortcutsDialog() {
  const open = useInboxUI((s) => s.shortcutsOpen)
  const { shortcutScheme, shortcutsEnabled } = useInbox()
  const { org } = useOrg()
  const { t, locale } = useI18n()
  const groups = groupsFor(shortcutScheme).map((group) => ({
    ...group,
    title: locale === "it" ? ({ Navigation: "Navigazione", Conversation: "Conversazione", General: "Generali", Composer: "Composizione" }[group.title] ?? group.title) : group.title,
    items: group.items.filter((item) => (org.features.chat && !org.navigation.hiddenSections.includes("chats")) || !["Go to Chats", "New chat"].includes(item.label)).map((item) => ({
      ...item,
      label: locale === "it" ? ({
        "Next conversation": "Conversazione successiva", "Previous conversation": "Conversazione precedente", "Open conversation": "Apri conversazione", "Back to the list": "Torna all’elenco", "Search & commands": "Cerca e usa i comandi", "Go to Inbox": "Vai alla posta in arrivo", "Go to Assigned to me": "Vai alle assegnate a me", "Go to Starred": "Vai alle speciali", "Go to Drafts": "Vai alle bozze", "Go to Mentions": "Vai alle menzioni", "Go to Chats": "Vai alle chat", "Go to your team": "Vai al tuo team", "Go to Sent": "Vai alle inviate", "Go to All conversations": "Vai a tutte le conversazioni", "Close / reopen": "Chiudi / riapri", Reply: "Rispondi", "Reply all": "Rispondi a tutti", Forward: "Inoltra", Comment: "Commenta", Star: "Aggiungi ai preferiti", Snooze: "Posticipa", Labels: "Etichette", Assign: "Assegna", "Assign to me": "Assegna a me", "Move to team": "Sposta nel team", "Toggle priority": "Attiva/disattiva priorità", "Mute notifications": "Silenzia notifiche", "Mark as read": "Segna come letta", "Mark as unread": "Segna come da leggere", "Move to trash": "Sposta nel cestino", "Mark as spam": "Segna come spam", Select: "Seleziona", "Select all": "Seleziona tutto", "New message": "Nuovo messaggio", "New chat": "Nuova chat", "Keyboard shortcuts": "Scorciatoie da tastiera", Send: "Invia", "Send & close": "Invia e chiudi", "Close the composer": "Chiudi la composizione" } as Record<string, string>)[item.label] ?? item.label : item.label,
    })),
  }))
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : inboxUI.set({ shortcutsOpen: false }))}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {t("inboxUiKeyboard")} <span className="text-quiet">{t("inboxUiFlyInbox")}</span>
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {!shortcutsEnabled
              ? t("inboxUiShortcutsOff")
              : shortcutScheme === "gmail"
                ? t("inboxUiGmailShortcuts")
                : t("inboxUiShortcutsPaused")}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="gap-x-10 md:columns-2">
            {groups.map((group) => (
              <section key={group.title} aria-labelledby={`shortcuts-${group.title}`} className="mb-6 break-inside-avoid last:mb-0">
                <h3 id={`shortcuts-${group.title}`} className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {group.title}
                </h3>
                <dl className="divide-y divide-border/60">
                  {group.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 py-1.5">
                      <dt className="min-w-0 truncate text-[13px]">{item.label}</dt>
                      <dd className="flex shrink-0 items-center gap-1.5">
                        {item.keys.map((combo, i) => (
                          <Fragment key={combo}>
                            {i > 0 && <span className="text-[11px] text-muted-foreground">{t("inboxUiOr")}</span>}
                            <Keys combo={combo} />
                          </Fragment>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
        <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
          {t("inboxUiSwitchShortcutSettings")}
        </p>
      </DialogContent>
    </Dialog>
  )
}
