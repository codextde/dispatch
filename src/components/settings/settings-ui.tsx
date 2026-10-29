"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import { localizeDictionaryText, useI18n } from "@/lib/i18n"

const SETTINGS_LABEL_KEYS = {
  Personal: "personal",
  Workspace: "workspace",
  Productivity: "productivity",
  Administration: "administration",
  Profile: "profile",
  Preferences: "preferences",
  Notifications: "notifications",
  Security: "security",
  "Security & devices": "security",
  "My inboxes": "myInboxes",
  General: "general",
  Members: "members",
  Teams: "teams",
  "Roles & permissions": "roles",
  Inboxes: "inboxes",
  "Shared inboxes": "inboxes",
  Labels: "labels",
  "Canned responses": "responses",
  Signatures: "signatures",
  Rules: "rules",
  "API & webhooks": "integrations",
  Billing: "billing",
  "Audit log": "auditLog",
  Analytics: "analytics",
} as const

type SettingsLabelKey = (typeof SETTINGS_LABEL_KEYS)[keyof typeof SETTINGS_LABEL_KEYS]

function localizeSettingsLabel(value: React.ReactNode, locale: string, t: (key: SettingsLabelKey) => string) {
  if (locale !== "it" || typeof value !== "string") return value
  const key = SETTINGS_LABEL_KEYS[value as keyof typeof SETTINGS_LABEL_KEYS]
  return key ? t(key) : localizeDictionaryText(value, locale as "en" | "it")
}

/**
 * Building blocks for settings pages. Page pattern:
 *
 *   <SettingsPage title="Labels" quiet="organize conversations" description="…" actions={<Button/>}>
 *     <SettingsSection title="…" description="…" footer={…}>
 *       <SettingsRow label="…" description="…">{control}</SettingsRow>
 *     </SettingsSection>
 *   </SettingsPage>
 */

export function MicroLabel({ className, children, ...props }: React.ComponentProps<"span">) {
  const { locale } = useI18n()
  return (
    <span
      className={cn("font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase", className)}
      {...props}
    >
      {localizeDictionaryText(children, locale)}
    </span>
  )
}

export function SettingsPage({
  eyebrow,
  title,
  quiet,
  description,
  actions,
  children,
  className,
  width = "default",
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** Muted second half of the two-tone heading */
  quiet?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  width?: "default" | "wide" | "full"
}) {
  const { locale, t } = useI18n()
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pt-6 pb-24 sm:px-6 md:pt-10 lg:px-10",
        width === "default" && "max-w-3xl",
        width === "wide" && "max-w-5xl",
        width === "full" && "max-w-7xl",
        className
      )}
    >
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <MicroLabel className="mb-2 block">{localizeSettingsLabel(eyebrow, locale, t)}</MicroLabel>}
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px] sm:leading-tight">
            {localizeSettingsLabel(title, locale, t)}
            {quiet && <span className="text-quiet"> {localizeSettingsLabel(quiet, locale, t)}</span>}
          </h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-pretty text-muted-foreground">{localizeSettingsLabel(description, locale, t)}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  )
}

export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
  footer,
  tone = "default",
  className,
  bodyClassName,
  flush = false,
}: {
  id?: string
  title?: React.ReactNode
  description?: React.ReactNode
  /** Rendered on the right of the section header */
  action?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  tone?: "default" | "danger"
  className?: string
  bodyClassName?: string
  /** Remove body padding (for tables and lists that bleed to the edges) */
  flush?: boolean
}) {
  const { locale, t } = useI18n()
  return (
    <section
      id={id}
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]",
        tone === "danger" && "border-destructive/30",
        className
      )}
    >
      {(title || action) && (
        <div className={cn("flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between", !children && "pb-5")}>
          <div className="min-w-0">
            {title && (
                <h2 className={cn("text-[15px] font-semibold tracking-tight", tone === "danger" && "text-destructive")}>{localizeSettingsLabel(title, locale, t)}</h2>
            )}
            {description && <p className="mt-1 text-[13px] text-pretty text-muted-foreground">{localizeSettingsLabel(description, locale, t)}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children && <div className={cn(flush ? "mt-4" : "px-5 py-5", !title && !action && flush && "mt-0", bodyClassName)}>{children}</div>}
      {footer && (
        <div
          className={cn(
            "flex flex-col gap-3 border-t bg-surface/60 px-5 py-3 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
            tone === "danger" && "border-destructive/20 bg-destructive/[0.03]"
          )}
        >
          {footer}
        </div>
      )}
    </section>
  )
}

/** Footer layout helper: hint on the left, actions on the right. */
export function SectionFooter({ hint, children }: { hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <div className="min-w-0 text-pretty">{hint}</div>
      <div className="flex shrink-0 items-center justify-end gap-2">{children}</div>
    </>
  )
}

