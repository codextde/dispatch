"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, Loader2, Pause, Play, RefreshCw, Server, Trash2 } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { useServerAction } from "@/components/settings/use-server-action"
import {
  Code,
  SectionFooter,
  SettingsPage,
  SettingsRow,
  SettingsRows,
  SettingsSection,
  SaveBar,
  FormField,
} from "@/components/settings/settings-ui"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { Combobox } from "@/components/settings/combobox"
import { pluralize } from "@/components/settings/format"
import { LocalTime } from "@/components/app/local-time"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  deleteInboxAction,
  retestInbox,
  setInboxPausedAction,
  syncInboxNow,
  updateInbox,
  updateInboxAccessAction,
} from "@/server/workspace/actions/inboxes"
import { AccessEditor } from "@/components/settings/inboxes/access-editor"
import { ConnectionTestPanel } from "@/components/settings/inboxes/connection-test"
import { CredentialsDialog } from "@/components/settings/inboxes/credentials-dialog"
import { FolderFields } from "@/components/settings/inboxes/folder-fields"
import { IdentityFields, SendingFields, SyncDaysField, toSyncDays, type InboxSettingsDraft } from "@/components/settings/inboxes/inbox-fields"
import { InboxStatusBadge } from "@/components/settings/inboxes/inbox-status"
import { GoogleGlyph, MicrosoftGlyph, ProviderTile, providerLabel } from "@/components/settings/inboxes/provider-icon"
import type {
  AccessValue,
  ConnectionTestResult,
  FolderPaths,
  InboxDetail,
  MemberOpt,
  SignatureOpt,
  TeamOpt,
} from "@/components/settings/inboxes/types"
import { useI18n } from "@/lib/i18n"

type FormState = InboxSettingsDraft & { folders: FolderPaths; signatureId: string | null }

function toForm(inbox: InboxDetail): FormState {
  return {
    name: inbox.name,
    color: inbox.color,
    teamId: inbox.team?.id ?? null,
    fromName: inbox.fromName ?? "",
    syncDays: toSyncDays(inbox.config.syncDays),
    aliases: inbox.aliases,
    autoCc: inbox.config.autoCc,
    autoBcc: inbox.config.autoBcc,
    saveSentCopy: inbox.config.saveSentCopy,
    markReadOnServer: inbox.config.markReadOnServer,
    folders: {
      sentPath: inbox.config.sentPath,
      archivePath: inbox.config.archivePath,
      trashPath: inbox.config.trashPath,
      spamPath: inbox.config.spamPath,
    },
    signatureId: inbox.signatureId,
  }
}

const NO_SIGNATURE = "__none__"

/** Order-insensitive comparison key for access settings. */
function accessKey(v: AccessValue) {
  if (v.mode === "everyone") return "everyone"
  return JSON.stringify(v.grants.map((g) => `${g.kind}:${g.id}:${g.level}`).sort())
}

