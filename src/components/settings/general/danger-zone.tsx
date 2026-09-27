"use client"

import { useState } from "react"
import { DatabaseZap, Loader2, LogOut, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { clearDemoData, deleteWorkspace, leaveWorkspace, loadDemoData } from "@/server/workspace/actions/general"

export function DemoDataSection({ slug, hasDemo }: { slug: string; hasDemo: boolean }) {
  const { pending, run } = useServerAction()
  const [present, setPresent] = useState(hasDemo)
  return (
    <SettingsSection
      title="Demo data"
      description="Explore Dispatch with a realistic sample company: teammates, two shared inboxes, conversations with comments, chats, tasks, contacts, canned responses and a rule."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
            <DatabaseZap className="size-4" />
          </span>
          <span className="text-muted-foreground">
            {present
              ? "Demo data is loaded. Removing it deletes only the sample records — your real data stays."
              : "Sample data is clearly marked and can be removed in one click."}
          </span>
        </div>
        {present ? (
          <ConfirmDialog
            title="Remove demo data?"
            description="All sample teammates, inboxes, conversations, tasks and other demo records will be deleted. Your own data is not affected."
            confirmLabel="Remove demo data"
            destructive
            onConfirm={async () => {
              const res = await run(() => clearDemoData({ slug }), { success: "Demo data removed" })
              if (res.ok) setPresent(false)
              return res.ok
            }}
            trigger={
              <Button variant="outline" size="sm" className="shrink-0">
                <Trash2 /> Remove demo data
              </Button>
            }
          />
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            disabled={pending}
            onClick={() =>
              run(() => loadDemoData({ slug }), {
                success: (d) => (d.skipped ? "Demo data is already loaded" : `Loaded ${d.conversations} demo conversations`),
                onSuccess: () => setPresent(true),
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Loading…" : "Load demo data"}
          </Button>
        )}
      </div>
    </SettingsSection>
  )
}

/** "Leave workspace" button with confirmation. Used on the profile page and in the danger zone. */
export function LeaveWorkspaceButton({ slug, orgName }: { slug: string; orgName: string }) {
  const { run } = useServerAction()
  return (
    <ConfirmDialog
      title={`Leave ${orgName}?`}
      description="You'll lose access to its inboxes and conversations. Your personal inboxes, private labels, responses and rules in this workspace are deleted. You'll need a new invitation to come back."
      confirmLabel="Leave workspace"
      destructive
      onConfirm={async () => {
        const res = await run(() => leaveWorkspace({ slug }), { success: `You left ${orgName}` })
        if (res.ok) window.location.assign(res.data.redirectTo)
        return res.ok
      }}
      trigger={
        <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive">
          <LogOut /> Leave workspace
        </Button>
      }
    />
  )
}

export function DangerZone({ slug, orgName, isOwner, hasSubscription }: { slug: string; orgName: string; isOwner: boolean; hasSubscription: boolean }) {
  const { run } = useServerAction()
  return (
    <SettingsSection tone="danger" title="Danger zone" description="Irreversible actions. Please be certain.">
      <SettingsRows>
        <SettingsRow label="Leave workspace" description="Remove yourself from this workspace. Owners must hand over ownership first.">
          <LeaveWorkspaceButton slug={slug} orgName={orgName} />
        </SettingsRow>
        {isOwner && (
          <SettingsRow
            label="Delete workspace"
            description="Permanently delete the workspace with all inboxes, conversations, members, settings and history."
          >
            <ConfirmDialog
              title={`Delete ${orgName}?`}
              description={
                <>
                  This permanently deletes every conversation, comment, contact, task, inbox connection and setting in this workspace
                  and removes all members. {hasSubscription && "The subscription is canceled immediately. "}
                  This cannot be undone.
                </>
              }
              confirmText={slug}
              confirmLabel="Delete workspace"
              destructive
              onConfirm={async () => {
                const res = await run(() => deleteWorkspace({ slug, confirm: slug }), { success: `${orgName} was deleted` })
                if (res.ok) window.location.assign(res.data.redirectTo)
                return res.ok
              }}
              trigger={
                <Button size="sm" className="shrink-0 bg-destructive text-white hover:bg-destructive/90">
                  <Trash2 /> Delete workspace
                </Button>
              }
            />
          </SettingsRow>
        )}
      </SettingsRows>
    </SettingsSection>
  )
}
