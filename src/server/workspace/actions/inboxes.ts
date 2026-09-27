"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { assertAnyPermission, assertNotImpersonating, auditAction, personalAction, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import { scheduleStorageCleanup } from "@/server/workspace/storage-cleanup"
import {
  accessSchema,
  connectSchema,
  createInbox,
  credentialsSchema,
  deleteInbox,
  getManagedAccount,
  permissionFor,
  requestInboxSync,
  retestAccount,
  runConnectionTest,
  scopeSchema,
  setInboxPaused,
  testSchema,
  updateInboxAccess,
  updateInboxCredentials,
  updateInboxSettings,
  updateSettingsSchema,
} from "@/server/workspace/services/inboxes"

/**
 * Server actions for Settings → Inboxes (shared) and Settings → My inboxes
 * (personal). Logic lives in services/inboxes.ts.
 */

const ref = z.object({ slug: z.string(), scope: scopeSchema, id: z.uuid() })

/** Test IMAP + SMTP credentials entered in the connect wizard. */
export const testInboxConnection = action(testSchema, async (input) => {
  // Testing doesn't write anything, so it's allowed while the workspace is read-only
  const ctx = await personalAction(input.slug)
  assertAnyPermission(ctx, permissionFor(input.scope))
  return runConnectionTest(ctx, { ...input.imap }, { ...input.smtp })
})

export const connectInbox = action(connectSchema, async (input) => {
  const ctx = await workspaceAction(input.slug, permissionFor(input.scope))
  assertNotImpersonating(ctx, "connect mailboxes")
  const { slug: _slug, ...rest } = input
  void _slug
  const { id } = await createInbox(ctx, rest)
  await auditAction(ctx, "inbox.connected", { type: "account", id }, {
    email: input.email,
    scope: input.scope,
    provider: "imap",
    imapHost: input.imap.host,
    smtpHost: input.smtp.host,
    access: input.scope === "shared" ? (input.access?.mode ?? "everyone") : "private",
  })
  await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId: id } })
  revalidateSettings()
  return { id }
})

/** Re-test the stored credentials of an existing inbox (returns folders, never secrets). */
export const retestInbox = action(ref, async (input) => {
  const ctx = await personalAction(input.slug)
  const account = await getManagedAccount(ctx, input.id, input.scope)
  return retestAccount(ctx, account)
})

export const updateInbox = action(ref.extend({ settings: updateSettingsSchema }), async (input) => {
  const ctx = await workspaceAction(input.slug, permissionFor(input.scope))
  const { account, syncDaysChanged } = await updateInboxSettings(ctx, input.id, input.scope, input.settings)
  await auditAction(ctx, "inbox.updated", { type: "account", id: account.id }, {
    email: account.email,
    name: input.settings.name,
    ...(syncDaysChanged ? { syncDays: input.settings.syncDays } : {}),
  })
  await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId: account.id } })
  revalidateSettings()
  return { ok: true }
})

export const updateInboxAccessAction = action(
  z.object({ slug: z.string(), id: z.uuid(), access: accessSchema }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "inboxes.manage")
    const { account, grants } = await updateInboxAccess(ctx, input.id, input.access)
    await auditAction(ctx, "inbox.access_updated", { type: "account", id: account.id }, {
      email: account.email,
      mode: input.access.mode,
      teams: grants.filter((g) => g.kind === "team").length,
      users: grants.filter((g) => g.kind === "user").length,
    })
    await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId: account.id } })
    revalidateSettings()
    return { ok: true }
  }
)

/** Update server settings / passwords. Tests first; saves only when IMAP works. */
export const updateInboxCredentialsAction = action(ref.extend({ credentials: credentialsSchema }), async (input) => {
  const ctx = await workspaceAction(input.slug, permissionFor(input.scope))
  assertNotImpersonating(ctx, "change mailbox credentials")
  const res = await updateInboxCredentials(ctx, input.id, input.scope, input.credentials)
  if (res.saved) {
    await auditAction(ctx, "inbox.credentials_rotated", { type: "account", id: res.account.id }, {
      email: res.account.email,
      imapHost: input.credentials.imap.host,
      smtpHost: input.credentials.smtp.host,
    })
    await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId: res.account.id } })
    revalidateSettings()
  }
  return { saved: res.saved, result: res.result }
})

export const setInboxPausedAction = action(ref.extend({ paused: z.boolean() }), async (input) => {
  const ctx = await workspaceAction(input.slug, permissionFor(input.scope))
  const { account, changed } = await setInboxPaused(ctx, input.id, input.scope, input.paused)
  if (changed) {
    await auditAction(ctx, input.paused ? "inbox.paused" : "inbox.resumed", { type: "account", id: account.id }, { email: account.email })
    await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId: account.id } })
    revalidateSettings()
  }
  return { paused: input.paused }
})

export const syncInboxNow = action(ref, async (input) => {
  const ctx = await workspaceAction(input.slug, permissionFor(input.scope))
  const { account } = await requestInboxSync(ctx, input.id, input.scope)
  await auditAction(ctx, "inbox.sync_requested", { type: "account", id: account.id }, { email: account.email })
  return { ok: true }
})

export const deleteInboxAction = action(ref.extend({ conversations: z.enum(["keep", "delete"]) }), async (input) => {
  const ctx = await workspaceAction(input.slug, permissionFor(input.scope))
  const { account, conversations, storageKeys } = await deleteInbox(ctx, input.id, input.scope, input.conversations)
  scheduleStorageCleanup(storageKeys)
  await auditAction(ctx, "inbox.deleted", { type: "account", id: account.id }, {
    email: account.email,
    name: account.name,
    scope: input.scope,
    conversations: input.conversations,
    conversationCount: conversations,
  })
  await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId: account.id, deleted: true } })
  await publish({ orgId: ctx.org.id, type: "conversation.deleted", actorId: ctx.user.id })
  revalidateSettings()
  return { conversations }
})