/** Label/description on the left, control on the right (stacks on mobile). */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className,
  align = "center",
}: {
  label: React.ReactNode
  description?: React.ReactNode
  htmlFor?: string
  children?: React.ReactNode
  className?: string
  align?: "center" | "start"
}) {
  const { locale, t } = useI18n()
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-8",
        align === "center" ? "sm:items-center" : "sm:items-start",
        className
      )}
    >
      <div className="min-w-0 sm:max-w-[60%]">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {localizeSettingsLabel(label, locale, t)}
          </label>
        ) : (
          <div className="text-sm font-medium">{localizeSettingsLabel(label, locale, t)}</div>
        )}
        {description && <div className="mt-0.5 text-[13px] text-pretty text-muted-foreground">{localizeSettingsLabel(description, locale, t)}</div>}
      </div>
      {children !== undefined && <div className="flex shrink-0 items-center gap-2 sm:justify-end">{children}</div>}
    </div>
  )
}

/** Rows separated by hairlines. */
export function SettingsRows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border", className)}>{children}</div>
}

/** Vertical form field: label, control, description / inline error. */
export function FormField({
  label,
  htmlFor,
  description,
  error,
  optional,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor?: string
  description?: React.ReactNode
  error?: string
  optional?: boolean
  children: React.ReactNode
  className?: string
}) {
  const { t, locale } = useI18n()
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-invalid={error ? true : undefined}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[13px] font-medium">
        {localizeDictionaryText(label, locale)}
        {optional && <span className="text-xs font-normal text-muted-foreground">{t("optional")}</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {localizeDictionaryText(error, locale)}
        </p>
      ) : description ? (
        <p className="text-xs text-pretty text-muted-foreground">{localizeDictionaryText(description, locale)}</p>
      ) : null}
    </div>
  )
}

/**
 * Floating save bar shown while a form has unsaved changes.
 * Place at the end of the page content.
 */
export function SaveBar({
  dirty,
  pending,
  onSave,
  onReset,
  label,
  saveLabel,
}: {
  dirty: boolean
  pending?: boolean
  onSave: () => void
  onReset?: () => void
  label?: string
  saveLabel?: string
}) {
  const { t } = useI18n()
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none sticky bottom-4 z-30 flex justify-center pb-[env(safe-area-inset-bottom)]"
        >
          <div
            role="region"
            aria-label={label ?? t("unsavedChanges")}
            className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border bg-popover/95 py-2 pr-2 pl-4 shadow-lg ring-1 ring-black/5 backdrop-blur supports-backdrop-filter:bg-popover/80"
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
              <span className="size-1.5 shrink-0 animate-pulse-dot rounded-full bg-warning" aria-hidden />
              <span className="truncate">{label ?? t("unsavedChanges")}</span>
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {onReset && (
                <Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>
                  {t("reset")}
                </Button>
              )}
              <Button size="sm" onClick={onSave} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {saveLabel ?? t("saveChanges")}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const { locale } = useI18n()
  return (
    <Empty className={cn("border border-dashed bg-surface/40 py-10", className)}>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{localizeDictionaryText(title, locale)}</EmptyTitle>
        {description && <EmptyDescription>{localizeDictionaryText(description, locale)}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}

/** Small colored dot (labels, teams, inboxes). */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15", className)}
      style={{ backgroundColor: color }}
    />
  )
}

/** Status pill with a leading dot. */
export function StatusBadge({
  tone,
  children,
  className,
  pulse,
}: {
  tone: "success" | "warning" | "danger" | "neutral" | "info"
  children: React.ReactNode
  className?: string
  pulse?: boolean
}) {
  const { locale } = useI18n()
  const tones = {
    success: "bg-success/10 text-[color-mix(in_oklch,var(--success),var(--foreground)_35%)] ring-success/25",
    warning: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),var(--foreground)_50%)] ring-warning/30",
    danger: "bg-destructive/10 text-destructive ring-destructive/25",
    info: "bg-info/10 text-[color-mix(in_oklch,var(--info),var(--foreground)_30%)] ring-info/25",
    neutral: "bg-muted text-muted-foreground ring-border",
  }
  const dots = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    info: "bg-info",
    neutral: "bg-subtle",
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", dots[tone], pulse && "animate-pulse-dot")} aria-hidden />
      {localizeDictionaryText(children, locale)}
    </span>
  )
}

/** Inline keyboard-ish code chip. */
export function Code({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className={cn("rounded-md border bg-surface px-1.5 py-0.5 font-mono text-[12px] text-foreground", className)}
      {...props}
    />
  )
}
