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
import { useI18n } from "@/lib/i18n"
import { ruleText } from "@/components/settings/rules/rule-labels"

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
  const { locale } = useI18n()
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
        group: scope === "personal" ? (l.visibility === "private" ? ruleText("My labels", locale) : ruleText("Shared labels", locale)) : undefined,
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
        group: ruleText(r.kind === "personal" ? "Personal" : r.kind === "team" ? "Team" : "Workspace", locale),
      })),
    }),
    [options, scope, locale]
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
      toast.error(ruleText("Please fix the highlighted fields", locale))
      focusFirstError()
      return
    }
    const payload = input
    void run(() => (isNew ? createRule({ slug, scope, ...payload }) : updateRule({ slug, id: rule.id, ...payload })), {
      success: ruleText(isNew ? "Rule created" : "Rule saved", locale),
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

  const allInboxesLabel = ruleText(scope === "workspace" ? "All shared inboxes" : "All my inboxes", locale)
  const presentParameterless = new Set(draft.actions.filter((a) => PARAMETERLESS_ACTIONS.includes(a.type)).map((a) => a.type))

  return (
    <SettingsPage
      eyebrow={
        <Link href={listHref} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> {ruleText("Rules", locale)}
        </Link>
      }
      title={isNew ? ruleText("New rule", locale) : draft.name.trim() || ruleText("Untitled rule", locale)}
      quiet={ruleText(scope === "workspace" ? "· workspace" : "· personal", locale)}
      description={
        isNew
          ? scope === "workspace"
            ? ruleText("Workspace rules run on shared inboxes for the whole team.", locale)
            : ruleText("Personal rules only run on your own inboxes.", locale)
          : rule.runCount > 0
            ? (
                <>
                  {locale === "it" ? "Eseguita" : "Ran"} {pluralize(rule.runCount, locale === "it" ? "volta" : "time")}
                  {rule.lastRunAt && (
                    <>
                      {" "}
                      · {ruleText("Last run", locale).toLowerCase()} <LocalTime date={rule.lastRunAt} format="relative" titleFormat="datetime" />
                    </>
                  )}
                </>
              )
            : ruleText("This rule hasn't run yet.", locale)
      }
      actions={
        isNew ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={listHref}>{ruleText("Cancel", locale)}</Link>
          </Button>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label={ruleText("More actions", locale)}>
                <Ellipsis /> {ruleText("More", locale)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onSelect={() =>
                  void run(() => duplicateRule({ slug, id: rule.id }), {
                    success: ruleText("Rule duplicated — the copy is paused", locale),
                    onSuccess: (res) => router.push(`/w/${slug}/settings/rules/${res.id}`),
                  })
                }
              >
                <Copy /> {ruleText("Duplicate", locale)}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> {ruleText("Delete rule", locale)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <div ref={formRef} className="flex flex-col gap-6">
        {/* Basics */}
        <SettingsSection title={ruleText("Basics", locale)}>
          <div className="flex flex-col gap-4">
            <FormField label={ruleText("Name", locale)} htmlFor="rule-name" error={errors.name ? ruleText(errors.name, locale) : undefined}>
              <Input
                id="rule-name"
                value={draft.name}
                maxLength={RULE_LIMITS.name}
                placeholder={ruleText("e.g. Route billing emails to Finance", locale)}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => update({ name: e.target.value })}
                autoFocus={isNew}
              />
            </FormField>
            <FormField label={ruleText("Description", locale)} htmlFor="rule-description" optional error={errors.description ? ruleText(errors.description, locale) : undefined}>
              <Textarea
                id="rule-description"
                value={draft.description}
                maxLength={RULE_LIMITS.description}
                placeholder={ruleText("What does this rule do and why?", locale)}
                onChange={(e) => update({ description: e.target.value })}
                className="min-h-14"
              />
            </FormField>
            <div className="flex flex-col gap-1.5">
              <span id="rule-trigger" className="text-[13px] font-medium">
                {ruleText("Trigger", locale)}
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
                        <span className="block text-[13px] font-medium">{ruleText(t.label, locale)}</span>
                        <span className="block text-xs text-muted-foreground">{ruleText(t.description, locale)}</span>
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
          title={ruleText("Inboxes", locale)}
          description={
            scope === "workspace"
              ? ruleText("Choose the shared inboxes this rule runs on. Leave empty to run on all of them, including inboxes connected later.", locale)
              : ruleText("Choose which of your inboxes this rule runs on. Leave empty to run on all of them.", locale)
          }
        >
          <FormField label={ruleText("Apply to", locale)} htmlFor="rule-inboxes" error={errors.accountIds ? ruleText(errors.accountIds, locale) : undefined}>
            <MultiCombobox
              id="rule-inboxes"
              options={accountOptions}
              value={draft.accountIds}
              onChange={(v) => update({ accountIds: v })}
              placeholder={allInboxesLabel}
              searchPlaceholder={ruleText("Search inboxes…", locale)}
              emptyText={ruleText(scope === "workspace" ? "No shared inboxes yet." : "You haven't connected an inbox yet.", locale)}
            />
          </FormField>
        </SettingsSection>

        {/* Conditions */}
        <SettingsSection
          title={ruleText("Conditions", locale)}
          description={ruleText("Narrow down which emails the rule applies to.", locale)}
          action={
            draft.conditions.length > 1 ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span>{ruleText("Match", locale)}</span>
                <Select value={draft.match} onValueChange={(v) => update({ match: v as RuleDraft["match"] })}>
                  <SelectTrigger size="sm" className="w-20" aria-label={ruleText("Condition matching", locale)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{ruleText("all", locale)}</SelectItem>
                    <SelectItem value="any">{ruleText("any", locale)}</SelectItem>
                  </SelectContent>
                </Select>
                <span>{ruleText("conditions", locale)}</span>
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-2">
            {draft.conditions.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-surface/40 px-4 py-5 text-center text-[13px] text-muted-foreground">
                {ruleText("No conditions — this rule runs on every ", locale)}{ruleText(draft.trigger === "outgoing" ? "outgoing" : "incoming", locale)} {ruleText("email.", locale)}
              </p>
            ) : (
              draft.conditions.map((c, i) => (
                <div key={c.key} className="flex flex-col gap-2">
                  {i > 0 && (
                    <span className="self-start rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                      {ruleText(draft.match === "any" ? "or" : "and", locale)}
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
                {ruleText(errors.conditions, locale)}
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
                <Plus /> {ruleText("Add condition", locale)}
              </Button>
            </div>
          </div>
        </SettingsSection>

        {/* Actions */}
        <SettingsSection title={ruleText("Actions", locale)} description={ruleText("What happens when an email matches. Actions run in this order.", locale)}>
          <div className="flex flex-col gap-2">
            {draft.actions.length === 0 && (
              <p
                className={cn(
                  "rounded-lg border border-dashed bg-surface/40 px-4 py-5 text-center text-[13px] text-muted-foreground",
                  errors.actions && "border-destructive/50 text-destructive"
                )}
                data-invalid={errors.actions ? true : undefined}
              >
                {errors.actions ? ruleText(errors.actions, locale) : ruleText("No actions yet — add at least one.", locale)}
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
                {ruleText(errors.actions, locale)}
              </p>
            )}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={draft.actions.length >= RULE_LIMITS.actions}>
                    <Plus /> {ruleText("Add action", locale)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[60dvh] w-60 overflow-y-auto">
                  {ACTION_GROUPS.map((group, gi) => (
                    <DropdownMenuGroup key={group}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                        {ruleText(group, locale)}
                      </DropdownMenuLabel>
                      {ACTION_ORDER.filter((t) => ACTION_DEFS[t].group === group).map((t) => {
                        const Icon = ACTION_ICONS[t]
                        const used = presentParameterless.has(t)
                        return (
                          <DropdownMenuItem key={t} disabled={used} onSelect={() => addAction(t)}>
                            <Icon className="text-muted-foreground" />
                            {ruleText(ACTION_DEFS[t].label, locale)}
                            {used && <span className="ml-auto text-xs text-muted-foreground">{ruleText("Added", locale)}</span>}
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
        <SettingsSection title={ruleText("Options", locale)}>
          <SettingsRows>
            <SettingsRow
              label={ruleText("Rule is active", locale)}
              htmlFor="rule-enabled"
              description={ruleText("Paused rules are kept but don't run.", locale)}
            >
              <Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={(v) => update({ enabled: v })} />
            </SettingsRow>
            <SettingsRow
              label={ruleText("Stop processing further rules", locale)}
              htmlFor="rule-stop"
              description={ruleText("When this rule matches, rules below it are skipped for this email.", locale)}
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
        label={ruleText(isNew ? "This rule hasn't been saved yet" : "You have unsaved changes", locale)}
        saveLabel={ruleText(isNew ? "Create rule" : "Save changes", locale)}
      />

      {!isNew && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={ruleText("Delete rule?", locale)}
          description={
            <>
              <span className="font-medium text-foreground">{rule.name}</span> {ruleText("will stop running immediately. This can’t be undone.", locale)}
            </>
          }
          confirmLabel={ruleText("Delete rule", locale)}
          destructive
          onConfirm={async () => {
            const res = await run(() => deleteRule({ slug, id: rule.id }), { success: ruleText("Rule deleted", locale) })
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
