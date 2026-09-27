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
import { formatDate, fromNow, pluralize } from "@/components/settings/format"
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
        success: "Inbox settings saved",
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
    { value: NO_SIGNATURE, label: "No default signature" },
    ...signatures.map((s) => ({ value: s.id, label: s.name, hint: s.personal ? "Personal" : "Workspace" })),
  ]

  return (
    <SettingsPage
      eyebrow={
        <Link href={base} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> {scope === "shared" ? "Inboxes" : "My inboxes"}
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
          <span>Connected {formatDate(inbox.createdAt)}</span>
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
                onClick={() => actions.run(() => syncInboxNow(ref), { success: "Sync requested" })}
              >
                <RefreshCw className={cn(actions.pending && "animate-spin")} /> Sync now
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={actions.pending}
              onClick={() =>
                actions.run(() => setInboxPausedAction({ ...ref, paused: inbox.status !== "paused" }), {
                  success: (r) => (r.paused ? "Syncing paused" : "Syncing resumed"),
                })
              }
            >
              {inbox.status === "paused" ? <Play /> : <Pause />}
              {inbox.status === "paused" ? "Resume" : "Pause"}
            </Button>
          </>
        )
      }
    >
      {/* Status strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {[
          { label: "Status", value: <InboxStatusBadge status={inbox.status} lastError={inbox.lastError} /> },
          { label: "Last synced", value: inbox.status === "paused" ? "Paused" : inbox.lastSyncedAt ? fromNow(inbox.lastSyncedAt) : "Not yet" },
          { label: "Conversations", value: inbox.conversationCount.toLocaleString() },
          { label: "History", value: inbox.config.syncDays === 365 ? "1 year" : `${inbox.config.syncDays} days` },
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
            <p className="font-medium">Sync is failing</p>
            <p className="mt-0.5 break-words text-muted-foreground">{inbox.lastError}</p>
            <p className="mt-1 text-muted-foreground">
              {isOAuth ? "Reconnect the account to grant access again." : "Check the password and server settings under Connection."}
            </p>
          </div>
        </div>
      )}

      <SettingsSection title="Inbox" description="How this inbox appears in Dispatch and to your recipients.">
        <div className="flex flex-col gap-5">
          <IdentityFields
            value={form}
            onChange={(v) => setForm((f) => ({ ...f, ...v }))}
            errors={save.fieldErrors}
            teams={teams}
            showTeam={scope === "shared"}
          />
          <FormField
            label="Default signature"
            htmlFor="inbox-signature"
            description={
              <>
                Added to new emails and replies from this inbox.{" "}
                <Link href={`/w/${org.slug}/settings/signatures`} className="underline underline-offset-2 hover:text-foreground">
                  Manage signatures
                </Link>
              </>
            }
          >
            <Combobox
              id="inbox-signature"
              options={signatureOptions}
              value={form.signatureId ?? NO_SIGNATURE}
              onChange={(v) => setForm((f) => ({ ...f, signatureId: !v || v === NO_SIGNATURE ? null : v }))}
              searchPlaceholder="Search signatures…"
              className="sm:max-w-sm"
            />
          </FormField>
          {!isDemo && (
            <SettingsRows>
              <SettingsRow label="Import history" description="How far back existing email is synced. Increasing it imports older mail on the next sync.">
                <SyncDaysField value={form.syncDays} onChange={(syncDays) => setForm((f) => ({ ...f, syncDays }))} />
              </SettingsRow>
            </SettingsRows>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Sending" description="Addresses and defaults used when replying from this inbox.">
        <SendingFields value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} errors={save.fieldErrors} />
      </SettingsSection>

      {!isDemo && (
        <SettingsSection
          title="Folders"
          description="Mailbox folders Dispatch uses when you send, archive, delete or mark spam."
          footer={
            isImap ? (
              <SectionFooter hint={test?.imap.ok ? `Loaded ${pluralize(test.imap.mailboxes.length, "folder")} from the server.` : "Load the folder list from the server to pick folders."}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retest.pending}
                  onClick={() => retest.run(() => retestInbox(ref), { onSuccess: setTest })}
                >
                  {retest.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Re-test connection
                </Button>
              </SectionFooter>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground">
              Incoming mail is read from <Code>{inbox.config.inboxPath}</Code>.
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
        title="Connection"
        description={
          isImap
            ? "IMAP receives mail, SMTP sends it. Passwords are encrypted and never shown again."
            : isOAuth
              ? `Connected with ${oauthProvider === "google" ? "Google" : "Microsoft"} — no password is stored.`
              : "Demo inboxes contain sample data and don't connect to a mail server."
        }
        footer={
          isImap ? (
            <SectionFooter hint="Changing settings re-tests the connection before saving.">
              <Button
                variant="ghost"
                size="sm"
                disabled={retest.pending}
                onClick={() => retest.run(() => retestInbox(ref), { onSuccess: setTest })}
              >
                {retest.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Test
              </Button>
              <CredentialsDialog key={`${inbox.connection.imap?.host}:${inbox.connection.imap?.user}`} inbox={inbox} />
            </SectionFooter>
          ) : isOAuth ? (
            <SectionFooter hint={canReconnect ? "Reconnect if access was revoked or the password changed." : "Sign-in with this provider is currently disabled by your administrator."}>
              {canReconnect && (
                <Button asChild variant="outline" size="sm">
                  <a href={reconnectHref}>
                    {oauthProvider === "google" ? <GoogleGlyph /> : <MicrosoftGlyph />}
                    Reconnect with {oauthProvider === "google" ? "Google" : "Microsoft"}
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
                  ["Incoming · IMAP", inbox.connection.imap],
                  ["Outgoing · SMTP", inbox.connection.smtp],
                ] as const
              ).map(([label, s]) => (
                <div key={label} className="flex flex-col gap-2 rounded-lg border bg-surface/40 p-3.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                    <Server className="size-3" /> {label}
                  </span>
                  {s ? (
                    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px]">
                      <dt className="text-muted-foreground">Server</dt>
                      <dd className="truncate font-mono text-[12.5px]">
                        {s.host}:{s.port}
                      </dd>
                      <dt className="text-muted-foreground">Security</dt>
                      <dd>{s.secure ? "SSL/TLS" : "STARTTLS"}</dd>
                      <dt className="text-muted-foreground">Username</dt>
                      <dd className="truncate">{s.user}</dd>
                      <dt className="text-muted-foreground">Password</dt>
                      <dd className="tracking-widest text-muted-foreground">{inbox.connection.hasPassword ? "••••••••" : "Not set"}</dd>
                    </dl>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">Not configured</p>
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
              <div className="font-medium">{oauthProvider === "google" ? "Google account" : "Microsoft account"}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{inbox.email}</div>
            </div>
          </div>
        ) : null}
      </SettingsSection>

      {scope === "shared" && (
        <SettingsSection
          title="Access"
          description="Who can see and reply to conversations in this inbox."
          footer={
            <SectionFooter hint={accessDirty ? "You have unsaved access changes." : "People who manage inboxes always have access."}>
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
                    success: "Access updated",
                  })
                }
              >
                {accessAction.pending && <Loader2 className="animate-spin" />}
                Save access
              </Button>
            </SectionFooter>
          }
        >
          <AccessEditor value={access} onChange={setAccess} teams={teams} members={members} />
        </SettingsSection>
      )}

      <SettingsSection
        tone="danger"
        title="Delete inbox"
        description="Disconnects the mailbox from Dispatch. Email on the mail server is not touched."
        footer={
          <SectionFooter hint={pluralize(inbox.conversationCount, "conversation") + " in this inbox."}>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 /> Delete inbox
                </Button>
              }
              title={`Delete ${inbox.name}?`}
              description="This stops syncing and removes the inbox, its access rules and its folder state from Dispatch."
              destructive
              confirmLabel="Delete inbox"
              confirmText={deleteMode === "delete" ? inbox.email : undefined}
              onOpenChange={(o) => !o && setDeleteMode("keep")}
              onConfirm={async () => {
                const res = await deleteAction.run(() => deleteInboxAction({ ...ref, conversations: deleteMode }), {
                  success: (r) =>
                    deleteMode === "delete"
                      ? `Inbox deleted with ${pluralize(r.conversations, "conversation")}`
                      : "Inbox deleted — conversations were kept",
                })
                if (res.ok) router.push(base)
                return res.ok
              }}
            >
              <div role="radiogroup" aria-label="Conversations" className="grid gap-2">
                {(
                  [
                    ["keep", "Keep conversations", "Conversations stay searchable in Dispatch, detached from this inbox."],
                    ["delete", "Delete conversations", `Permanently delete ${pluralize(inbox.conversationCount, "conversation")}, including comments and tasks.`],
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
