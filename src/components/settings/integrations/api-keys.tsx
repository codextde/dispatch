"use client"

import { useMemo, useState } from "react"
import { ChevronDown, KeyRound, Loader2, Plus } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { formatDate, fromNow, pluralize } from "@/components/settings/format"
import { EmptyState, FormField, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { CodeBlock } from "@/components/settings/integrations/code-block"
import { SecretReveal } from "@/components/settings/integrations/secret-reveal"
import { createApiKey, revokeApiKey } from "@/server/workspace/actions/integrations"
import type { ApiKeyRow } from "@/server/workspace/queries/integrations"
import { PERMISSION_GROUPS, PERMISSIONS, type Permission } from "@/lib/permissions"
import { cn } from "@/lib/utils"

type KeyStatus = "active" | "expired" | "revoked"

function keyStatus(k: ApiKeyRow, now: number): KeyStatus {
  if (k.revokedAt) return "revoked"
  if (k.expiresAt && new Date(k.expiresAt).getTime() <= now) return "expired"
  return "active"
}

export function ApiKeysSection({ slug, keys, appUrl, now }: { slug: string; keys: ApiKeyRow[]; appUrl: string; now: number }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const withStatus = keys.map((k) => ({ ...k, status: keyStatus(k, now) }))
  const active = withStatus.filter((k) => k.status === "active")
  const inactive = withStatus.filter((k) => k.status !== "active")

  return (
    <SettingsSection
      id="api-keys"
      title="API keys"
      description="Keys authenticate requests to the REST API. A key acts as the member who created it, optionally limited to a subset of their permissions."
      action={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Create API key
        </Button>
      }
      flush
    >
      {keys.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<KeyRound />}
            title="No API keys yet"
            description="Create a key to read conversations, send replies or sync contacts from your own tools."
          >
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus /> Create your first key
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="border-t">
          {active.length === 0 && (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">No active keys. Revoked and expired keys are listed below.</p>
          )}
          <ul className="divide-y">
            {active.map((k) => (
              <ApiKeyItem key={k.id} slug={slug} apiKey={k} />
            ))}
          </ul>
          {inactive.length > 0 && (
            <div className="border-t">
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                aria-expanded={showInactive}
                className="flex w-full items-center gap-1.5 px-5 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", !showInactive && "-rotate-90")} />
                {pluralize(inactive.length, "revoked or expired key")}
              </button>
              {showInactive && (
                <ul className="divide-y border-t bg-surface/30">
                  {inactive.map((k) => (
                    <ApiKeyItem key={k.id} slug={slug} apiKey={k} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      <CreateApiKeyDialog slug={slug} appUrl={appUrl} open={createOpen} onOpenChange={setCreateOpen} />
    </SettingsSection>
  )
}

function ScopesSummary({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) return <span>Full access</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
          {pluralize(scopes.length, "permission")}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="flex flex-col gap-0.5 py-0.5">
          {scopes.map((s) => (
            <li key={s}>{PERMISSIONS[s as Permission]?.label ?? s}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function ApiKeyItem({ slug, apiKey: k }: { slug: string; apiKey: ApiKeyRow & { status: KeyStatus } }) {
  const { run } = useServerAction()
  return (
    <li className={cn("flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4", k.status !== "active" && "opacity-70")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{k.name}</span>
            {k.status === "active" && <StatusBadge tone="success">Active</StatusBadge>}
            {k.status === "expired" && <StatusBadge tone="warning">Expired</StatusBadge>}
            {k.status === "revoked" && <StatusBadge tone="neutral">Revoked</StatusBadge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <code className="font-mono text-[11.5px] text-foreground/80">{k.prefix}…</code>
            <ScopesSummary scopes={k.scopes} />
            <span>
              {k.revokedAt
                ? `Revoked ${fromNow(k.revokedAt)}`
                : k.expiresAt
                  ? `${k.status === "expired" ? "Expired" : "Expires"} ${formatDate(k.expiresAt)}`
                  : "Never expires"}
            </span>
            <span>{k.lastUsedAt ? `Last used ${fromNow(k.lastUsedAt)}` : "Never used"}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pl-11 sm:justify-end sm:pl-0">
        {k.createdBy ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={`Created ${formatDate(k.createdAt)}`}>
            <UserAvatar name={k.createdBy.name} email={k.createdBy.email} src={k.createdBy.avatarUrl} size="xs" />
            <span className="max-w-36 truncate">{k.createdBy.name || k.createdBy.email}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Former member</span>
        )}
        {k.status === "active" && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                Revoke
              </Button>
            }
            title={`Revoke “${k.name}”?`}
            description="Requests using this key will fail immediately. This can't be undone."
            confirmLabel="Revoke key"
            destructive
            onConfirm={async () => {
              const res = await run(() => revokeApiKey({ slug, id: k.id }), { success: "API key revoked" })
              return res.ok
            }}
          />
        )}
      </div>
    </li>
  )
}

type Expiry = "never" | "30" | "90" | "365" | "custom"

function CreateApiKeyDialog({
  slug,
  appUrl,
  open,
  onOpenChange,
}: {
  slug: string
  appUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { permissions } = useOrg()
  const mine = useMemo(() => new Set(permissions), [permissions])
  const { pending, run, fieldErrors, setFieldErrors } = useServerAction()
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState<Expiry>("90")
  const [customDate, setCustomDate] = useState("")
  const [access, setAccess] = useState<"full" | "restricted">("full")
  const [scopes, setScopes] = useState<string[]>([])
  const [created, setCreated] = useState<{ key: string; prefix: string } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const reset = () => {
    setName("")
    setExpiry("90")
    setCustomDate("")
    setAccess("full")
    setScopes([])
    setCreated(null)
    setLocalError(null)
    setFieldErrors({})
  }

  const close = (v: boolean) => {
    if (pending) return
    onOpenChange(v)
    if (!v) setTimeout(reset, 200)
  }

  const submit = () => {
    setLocalError(null)
    if (!name.trim()) return setLocalError("Give the key a name")
    let expiresAt: string | null = null
    if (expiry === "custom") {
      if (!customDate) return setLocalError("Pick an expiry date")
      const d = new Date(`${customDate}T23:59:59`)
      if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 3_600_000) return setLocalError("The expiry date must be in the future")
      expiresAt = d.toISOString()
    } else if (expiry !== "never") {
      expiresAt = new Date(Date.now() + Number(expiry) * 86_400_000).toISOString()
    }
    if (access === "restricted" && scopes.length === 0) return setLocalError("Pick at least one permission, or choose full access")
    void run(() => createApiKey({ slug, name: name.trim(), expiresAt, scopes: access === "full" ? [] : scopes }), {
      success: "API key created",
      onSuccess: (data) => setCreated({ key: data.key, prefix: data.prefix }),
    })
  }

  const toggleScope = (p: string, on: boolean) => setScopes((s) => (on ? [...new Set([...s, p])] : s.filter((x) => x !== p)))
  const nameError = localError === "Give the key a name" ? localError : fieldErrors.name
  const formError = localError && localError !== "Give the key a name" ? localError : null

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>Use it as a Bearer token in the Authorization header.</DialogDescription>
            </DialogHeader>
            <SecretReveal value={created.key} />
            <CodeBlock
              label="Try it"
              code={`curl ${appUrl}/api/w/${slug}/conversations \\\n  -H "Authorization: Bearer ${created.key}"`}
            />
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>The key will act as you. Anyone with the key can do what it allows — store it like a password.</DialogDescription>
            </DialogHeader>

            <FormField label="Name" htmlFor="key-name" error={nameError} description="So you can recognize it later, e.g. “Zapier” or “CRM sync”.">
              <Input
                id="key-name"
                autoFocus
                maxLength={80}
                value={name}
                aria-invalid={Boolean(nameError)}
                onChange={(e) => setName(e.target.value)}
                placeholder="CRM sync"
              />
            </FormField>

            <FormField label="Expiration" htmlFor="key-expiry">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={expiry} onValueChange={(v) => setExpiry(v as Expiry)}>
                  <SelectTrigger id="key-expiry" className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="custom">Custom date…</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
                {expiry === "custom" && (
                  <Input
                    type="date"
                    aria-label="Expiry date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="sm:w-44"
                  />
                )}
              </div>
            </FormField>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Access</span>
              <RadioGroup value={access} onValueChange={(v) => setAccess(v as "full" | "restricted")} className="gap-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 has-data-checked:border-foreground/30 has-data-checked:bg-muted/30">
                  <RadioGroupItem value="full" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Full access</span>
                    <span className="block text-xs text-muted-foreground">Everything your role can do, now and after role changes.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 has-data-checked:border-foreground/30 has-data-checked:bg-muted/30">
                  <RadioGroupItem value="restricted" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Restricted</span>
                    <span className="block text-xs text-muted-foreground">Only the permissions you pick (and only while your role has them).</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {access === "restricted" && (
              <div className="flex flex-col gap-4 rounded-lg border bg-surface/40 p-3">
                {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                  <fieldset key={group} className="flex flex-col gap-2">
                    <legend className="mb-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{group}</legend>
                    {perms.map((p) => {
                      const allowed = mine.has(p)
                      return (
                        <label
                          key={p}
                          className={cn("flex items-start gap-2.5", allowed ? "cursor-pointer" : "cursor-not-allowed opacity-50")}
                          title={allowed ? undefined : "Your role doesn't have this permission"}
                        >
                          <Checkbox
                            className="mt-0.5"
                            disabled={!allowed}
                            checked={scopes.includes(p)}
                            onCheckedChange={(v) => toggleScope(p, v === true)}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium">{PERMISSIONS[p].label}</span>
                            <span className="block text-xs text-muted-foreground">{PERMISSIONS[p].description}</span>
                          </span>
                        </label>
                      )
                    })}
                  </fieldset>
                ))}
              </div>
            )}

            {formError && (
              <p role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
