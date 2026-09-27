"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Copy, Ellipsis, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/app/user-avatar"
import { MultiCombobox, type ComboOption } from "@/components/settings/combobox"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import {
  ColorDot,
  FormField,
  SaveBar,
  SettingsPage,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { pluralize } from "@/components/settings/format"
import { LocalTime } from "@/components/app/local-time"
import {
  ACTION_DEFS,
  ACTION_GROUPS,
  ACTION_ORDER,
  PARAMETERLESS_ACTIONS,
  RULE_LIMITS,
  TRIGGERS,
  validateRuleStructure,
  type ActionType,
  type RuleInput,
  type RuleScope,
} from "@/components/settings/rules/definitions"
import {
  draftFromRule,
  draftToInput,
  newAction,
  newCondition,
  type ActionDraft,
  type ConditionDraft,
  type InitialRule,
  type RuleDraft,
} from "@/components/settings/rules/drafts"
import { ConditionRow } from "@/components/settings/rules/condition-row"
import { ActionRow, type ActionOptions } from "@/components/settings/rules/action-row"
import { ACTION_ICONS } from "@/components/settings/rules/rule-icons"
import { createRule, deleteRule, duplicateRule, updateRule } from "@/server/workspace/actions/rules"
import type { RuleOptions } from "@/server/workspace/queries/rules"
import { cn } from "@/lib/utils"

export type RuleBuilderProps = {
  slug: string
  scope: RuleScope
  /** null for a new rule */
  rule: (InitialRule & { id: string; runCount: number; lastRunAt: Date | null; createdAt: Date }) | null
  options: RuleOptions
  allowHttpLocalhost: boolean
}

const serialize = (input: RuleInput) => JSON.stringify(input)

export function RuleBuilder({ slug, scope, rule, options, allowHttpLocalhost }: RuleBuilderProps) {
  const router = useRouter()
  const isNew = rule === null
  const listHref = `/w/${slug}/settings/rules${scope === "personal" ? "?scope=personal" : ""}`

  const [draft, setDraft] = useState<RuleDraft>(() => draftFromRule(rule))
  const [baseline, setBaseline] = useState(() => serialize(draftToInput(draftFromRule(rule))))
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { pending, run } = useServerAction()
  const formRef = useRef<HTMLDivElement>(null)

  const input = useMemo(() => draftToInput(draft), [draft])
  const dirty = isNew || serialize(input) !== baseline

  /* ------------------------------- Options -------------------------------- */

  const accountOptions: ComboOption[] = useMemo(
    () =>
      options.accounts.map((a) => ({
        value: a.id,
        label: a.name,
        hint: a.email,
        icon: <ColorDot color={a.color} />,
      })),
    [options.accounts]
  )
  const actionOptions: ActionOptions = useMemo(
    () => ({
      labels: options.labels.map((l) => ({
        value: l.id,
        label: l.name,
        icon: <ColorDot color={l.color} />,
        group: scope === "personal" ? (l.visibility === "private" ? "My labels" : "Shared labels") : undefined,
      })),
      members: options.members.map((m) => ({
        value: m.id,
        label: m.name || m.email,
        hint: m.name ? m.email : undefined,
        icon: <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />,
      })),
      teams: options.teams.map((t) => ({ value: t.id, label: t.name, icon: <ColorDot color={t.color} /> })),
      responses: options.responses.map((r) => ({
        value: r.id,
        label: r.name,
        group: r.kind === "personal" ? "Personal" : r.kind === "team" ? "Team" : "Workspace",
      })),
    }),
    [options, scope]
  )

  /* ------------------------------ Validation ------------------------------ */

  const clientErrors = useMemo(() => {
    const errs = validateRuleStructure(input, { allowHttpLocalhost })
    const has = (list: { value: string }[], v: string) => list.some((o) => o.value === v)
    if (input.accountIds.some((id) => !has(accountOptions, id))) errs.accountIds = "Some selected inboxes are no longer available"
    input.conditions.conditions.forEach((c, i) => {
      const k = `conditions.${i}.value`
      if (errs[k] || !c.value) return
      if (c.field === "account" && !has(accountOptions, c.value)) errs[k] = "This inbox is no longer available"
      if (c.field === "label" && !has(actionOptions.labels, c.value)) errs[k] = "This label is no longer available"
    })
    input.actions.forEach((a, i) => {
      const k = `actions.${i}`
      if ((a.type === "add_label" || a.type === "remove_label") && a.labelId && !has(actionOptions.labels, a.labelId)) {
        errs[`${k}.labelId`] = "This label is no longer available"
      }
      if (a.type === "assign" && a.userId && !has(actionOptions.members, a.userId)) errs[`${k}.userId`] = "This person is no longer an active member"
      if (a.type === "assign_team" && a.teamId && !has(actionOptions.teams, a.teamId)) errs[`${k}.teamId`] = "This team no longer exists"
      if (a.type === "auto_reply" && a.cannedResponseId && !has(actionOptions.responses, a.cannedResponseId)) {
        errs[`${k}.cannedResponseId`] = "This canned response is no longer available"
      }
    })
    return errs
  }, [input, allowHttpLocalhost, accountOptions, actionOptions])

  const errors = useMemo(
    () => (submitted ? { ...serverErrors, ...clientErrors } : serverErrors),
    [submitted, serverErrors, clientErrors]
  )

  /* -------------------------------- Updates ------------------------------- */

  const update = useCallback((patch: Partial<RuleDraft>) => {
    setServerErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const updateCondition = (key: string, patch: Partial<ConditionDraft>) =>
    update({ conditions: draft.conditions.map((c) => (c.key === key ? { ...c, ...patch } : c)) })
  const updateAction = (key: string, patch: Partial<ActionDraft>) =>
    update({ actions: draft.actions.map((a) => (a.key === key ? { ...a, ...patch } : a)) })
  const moveAction = (index: number, dir: -1 | 1) => {
    const next = [...draft.actions]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    update({ actions: next })
  }
  const addAction = (type: ActionType) => update({ actions: [...draft.actions, newAction(type)] })

  /* --------------------------------- Save --------------------------------- */

  const focusFirstError = () => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
      if (el && "focus" in el && el.matches("input, textarea, button")) el.focus({ preventScroll: true })
    })
  }

  const save = () => {
    if (pending) return
    setSubmitted(true)
    if (Object.keys(clientErrors).length) {
      toast.error("Please fix the highlighted fields")
      focusFirstError()
      return
    }
    const payload = input
    void run(() => (isNew ? createRule({ slug, scope, ...payload }) : updateRule({ slug, id: rule.id, ...payload })), {
      success: isNew ? "Rule created" : "Rule saved",
      onSuccess: (res) => {
        setServerErrors({})
        setSubmitted(false)
        setBaseline(serialize(payload))
        if (isNew) router.replace(`/w/${slug}/settings/rules/${res.id}`)
      },
      onError: (_, fieldErrors) => {
        setServerErrors(fieldErrors ?? {})
        if (fieldErrors && Object.keys(fieldErrors).length) focusFirstError()
      },
    })
  }

  const reset = () => {
    setDraft(draftFromRule(rule))
    setServerErrors({})
    setSubmitted(false)
  }

  // ⌘S / Ctrl+S saves; warn before leaving with unsaved changes
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  useEffect(() => {
    if (!dirty || isNew) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty, isNew])

  /* -------------------------------- Render -------------------------------- */

  const allInboxesLabel = scope === "workspace" ? "All shared inboxes" : "All my inboxes"
  const presentParameterless = new Set(draft.actions.filter((a) => PARAMETERLESS_ACTIONS.includes(a.type)).map((a) => a.type))

  return (
    <SettingsPage
      eyebrow={
        <Link href={listHref} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Rules
        </Link>
      }
      title={isNew ? "New rule" : draft.name.trim() || "Untitled rule"}
      quiet={scope === "workspace" ? "· workspace" : "· personal"}
      description={
        isNew
          ? scope === "workspace"
            ? "Workspace rules run on shared inboxes for the whole team."
            : "Personal rules only run on your own inboxes."
          : rule.runCount > 0
            ? (
                <>
                  Ran {pluralize(rule.runCount, "time")}
                  {rule.lastRunAt && (
                    <>
                      {" "}
                      · last run <LocalTime date={rule.lastRunAt} format="relative" titleFormat="datetime" />
                    </>
                  )}
                </>
              )
            : "This rule hasn't run yet."
      }
      actions={
        isNew ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={listHref}>Cancel</Link>
          </Button>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More actions">
                <Ellipsis /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onSelect={() =>
                  void run(() => duplicateRule({ slug, id: rule.id }), {
                    success: "Rule duplicated — the copy is paused",
                    onSuccess: (res) => router.push(`/w/${slug}/settings/rules/${res.id}`),
                  })
                }
              >
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> Delete rule
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <div ref={formRef} className="flex flex-col gap-6">
        {/* Basics */}
        <SettingsSection title="Basics">
          <div className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="rule-name" error={errors.name}>
              <Input
                id="rule-name"
                value={draft.name}
                maxLength={RULE_LIMITS.name}
                placeholder="e.g. Route billing emails to Finance"
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => update({ name: e.target.value })}
                autoFocus={isNew}
              />
            </FormField>
            <FormField label="Description" htmlFor="rule-description" optional error={errors.description}>
              <Textarea
                id="rule-description"
                value={draft.description}
                maxLength={RULE_LIMITS.description}
                placeholder="What does this rule do and why?"
                onChange={(e) => update({ description: e.target.value })}
                className="min-h-14"
              />
            </FormField>
            <div className="flex flex-col gap-1.5">
              <span id="rule-trigger" className="text-[13px] font-medium">
                Trigger
              </span>
              <div role="radiogroup" aria-labelledby="rule-trigger" className="grid gap-2 sm:grid-cols-2">
                {TRIGGERS.map((t) => {
                  const selected = draft.trigger === t.value
                  const Icon = t.value === "incoming" ? ArrowDownToLine : ArrowUpFromLine
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => update({ trigger: t.value })}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected && "border-brand/60 bg-brand-soft/50 hover:bg-brand-soft/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md border bg-surface text-muted-foreground",
                          selected && "border-brand/40 text-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{t.label}</span>
                        <span className="block text-xs text-muted-foreground">{t.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Inboxes */}
        <SettingsSection
          title="Inboxes"
          description={
            scope === "workspace"
              ? "Choose the shared inboxes this rule runs on. Leave empty to run on all of them, including inboxes connected later."
              : "Choose which of your inboxes this rule runs on. Leave empty to run on all of them."
          }
        >
          <FormField label="Apply to" htmlFor="rule-inboxes" error={errors.accountIds}>
            <MultiCombobox
              id="rule-inboxes"
              options={accountOptions}
              value={draft.accountIds}
              onChange={(v) => update({ accountIds: v })}
              placeholder={allInboxesLabel}
              searchPlaceholder="Search inboxes…"
              emptyText={scope === "workspace" ? "No shared inboxes yet." : "You haven't connected an inbox yet."}
            />
          </FormField>
        </SettingsSection>

        {/* Conditions */}
        <SettingsSection
          title="Conditions"
          description="Narrow down which emails the rule applies to."
          action={
            draft.conditions.length > 1 ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span>Match</span>
                <Select value={draft.match} onValueChange={(v) => update({ match: v as RuleDraft["match"] })}>
                  <SelectTrigger size="sm" className="w-20" aria-label="Condition matching">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="any">any</SelectItem>
                  </SelectContent>
                </Select>
                <span>conditions</span>
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-2">
            {draft.conditions.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-surface/40 px-4 py-5 text-center text-[13px] text-muted-foreground">
                No conditions — this rule runs on every {draft.trigger === "outgoing" ? "outgoing" : "incoming"} email.
              </p>
            ) : (
              draft.conditions.map((c, i) => (
                <div key={c.key} className="flex flex-col gap-2">
                  {i > 0 && (
                    <span className="self-start rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                      {draft.match === "any" ? "or" : "and"}
                    </span>
                  )}
                  <ConditionRow
                    draft={c}
                    index={i}
                    errors={errors}
                    accountOptions={accountOptions}
                    labelOptions={actionOptions.labels}
                    onChange={(patch) => updateCondition(c.key, patch)}
                    onRemove={() => update({ conditions: draft.conditions.filter((x) => x.key !== c.key) })}
                  />
                </div>
              ))
            )}
            {errors.conditions && (
              <p role="alert" className="text-xs text-destructive">
                {errors.conditions}
              </p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => update({ conditions: [...draft.conditions, newCondition("subject")] })}
                disabled={draft.conditions.length >= RULE_LIMITS.conditions}
              >
                <Plus /> Add condition
              </Button>
            </div>
          </div>
        </SettingsSection>

        {/* Actions */}
        <SettingsSection title="Actions" description="What happens when an email matches. Actions run in this order.">
          <div className="flex flex-col gap-2">
            {draft.actions.length === 0 && (
              <p
                className={cn(
                  "rounded-lg border border-dashed bg-surface/40 px-4 py-5 text-center text-[13px] text-muted-foreground",
                  errors.actions && "border-destructive/50 text-destructive"
                )}
                data-invalid={errors.actions ? true : undefined}
              >
                {errors.actions ?? "No actions yet — add at least one."}
              </p>
            )}
            {draft.actions.map((a, i) => (
              <ActionRow
                key={a.key}
                draft={a}
                index={i}
                count={draft.actions.length}
                errors={errors}
                options={actionOptions}
                onChange={(patch) => updateAction(a.key, patch)}
                onRemove={() => update({ actions: draft.actions.filter((x) => x.key !== a.key) })}
                onMove={(dir) => moveAction(i, dir)}
              />
            ))}
            {draft.actions.length > 0 && errors.actions && (
              <p role="alert" className="text-xs text-destructive">
                {errors.actions}
              </p>
            )}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={draft.actions.length >= RULE_LIMITS.actions}>
                    <Plus /> Add action
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[60dvh] w-60 overflow-y-auto">
                  {ACTION_GROUPS.map((group, gi) => (
                    <DropdownMenuGroup key={group}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                        {group}
                      </DropdownMenuLabel>
                      {ACTION_ORDER.filter((t) => ACTION_DEFS[t].group === group).map((t) => {
                        const Icon = ACTION_ICONS[t]
                        const used = presentParameterless.has(t)
                        return (
                          <DropdownMenuItem key={t} disabled={used} onSelect={() => addAction(t)}>
                            <Icon className="text-muted-foreground" />
                            {ACTION_DEFS[t].label}
                            {used && <span className="ml-auto text-xs text-muted-foreground">Added</span>}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuGroup>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SettingsSection>

        {/* Options */}
        <SettingsSection title="Options">
          <SettingsRows>
            <SettingsRow
              label="Rule is active"
              htmlFor="rule-enabled"
              description="Paused rules are kept but don't run."
            >
              <Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={(v) => update({ enabled: v })} />
            </SettingsRow>
            <SettingsRow
              label="Stop processing further rules"
              htmlFor="rule-stop"
              description="When this rule matches, rules below it are skipped for this email."
            >
              <Switch id="rule-stop" checked={draft.stopProcessing} onCheckedChange={(v) => update({ stopProcessing: v })} />
            </SettingsRow>
          </SettingsRows>
        </SettingsSection>
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={save}
        onReset={isNew ? undefined : reset}
        label={isNew ? "This rule hasn't been saved yet" : "You have unsaved changes"}
        saveLabel={isNew ? "Create rule" : "Save changes"}
      />

      {!isNew && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete rule?"
          description={
            <>
              <span className="font-medium text-foreground">{rule.name}</span> will stop running immediately. This can’t be undone.
            </>
          }
          confirmLabel="Delete rule"
          destructive
          onConfirm={async () => {
            const res = await run(() => deleteRule({ slug, id: rule.id }), { success: "Rule deleted" })
            if (res.ok) {
              setBaseline(serialize(input))
              router.push(listHref)
            }
            return res.ok
          }}
        />
      )}
    </SettingsPage>
  )
}
