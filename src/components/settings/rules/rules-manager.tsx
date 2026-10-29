"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Copy, Ellipsis, GripVertical, Inbox, Loader2, Pencil, Plus, Trash2, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { EmptyState, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { pluralize } from "@/components/settings/format"
import { LocalTime } from "@/components/app/local-time"
import { summarizeRule, type RuleLookup } from "@/components/settings/rules/summary"
import { TEMPLATE_ICONS } from "@/components/settings/rules/rule-icons"
import type { RuleScope } from "@/components/settings/rules/definitions"
import { createRuleFromTemplate, deleteRule, duplicateRule, reorderRules, toggleRule } from "@/server/workspace/actions/rules"
import type { RuleListItem } from "@/server/workspace/queries/rules"
import type { RuleTemplateInfo } from "@/server/workspace/services/rules"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { ruleText } from "@/components/settings/rules/rule-labels"

export type RuleScopeData = { scope: RuleScope; rules: RuleListItem[]; templates: RuleTemplateInfo[] }

const SCOPE_COPY: Record<RuleScope, { tab: string; title: string; description: string; allInboxes: string }> = {
  workspace: {
    tab: "Workspace rules",
    title: "Workspace rules",
    description: "Run on shared inboxes for everyone, from top to bottom. Drag to change the order.",
    allInboxes: "All shared inboxes",
  },
  personal: {
    tab: "My rules",
    title: "My rules",
    description: "Only run on your personal inboxes. Drag to change the order.",
    allInboxes: "All my inboxes",
  },
}

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function RulesManager({
  slug,
  scopes,
  lookup,
  defaultScope,
}: {
  slug: string
  scopes: RuleScopeData[]
  lookup: RuleLookup
  defaultScope: RuleScope
}) {
  const { locale } = useI18n()
  const [tab, setTab] = useState<RuleScope>(scopes.some((s) => s.scope === defaultScope) ? defaultScope : scopes[0]!.scope)

  if (scopes.length === 1) {
    return <ScopePanel slug={slug} data={scopes[0]!} lookup={lookup} />
  }
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as RuleScope)} className="gap-5">
      <TabsList variant="line" className="h-9 border-b border-border w-full justify-start rounded-none px-0">
        {scopes.map((s) => (
          <TabsTrigger key={s.scope} value={s.scope} className="flex-none px-2">
            {ruleText(SCOPE_COPY[s.scope].tab, locale)}
            <span className="rounded-full bg-muted px-1.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {s.rules.length}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {scopes.map((s) => (
        <TabsContent key={s.scope} value={s.scope} className="flex flex-col gap-6">
          <ScopePanel slug={slug} data={s} lookup={lookup} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function ScopePanel({ slug, data, lookup }: { slug: string; data: RuleScopeData; lookup: RuleLookup }) {
  const { locale } = useI18n()
  const router = useRouter()
  const copy = SCOPE_COPY[data.scope]
  const newHref = `/w/${slug}/settings/rules/new?scope=${data.scope}`

  // Local copy for optimistic toggles/reordering; re-synced when the server re-renders.
  const [items, setItems] = useState(data.rules)
  const [synced, setSynced] = useState(data.rules)
  if (data.rules !== synced) {
    setSynced(data.rules)
    setItems(data.rules)
  }

  const [deleting, setDeleting] = useState<RuleListItem | null>(null)
  const { run } = useServerAction()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = items.findIndex((r) => r.id === active.id)
    const to = items.findIndex((r) => r.id === over.id)
    if (from < 0 || to < 0) return
    const previous = items
    const next = arrayMove(items, from, to)
    setItems(next)
    void run(() => reorderRules({ slug, scope: data.scope, ids: next.map((r) => r.id) }), {
      onError: () => setItems(previous),
    })
  }

  const onToggle = (rule: RuleListItem, enabled: boolean) => {
    setItems((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled } : r)))
    void run(() => toggleRule({ slug, id: rule.id, enabled }), {
      success: locale === "it" ? `Regola “${rule.name}” ${enabled ? "attivata" : "messa in pausa"}` : `“${rule.name}” ${enabled ? "enabled" : "paused"}`,
      onError: () => setItems((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled: !enabled } : r))),
    })
  }

  const onDuplicate = (rule: RuleListItem) =>
    run(() => duplicateRule({ slug, id: rule.id }), {
      onSuccess: (res) => router.push(`/w/${slug}/settings/rules/${res.id}`),
      success: ruleText("Rule duplicated — the copy is paused until you enable it", locale),
    })

  return (
    <>
      <SettingsSection
        title={ruleText(copy.title, locale)}
        description={ruleText(copy.description, locale)}
        action={
          <Button asChild size="sm">
            <Link href={newHref}>
              <Plus /> {ruleText("New rule", locale)}
            </Link>
          </Button>
        }
        flush={items.length > 0}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Workflow />}
            title={ruleText("No rules yet", locale)}
            description={ruleText("Rules label, assign, reply to and route emails automatically. Start from scratch or pick a template below.", locale)}
          >
            <Button asChild size="sm" variant="outline">
              <Link href={newHref}>
                <Plus /> {ruleText("Create a rule", locale)}
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DndContext
            id={`rules-${data.scope}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[verticalOnly]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={items.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ol className="divide-y border-t" aria-label={copy.title}>
                {items.map((rule, index) => (
                  <SortableRuleRow
                    key={rule.id}
                    slug={slug}
                    index={index}
                    rule={rule}
                    scope={data.scope}
                    lookup={lookup}
                    onToggle={onToggle}
                    onDuplicate={onDuplicate}
                    onDelete={setDeleting}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </SettingsSection>

      <TemplateGallery slug={slug} scope={data.scope} templates={data.templates} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={ruleText("Delete rule?", locale)}
        description={
          deleting ? (
            <>
              <span className="font-medium text-foreground">{deleting.name}</span> {ruleText("will stop running immediately. This can’t be undone.", locale)}
            </>
          ) : null
        }
        confirmLabel={ruleText("Delete rule", locale)}
        destructive
        onConfirm={async () => {
          if (!deleting) return
      const res = await run(() => deleteRule({ slug, id: deleting.id }), { success: ruleText("Rule deleted", locale) })
          if (res.ok) setItems((list) => list.filter((r) => r.id !== deleting.id))
          return res.ok
        }}
      />
    </>
  )
}

function SortableRuleRow({
  slug,
  index,
  rule,
  scope,
  lookup,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  slug: string
  index: number
  rule: RuleListItem
  scope: RuleScope
  lookup: RuleLookup
  onToggle: (rule: RuleListItem, enabled: boolean) => void
  onDuplicate: (rule: RuleListItem) => void
  onDelete: (rule: RuleListItem) => void
}) {
  const { locale } = useI18n()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })
  const summary = useMemo(() => summarizeRule(rule, lookup, locale), [rule, lookup, locale])
  const href = `/w/${slug}/settings/rules/${rule.id}`
  const inboxNames = rule.accountIds.map((id) => lookup.accounts[id] ?? "Removed inbox")
  const inboxLabel =
    inboxNames.length === 0
      ? SCOPE_COPY[scope].allInboxes
      : inboxNames.length <= 2
        ? inboxNames.join(", ")
        : `${inboxNames.slice(0, 2).join(", ")} +${inboxNames.length - 2}`

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex items-start gap-2 bg-card px-3 py-3.5 transition-colors hover:bg-surface/50 sm:gap-3 sm:px-4",
        isDragging && "z-10 rounded-lg shadow-lg ring-1 ring-border"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`${ruleText("Reorder", locale)} ${rule.name}`}
        className="mt-0.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="mt-1 hidden w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:block">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className={cn("min-w-0 flex-1", !rule.enabled && "opacity-60")}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={href}
            className="truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {rule.name}
          </Link>
          <span className="inline-flex h-5 items-center rounded-md border bg-surface px-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
            {ruleText(rule.trigger === "outgoing" ? "Outgoing" : "Incoming", locale)}
          </span>
          {rule.stopProcessing && (
            <span className="inline-flex h-5 items-center rounded-md border border-warning/40 bg-warning/10 px-1.5 font-mono text-[10.5px] tracking-wide text-[color-mix(in_oklch,var(--warning),var(--foreground)_50%)] uppercase">
              {ruleText("Stops", locale)}
            </span>
          )}
          {!rule.enabled && (
            <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[11px] text-muted-foreground">{ruleText("Paused", locale)}</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {summary.conditions.length === 0 ? (
            <>{summary.when}</>
          ) : (
            <>
              {ruleText("If ", locale)}{summary.conditions.map((c, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-subtle"> {summary.joiner} </span>}
                  <span className="text-foreground/80">{c}</span>
                </span>
              ))}
            </>
          )}
          <span className="px-1 text-subtle" aria-hidden>
            →
          </span>
          <span className="sr-only">{ruleText("then ", locale)}</span>
          <span className="text-foreground/80">{summary.actions.map((action) => ruleText(action, locale)).join(", ") || ruleText("no actions", locale)}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <Inbox className="size-3.5 shrink-0" />
            <span className="truncate">{inboxLabel}</span>
          </span>
          <span className="tabular-nums">{rule.runCount > 0 ? `${locale === "it" ? "Eseguita" : "Ran"} ${pluralize(rule.runCount, locale === "it" ? "volta" : "time")}` : ruleText("Never ran", locale)}</span>
          {rule.lastRunAt && (
            <span>
              {ruleText("Last run", locale)} <LocalTime date={rule.lastRunAt} format="relative" titleFormat="datetime" />
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(v) => onToggle(rule, v)}
          aria-label={`${ruleText(rule.enabled ? "Pause" : "Enable", locale)} ${rule.name}`}
          className="mt-1"
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${ruleText("Actions for", locale)} ${rule.name}`} className="text-muted-foreground">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Pencil /> {ruleText("Edit", locale)}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(rule)}>
              <Copy /> {ruleText("Duplicate", locale)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(rule)}>
              <Trash2 /> {ruleText("Delete", locale)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function TemplateGallery({ slug, scope, templates }: { slug: string; scope: RuleScope; templates: RuleTemplateInfo[] }) {
  const { locale } = useI18n()
  const router = useRouter()
  const { run } = useServerAction()
  const [creating, setCreating] = useState<string | null>(null)
  if (!templates.length) return null

  const use = async (t: RuleTemplateInfo) => {
    setCreating(t.id)
    const res = await run(() => createRuleFromTemplate({ slug, scope, templateId: t.id }), {
      success: (d) =>
        d.createdLabels.length
          ? locale === "it"
            ? `Regola creata. Aggiunta etichetta: ${d.createdLabels.map((l) => `“${l}”`).join(", ")}`
            : `Rule created — added the ${d.createdLabels.map((l) => `“${l}”`).join(", ")} label`
          : ruleText("Rule created from template", locale),
      onSuccess: (d) => router.push(`/w/${slug}/settings/rules/${d.id}`),
    })
    if (!res.ok) setCreating(null)
  }

  return (
    <SettingsSection title={ruleText("Start from a template", locale)} description={ruleText("One click creates the rule — you can review and tweak it afterwards.", locale)}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const Icon = TEMPLATE_ICONS[t.id] ?? Workflow
          const busy = creating === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                disabled={!t.available || creating !== null}
                onClick={() => void use(t)}
                aria-describedby={t.hint ? `tpl-hint-${scope}-${t.id}` : undefined}
                className="group flex h-full w-full items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-background"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md border bg-surface text-muted-foreground transition-colors group-enabled:group-hover:border-brand/30 group-enabled:group-hover:text-foreground",
                    !t.available && "opacity-50"
                  )}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[13px] font-medium", !t.available && "text-muted-foreground")}>{ruleText(t.name, locale)}</span>
                  <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{ruleText(t.description, locale)}</span>
                  {t.hint && (
                    <span id={`tpl-hint-${scope}-${t.id}`} className="mt-1.5 block text-xs text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
                      {ruleText(t.hint, locale)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </SettingsSection>
  )
}