export function InboxEditor({
  inbox,
  teams,
  members,
  signatures,
  oauth,
}: {
  inbox: InboxDetail
  teams: TeamOpt[]
  members: MemberOpt[]
  signatures: SignatureOpt[]
  oauth: { google: boolean; microsoft: boolean }
}) {
  const { t, locale } = useI18n()
  const { org } = useOrg()
  const router = useRouter()
  const scope = inbox.scope
  const base = `/w/${org.slug}/settings/${scope === "shared" ? "inboxes" : "personal-inboxes"}`
  const ref = { slug: org.slug, scope, id: inbox.id }
  const isImap = inbox.provider === "imap"
  const isOAuth = inbox.provider === "gmail" || inbox.provider === "outlook"
  const isDemo = inbox.provider === "demo"

  // General settings form
  const initial = useMemo(() => toForm(inbox), [inbox])
  const [form, setForm] = useState<FormState>(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const save = useServerAction()

  // Access
  const [access, setAccess] = useState<AccessValue>(inbox.accessValue)
  const accessDirty = accessKey(access) !== accessKey(inbox.accessValue)
  const accessAction = useServerAction()

  // Connection test / actions
  const [test, setTest] = useState<ConnectionTestResult | null>(null)
  const retest = useServerAction()
  const actions = useServerAction()
  const [deleteMode, setDeleteMode] = useState<"keep" | "delete">("keep")
  const deleteAction = useServerAction()

  const onSave = () =>
    save.run(
      () =>
        updateInbox({
          ...ref,
          settings: {
            name: form.name.trim(),
            color: form.color,
            teamId: scope === "shared" ? form.teamId : null,
            fromName: form.fromName.trim(),
            syncDays: form.syncDays,
            aliases: form.aliases,
            autoCc: form.autoCc,
            autoBcc: form.autoBcc,
            saveSentCopy: form.saveSentCopy,
            markReadOnServer: form.markReadOnServer,
            folders: form.folders,
            signatureId: form.signatureId,
          },
        }),
      {
        success: t("inboxSettingsSaved"),
        onSuccess: () => setForm((f) => ({ ...f, name: f.name.trim(), fromName: f.fromName.trim() })),
      }
    )

  const oauthProvider = inbox.connection.oauth?.provider ?? (inbox.provider === "gmail" ? "google" : "microsoft")
  const reconnectHref = `/api/oauth/${oauthProvider}/start?${new URLSearchParams({
    purpose: "connect",
    org: org.slug,
    shared: scope === "shared" ? "1" : "0",
    ...(scope === "shared" && inbox.team ? { teamId: inbox.team.id } : {}),
  }).toString()}`
  const canReconnect = oauthProvider === "google" ? oauth.google : oauth.microsoft

  const signatureOptions = [
    { value: NO_SIGNATURE, label: t("inboxNoDefaultSignature") },
    ...signatures.map((s) => ({ value: s.id, label: s.name, hint: s.personal ? t("personal") : t("workspace") })),
  ]

  return (
    <SettingsPage
      eyebrow={
        <Link href={base} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> {scope === "shared" ? t("inboxes") : t("myInboxes")}
        </Link>
      }
      title={
        <span className="flex min-w-0 items-center gap-3">
          <ProviderTile provider={inbox.provider} color={inbox.color} className="size-10" />
          <span className="min-w-0 truncate">{inbox.name}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[13px]">{inbox.email}</span>
          <span aria-hidden>·</span>
          <span>{providerLabel(inbox.provider)}</span>
          <span aria-hidden>·</span>
          <span>
            {t("inboxConnected")} <LocalTime date={inbox.createdAt} format="date" />
          </span>
        </span>
      }
      actions={
        !isDemo && (
          <>
            {inbox.status !== "paused" && (
              <Button
                variant="outline"
                size="sm"
                disabled={actions.pending}
                onClick={() => actions.run(() => syncInboxNow(ref), { success: t("inboxSyncRequested") })}
              >
                <RefreshCw className={cn(actions.pending && "animate-spin")} /> {t("inboxSyncNow")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={actions.pending}
              onClick={() =>
                actions.run(() => setInboxPausedAction({ ...ref, paused: inbox.status !== "paused" }), {
                  success: (r) => (r.paused ? t("inboxSyncPaused") : t("inboxSyncResumed")),
                })
              }
            >
              {inbox.status === "paused" ? <Play /> : <Pause />}
              {inbox.status === "paused" ? t("inboxResume") : t("inboxPause")}
            </Button>
          </>
        )
      }
    >
      {/* Status strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {[
          { label: t("inboxStatus"), value: <InboxStatusBadge status={inbox.status} lastError={inbox.lastError} /> },
          {
            label: t("inboxLastSynced"),
            value:
              inbox.status === "paused" ? (
                t("inboxPaused")
              ) : inbox.lastSyncedAt ? (
                <LocalTime date={inbox.lastSyncedAt} format="relative" titleFormat="datetime" />
              ) : (
                t("inboxNotYet")
              ),
          },
          { label: t("inboxConversations"), value: inbox.conversationCount.toLocaleString(locale === "it" ? "it-IT" : "en-US") },
          { label: t("inboxHistory"), value: inbox.config.syncDays === 365 ? t("inbox1Year") : `${inbox.config.syncDays} ${t("days")}` },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5 bg-card px-4 py-3">
            <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{s.label}</span>
            <span className="text-sm font-medium tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>

      {inbox.status === "error" && inbox.lastError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-pretty">
            <p className="font-medium">{t("inboxSyncFailing")}</p>
            <p className="mt-0.5 break-words text-muted-foreground">{inbox.lastError}</p>
            <p className="mt-1 text-muted-foreground">
              {isOAuth ? t("inboxReconnectAccess") : t("inboxCheckConnection")}
            </p>
          </div>
        </div>
      )}

      <SettingsSection title={t("inboxSettingsTitle")} description={t("inboxSettingsDescription")}>
        <div className="flex flex-col gap-5">
          <IdentityFields
            value={form}
            onChange={(v) => setForm((f) => ({ ...f, ...v }))}
            errors={save.fieldErrors}
            teams={teams}
            showTeam={scope === "shared"}
          />
          <FormField
            label={t("inboxDefaultSignature")}
            htmlFor="inbox-signature"
            description={
              <>
                {t("inboxSignatureAdded")}{" "}
                <Link href={`/w/${org.slug}/settings/signatures`} className="underline underline-offset-2 hover:text-foreground">
                  {t("inboxManageSignatures")}
                </Link>
              </>
            }
          >
            <Combobox
              id="inbox-signature"
              options={signatureOptions}
              value={form.signatureId ?? NO_SIGNATURE}
              onChange={(v) => setForm((f) => ({ ...f, signatureId: !v || v === NO_SIGNATURE ? null : v }))}
              searchPlaceholder={t("inboxSearchSignatures")}
              className="sm:max-w-sm"
            />
          </FormField>
          {!isDemo && (
            <SettingsRows>
              <SettingsRow label={t("inboxImportHistory")} description={t("inboxImportHistoryDescription")}>
                <SyncDaysField value={form.syncDays} onChange={(syncDays) => setForm((f) => ({ ...f, syncDays }))} />
              </SettingsRow>
            </SettingsRows>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={t("inboxSending")} description={t("inboxSendingDescription")}>
        <SendingFields value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} errors={save.fieldErrors} />
      </SettingsSection>

      {!isDemo && (
        <SettingsSection
          title={t("inboxFolders")}
          description={t("inboxFoldersDescription")}
          footer={
            isImap ? (
              <SectionFooter hint={test?.imap.ok ? t("inboxLoadedFolders").replace("{count}", String(test.imap.mailboxes.length)) : t("inboxLoadFolders")}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retest.pending}
                  onClick={() => retest.run(() => retestInbox(ref), { onSuccess: setTest })}
                >
                  {retest.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {t("inboxRetestConnection")}
                </Button>
              </SectionFooter>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground">
              {t("inboxIncomingMailFrom")} <Code>{inbox.config.inboxPath}</Code>.
            </p>
            <FolderFields
              value={form.folders}
              onChange={(folders) => setForm((f) => ({ ...f, folders }))}
              mailboxes={test?.imap.ok ? test.imap.mailboxes : null}
            />
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title={t("connection")}
        description={
          isImap
            ? t("inboxIMAPSMTPHelp")
            : isOAuth
              ? t("inboxOAuthConnected").replace("{provider}", oauthProvider === "google" ? "Google" : "Microsoft")
              : t("inboxDemoConnection")
        }
        footer={
          isImap ? (
            <SectionFooter hint={t("inboxConnectionChanged")}>
              <Button
                variant="ghost"
                size="sm"
                disabled={retest.pending}
                onClick={() => retest.run(() => retestInbox(ref), { onSuccess: setTest })}
              >
                {retest.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {t("inboxTest")}
              </Button>
              <CredentialsDialog key={`${inbox.connection.imap?.host}:${inbox.connection.imap?.user}`} inbox={inbox} />
            </SectionFooter>
          ) : isOAuth ? (
            <SectionFooter hint={canReconnect ? t("inboxReconnectRevoked") : t("inboxSignInDisabled")}>
              {canReconnect && (
                <Button asChild variant="outline" size="sm">
                  <a href={reconnectHref}>
                    {oauthProvider === "google" ? <GoogleGlyph /> : <MicrosoftGlyph />}
                    {t("inboxReconnectWith").replace("{provider}", oauthProvider === "google" ? "Google" : "Microsoft")}
                  </a>
                </Button>
              )}
            </SectionFooter>
          ) : undefined
        }
      >
        {isImap ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  [t("inboxIncomingIMAP"), inbox.connection.imap],
                  [t("inboxOutgoingSMTP"), inbox.connection.smtp],
                ] as const
              ).map(([label, s]) => (
                <div key={label} className="flex flex-col gap-2 rounded-lg border bg-surface/40 p-3.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                    <Server className="size-3" /> {label}
                  </span>
                  {s ? (
                    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px]">
                      <dt className="text-muted-foreground">{t("inboxServer")}</dt>
                      <dd className="truncate font-mono text-[12.5px]">
                        {s.host}:{s.port}
                      </dd>
                      <dt className="text-muted-foreground">{t("inboxSecurity")}</dt>
                      <dd>{s.secure ? "SSL/TLS" : "STARTTLS"}</dd>
                      <dt className="text-muted-foreground">{t("inboxUsername")}</dt>
                      <dd className="truncate">{s.user}</dd>
                      <dt className="text-muted-foreground">{t("inboxPassword")}</dt>
                      <dd className="tracking-widest text-muted-foreground">{inbox.connection.hasPassword ? "••••••••" : t("inboxNotSet")}</dd>
                    </dl>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">{t("aiNotConfigured")}</p>
                  )}
                </div>
              ))}
            </div>
            {(retest.pending || test) && (
              <ConnectionTestPanel
                running={retest.pending}
                result={test}
                imapDetail={inbox.connection.imap ? `${inbox.connection.imap.host}:${inbox.connection.imap.port}` : ""}
                smtpDetail={inbox.connection.smtp ? `${inbox.connection.smtp.host}:${inbox.connection.smtp.port}` : ""}
              />
            )}
          </div>
        ) : isOAuth ? (
          <div className="flex items-center gap-3 rounded-lg border bg-surface/40 p-3.5 text-[13px]">
            {oauthProvider === "google" ? <GoogleGlyph className="size-5" /> : <MicrosoftGlyph className="size-5" />}
            <div className="min-w-0">
              <div className="font-medium">{oauthProvider === "google" ? t("inboxGoogleAccount") : t("inboxMicrosoftAccount")}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{inbox.email}</div>
            </div>
          </div>
        ) : null}
      </SettingsSection>

      {scope === "shared" && (
        <SettingsSection
          title={t("inboxAccess")}
          description={t("inboxAccessDescription")}
          footer={
            <SectionFooter hint={accessDirty ? t("inboxUnsavedAccess") : t("inboxManagersAccess")}>
              {accessDirty && (
                <Button variant="ghost" size="sm" onClick={() => setAccess(inbox.accessValue)} disabled={accessAction.pending}>
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                disabled={!accessDirty || accessAction.pending}
                onClick={() =>
                  accessAction.run(() => updateInboxAccessAction({ slug: org.slug, id: inbox.id, access }), {
                success: t("inboxAccessUpdated"),
                  })
                }
              >
                {accessAction.pending && <Loader2 className="animate-spin" />}
                {t("inboxSaveAccess")}
              </Button>
            </SectionFooter>
          }
        >
          <AccessEditor value={access} onChange={setAccess} teams={teams} members={members} />
        </SettingsSection>
      )}

      <SettingsSection
        tone="danger"
        title={t("inboxDeleteTitle")}
        description={t("inboxDeleteDescription")}
        footer={
          <SectionFooter hint={t("inboxConversationCount").replace("{count}", String(inbox.conversationCount))}>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 /> {t("inboxDeleteTitle")}
                </Button>
              }
              title={t("inboxDeleteConfirmTitle").replace("{name}", inbox.name)}
              description={t("inboxDeleteConfirmDescription")}
              destructive
              confirmLabel={t("inboxDeleteTitle")}
              confirmText={deleteMode === "delete" ? inbox.email : undefined}
              onOpenChange={(o) => !o && setDeleteMode("keep")}
              onConfirm={async () => {
                const res = await deleteAction.run(() => deleteInboxAction({ ...ref, conversations: deleteMode }), {
                  success: (r) =>
                    deleteMode === "delete"
                      ? t("inboxDeleteSuccess").replace("{count}", String(r.conversations))
                      : t("inboxDeleteKept"),
                })
                if (res.ok) router.push(base)
                return res.ok
              }}
            >
              <div role="radiogroup" aria-label={t("inboxDeleteAccessLabel")} className="grid gap-2">
                {(
                  [
                    ["keep", t("inboxKeepConversations"), t("inboxKeepDescription")],
                    ["delete", t("inboxDeleteConversations"), t("inboxDeleteConversationsDescription").replace("{count}", String(inbox.conversationCount))],
                  ] as const
                ).map(([value, title, desc]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={deleteMode === value}
                    onClick={() => setDeleteMode(value)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      deleteMode === value && (value === "delete" ? "border-destructive/40 bg-destructive/5" : "border-foreground/30 bg-surface")
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input",
                        deleteMode === value && (value === "delete" ? "border-destructive bg-destructive" : "border-primary bg-primary")
                      )}
                    >
                      {deleteMode === value && <span className="size-1.5 rounded-full bg-background" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </ConfirmDialog>
          </SectionFooter>
        }
      />

      <SaveBar dirty={dirty} pending={save.pending} onSave={onSave} onReset={() => setForm(initial)} />
    </SettingsPage>
  )
}
