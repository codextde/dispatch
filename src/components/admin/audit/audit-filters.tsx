"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FilterSelect, SearchParamInput } from "@/components/admin/client"

const FILTER_PARAMS = ["org", "actor", "action", "from", "to", "actorId", "targetType", "targetId", "page"]

function useUpdateParams() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!("page" in updates)) next.delete("page")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
}

/** Free-text action prefix with suggestions (prefixes + actions seen so far). */
function ActionPrefixInput({ suggestions }: { suggestions: string[] }) {
  const params = useSearchParams()
  const update = useUpdateParams()
  const [value, setValue] = useState(params.get("action") ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return (
    <div className="relative w-full sm:w-60">
      <Input
        list="audit-action-suggestions"
        value={value}
        placeholder="Action prefix, e.g. admin."
        aria-label="Filter by action prefix"
        spellCheck={false}
        autoComplete="off"
        className="bg-card pr-8 font-mono text-[13px] placeholder:font-sans"
        onChange={(e) => {
          const v = e.target.value
          setValue(v)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => update({ action: v.trim() || null }), 300)
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear action filter"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setValue("")
            update({ action: null })
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
      <datalist id="audit-action-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}

function DateInput({ param, label }: { param: "from" | "to"; label: string }) {
  const params = useSearchParams()
  const update = useUpdateParams()
  return (
    <label className="flex w-full items-center gap-2 sm:w-auto">
      <span className="w-10 shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground sm:w-auto">
        {label}
      </span>
      <Input
        type="date"
        value={params.get(param) ?? ""}
        max={param === "from" ? (params.get("to") ?? undefined) : undefined}
        min={param === "to" ? (params.get("from") ?? undefined) : undefined}
        onChange={(e) => update({ [param]: e.target.value || null })}
        className="w-full bg-card sm:w-[150px]"
      />
    </label>
  )
}

export function AuditFilters({ workspaces, suggestions }: { workspaces: { id: string; name: string }[]; suggestions: string[] }) {
  const params = useSearchParams()
  const update = useUpdateParams()
  // Remount the debounced text inputs after "Clear filters" so their local state resets
  const [resetKey, setResetKey] = useState(0)
  const active = FILTER_PARAMS.some((p) => p !== "page" && params.get(p))
  const scoped = [
    params.get("actorId") && {
      key: "actorId",
      label: "Actor",
      value: params.get("actorId")!,
    },
    params.get("targetType") && {
      key: "targetType",
      label: "Target type",
      value: params.get("targetType")!,
    },
    params.get("targetId") && {
      key: "targetId",
      label: "Target",
      value: params.get("targetId")!,
    },
  ].filter(Boolean) as { key: string; label: string; value: string }[]

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchParamInput key={`actor-${resetKey}`} param="actor" placeholder="Actor email…" className="sm:w-56" />
        <ActionPrefixInput key={`action-${resetKey}`} suggestions={suggestions} />
        <FilterSelect
          param="org"
          label="Workspace"
          className="sm:w-48"
          options={[
            { value: "instance", label: "Instance-level only" },
            ...workspaces.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateInput param="from" label="From" />
          <DateInput param="to" label="To" />
        </div>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start sm:self-auto"
            onClick={() => {
              update(Object.fromEntries(FILTER_PARAMS.map((p) => [p, null])))
              setResetKey((k) => k + 1)
            }}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>
      {scoped.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scoped.map((s) => (
            <span
              key={s.key}
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-surface pr-1 pl-2 text-xs"
            >
              <span className="text-muted-foreground">{s.label}:</span>
              <code className="max-w-48 truncate font-mono text-[11.5px]">{s.value}</code>
              <button
                type="button"
                aria-label={`Remove ${s.label} filter`}
                className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => update({ [s.key]: null })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
