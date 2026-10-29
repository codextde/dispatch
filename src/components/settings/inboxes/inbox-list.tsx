"use client"

import Link from "next/link"
import { AlertTriangle, ChevronRight, Globe, Inbox, Lock, Users } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { ColorDot, EmptyState, SettingsSection } from "@/components/settings/settings-ui"
import { pluralize } from "@/components/settings/format"
import { LocalTime } from "@/components/app/local-time"
import { Button } from "@/components/ui/button"
import { ConnectInboxWizard } from "@/components/settings/inboxes/connect-wizard"
import { InboxStatusBadge } from "@/components/settings/inboxes/inbox-status"
import { ProviderTile } from "@/components/settings/inboxes/provider-icon"
import type { ConnectOptions, InboxListItem } from "@/components/settings/inboxes/types"
import { useI18n } from "@/lib/i18n"

function accessSummary(item: InboxListItem, scope: "shared" | "personal", t: ReturnType<typeof useI18n>["t"]) {
  if (scope === "personal") return { icon: <Lock className="size-3.5" />, label: t("inboxPrivateToYou") }
  const { teams, users } = item.access
  if (!teams && !users) return { icon: <Globe className="size-3.5" />, label: t("inboxEveryoneViewAll") }
  const parts = [teams && pluralize(teams, "team"), users && (users === 1 ? `1 ${t("inboxPerson")}` : `${users} ${t("inboxPeople")}`)].filter(Boolean)
  return { icon: <Users className="size-3.5" />, label: parts.join(" · ") }
}

export function InboxList({ inboxes, options }: { inboxes: InboxListItem[]; options: ConnectOptions }) {
  const { org } = useOrg()
  const { t } = useI18n()
  const scope = options.scope
  const base = `/w/${org.slug}/settings/${scope === "shared" ? "inboxes" : "personal-inboxes"}`
  const failing = inboxes.filter((i) => i.status === "error")

  if (inboxes.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={scope === "shared" ? t("inboxNoSharedYet") : t("inboxNoPersonalYet")}
        description={
          scope === "shared"
            ? t("inboxConnectSharedDescription")
            : t("inboxConnectPersonalDescription")
        }
        className="py-14"
      >
        <ConnectInboxWizard
          options={options}
          trigger={
            <Button>
              <Inbox /> {t("inboxConnect")} {scope === "shared" ? t("inboxConnectShared") : t("inboxConnectPersonal")}
            </Button>
          }
        />
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {failing.length > 0 && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-pretty text-muted-foreground">
            <span className="font-medium text-foreground">
              {failing.length === 1 ? `${failing[0]!.name} ${t("inboxConnectionProblemOne")}` : `${failing.length} ${t("inboxConnectionProblemMany")}`}
            </span>{" "}
            {t("inboxSyncCredentialError")}
          </p>
        </div>
      )}
      <SettingsSection flush bodyClassName="mt-0">
        <ul className="divide-y">
          {inboxes.map((item) => {
            const access = accessSummary(item, scope, t)
            return (
              <li key={item.id} className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5">
                <ProviderTile provider={item.provider} color={item.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={`${base}/${item.id}`}
                      className="truncate text-sm font-medium outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {item.name}
                    </Link>
                    {item.team && (
                      <span className="hidden shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[11px] text-muted-foreground sm:inline-flex">
                        <ColorDot color={item.team.color} className="size-2" />
                        {item.team.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="truncate font-mono">{item.email}</span>
                    <span className="flex items-center gap-1 md:hidden">
                      {access.icon}
                      {access.label}
                    </span>
                  </div>
                </div>
                <div className="hidden w-44 shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
                  {access.icon}
                  <span className="truncate">{access.label}</span>
                </div>
                <div className="relative z-10 flex shrink-0 flex-col items-end gap-1">
                  <InboxStatusBadge status={item.status} lastError={item.lastError} />
                  <span className="hidden text-[11px] whitespace-nowrap text-muted-foreground sm:block">
                    {item.status === "paused" ? (
                      t("inboxSyncPausedStatus")
                    ) : item.lastSyncedAt ? (
                      <>
                        {t("inboxSynced")} <LocalTime date={item.lastSyncedAt} format="relative" />
                      </>
                    ) : (
                      t("inboxNotSyncedYet")
                    )}
                  </span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </li>
            )
          })}
        </ul>
      </SettingsSection>
      <p className="text-xs text-muted-foreground">
        {inboxes.length} {inboxes.length === 1 ? t("inboxInboxCount") : t("inboxInboxes")} ·{" "}
        {pluralize(
          inboxes.reduce((n, i) => n + i.conversationCount, 0),
          "conversation"
        )}
      </p>
    </div>
  )
}
