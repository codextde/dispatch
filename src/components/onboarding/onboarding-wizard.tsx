"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Inbox,
  Mail,
  PlugZap,
  Send,
  Sparkles,
  UserCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { TagInput, EMAIL_RE } from "@/components/admin/tag-input"
import { CopyButton } from "@/components/admin/client"
import { StepProgress, type RailStep } from "@/components/onboarding/step-rail"
import { WorkspaceFields, type WorkspaceFieldsValue } from "@/components/onboarding/workspace-fields"
import {
  checkSlugAction,
  createWorkspaceAction,
  finishOnboardingAction,
  inviteTeammatesAction,
  type InviteResult,
} from "@/app/onboarding/actions"
import { cn } from "@/lib/utils"

const STEPS: RailStep[] = [
  { id: "workspace", label: "Workspace" },
  { id: "invite", label: "Invite your team" },
  { id: "start", label: "Get started" },
]

export type OnboardingWizardProps = {
  initialStep: 0 | 1 | 2
  workspace: { name: string; slug: string } | null
  needsName: boolean
  canInvite: boolean
  appUrl: string
  emailConfigured: boolean
  /** e.g. "14-day free trial, then $50/month" (SaaS mode with billing) */
  billingNote: string | null
  cancelHref: string | null
}

export function OnboardingWizard(props: OnboardingWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<number>(props.initialStep)
  const [workspace, setWorkspace] = useState(props.workspace)
  const [form, setForm] = useState<WorkspaceFieldsValue>({ name: "", slug: "", slugEdited: false })
  const [yourName, setYourName] = useState("")
  const [slugState, setSlugState] = useState<"idle" | "checking" | "available" | "unavailable">("idle")
  const [emails, setEmails] = useState<string[]>([])
  const [results, setResults] = useState<InviteResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [finishing, setFinishing] = useState<"connect" | "demo" | "inbox" | null>(null)
  const appHost = props.appUrl.replace(/^https?:\/\//, "")

  function createWorkspace() {
    setError(null)
    startTransition(async () => {
      const res = await createWorkspaceAction({
        name: form.name,
        slug: form.slug,
        yourName: props.needsName ? yourName : undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setWorkspace(res.data)
      setStep(props.canInvite ? 1 : 2)
      router.replace(`/onboarding?w=${encodeURIComponent(res.data.slug)}`, { scroll: false })
    })
  }

  function sendInvites() {
    if (!workspace) return
    setError(null)
    startTransition(async () => {
      const res = await inviteTeammatesAction({ slug: workspace.slug, emails })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResults(res.data)
      setEmails([])
      const sent = res.data.filter((r) => r.status === "invited").length
      if (sent) toast.success(`${sent} invitation${sent === 1 ? "" : "s"} created`)
    })
  }

  function finish(kind: "connect" | "demo" | "inbox") {
    if (!workspace) return
    setFinishing(kind)
    startTransition(async () => {
      const res = await finishOnboardingAction({ slug: workspace.slug, demo: kind === "demo" })
      if (!res.ok) {
        setFinishing(null)
        toast.error(res.error)
        return
      }
      if (res.data.demoError) toast.error(`Demo data couldn't be loaded: ${res.data.demoError}`)
      const base = `/w/${workspace.slug}`
      window.location.assign(kind === "connect" ? `${base}/settings/inboxes?connect=1` : `${base}/inbox`)
    })
  }

  return (
    <div>
      <div className="mb-8">
        <StepProgress steps={STEPS} current={step} />
      </div>

      {step === 0 && (
        <section>
          <Heading
            eyebrow="New workspace"
            title="Create your workspace."
            quiet="It takes a minute."
            description="A workspace holds your team's shared inboxes, conversations, labels and rules."
          />
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              createWorkspace()
            }}
          >
            {props.needsName && (
              <div className="grid gap-1.5">
                <Label htmlFor="your-name" className="text-[13px]">
                  Your name
                </Label>
                <Input
                  id="your-name"
                  autoComplete="name"
                  value={yourName}
                  maxLength={80}
                  onChange={(e) => setYourName(e.target.value)}
                  placeholder="How your teammates see you"
                  className="h-10 bg-card"
                  autoFocus
                />
              </div>
            )}
            <WorkspaceFields
              value={form}
              onChange={setForm}
              check={checkSlugAction}
              appHost={appHost}
              onStatus={setSlugState}
              autoFocus={!props.needsName}
              error={error}
            />
            {props.billingNote && (
              <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-[13px]">
                <Sparkles className="size-4 shrink-0" />
                {props.billingNote}. No credit card needed to start.
              </div>
            )}
            <Footer>
              {props.cancelHref ? (
                <Button asChild variant="ghost" size="lg" className="h-10 rounded-md">
                  <a href={props.cancelHref}>Cancel</a>
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                size="lg"
                className="h-10 rounded-md px-5"
                disabled={pending || !form.name.trim() || slugState === "unavailable" || slugState === "checking"}
              >
                {pending && <Spinner />} Create workspace {!pending && <ArrowRight />}
              </Button>
            </Footer>
          </form>
        </section>
      )}

      {step === 1 && workspace && (
        <section>
          <Heading
            eyebrow={workspace.name}
            title="Invite your team."
            quiet="Email is better together."
            description="Teammates join as members. You can change roles and invite more people later in Settings → Members."
          />
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (emails.length) sendInvites()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="invite-emails" className="text-[13px]">
                Email addresses
              </Label>
              <TagInput
                id="invite-emails"
                value={emails}
                onChange={setEmails}
                placeholder="maya@company.com, leo@company.com"
                normalize={(v) => v.trim().toLowerCase()}
                validate={(v) => (EMAIL_RE.test(v) ? null : `“${v}” is not a valid email address`)}
                className="min-h-10 bg-card"
              />
              <p className="text-xs text-muted-foreground">Separate addresses with commas, spaces or Enter.</p>
            </div>
            {error && (
              <p role="alert" className="text-[13px] text-destructive">
                {error}
              </p>
            )}
            {!props.emailConfigured && (
              <p className="flex gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-muted-foreground">
                <Mail className="mt-px size-4 shrink-0" />
                Email delivery isn&apos;t configured on this instance yet — you&apos;ll get invitation links to share yourself.
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant={results ? "outline" : "default"} className="rounded-md" disabled={pending || !emails.length}>
                {pending ? <Spinner /> : <Send />} Send invitations
              </Button>
            </div>
          </form>

          {results && results.length > 0 && (
            <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {results.map((r) => (
                <li key={r.email} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-sm">
                  {r.status === "invited" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : r.reason?.startsWith("Already") ? (
                    <UserCheck className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <CircleAlert className="size-4 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{r.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.status === "invited" ? (r.delivered ? "Invitation sent" : "Share the link") : r.reason}
                  </span>
                  {r.url && (
                    <div className="flex w-full min-w-0 items-center gap-1 rounded-md border border-border bg-surface py-0.5 pr-0.5 pl-2.5">
                      <code className="min-w-0 flex-1 truncate font-mono text-[12px]" title={r.url}>
                        {r.url}
                      </code>
                      <CopyButton value={r.url} label={`Copy invitation link for ${r.email}`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Footer>
            <span className="text-[13px] text-muted-foreground">{results ? "" : "You can skip this for now."}</span>
            <Button size="lg" className="h-10 rounded-md px-5" onClick={() => setStep(2)} disabled={pending}>
              {results ? "Continue" : "Skip for now"} <ArrowRight />
            </Button>
          </Footer>
        </section>
      )}

      {step === 2 && workspace && (
        <section>
          <Heading
            eyebrow={workspace.name}
            title="You're all set."
            quiet="How do you want to start?"
            description="Connect a shared mailbox like support@ to start collaborating — or look around with sample data first."
          />
          <div className="grid gap-2.5">
            <StartCard
              icon={PlugZap}
              title="Connect an inbox"
              description="Gmail, Microsoft 365 / Outlook or any IMAP mailbox. Takes about a minute."
              recommended
              loading={finishing === "connect"}
              disabled={pending}
              onClick={() => finish("connect")}
            />
            <StartCard
              icon={Sparkles}
              title="Explore with demo data"
              description="Sample conversations, teammates, tasks and rules. Remove it anytime."
              loading={finishing === "demo"}
              disabled={pending}
              onClick={() => finish("demo")}
            />
            <StartCard
              icon={Inbox}
              title="Go to the inbox"
              description="Start with an empty workspace and set things up yourself."
              loading={finishing === "inbox"}
              disabled={pending}
              onClick={() => finish("inbox")}
            />
          </div>
        </section>
      )}
    </div>
  )
}

function Heading({ eyebrow, title, quiet, description }: { eyebrow: string; title: string; quiet?: string; description?: string }) {
  return (
    <div className="mb-7">
      <div className="mb-3 truncate font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{eyebrow}</div>
      <h1 className="text-[28px] leading-[1.15] font-semibold tracking-tight text-balance">
        {title}
        {quiet && <span className="text-quiet"> {quiet}</span>}
      </h1>
      {description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
    </div>
  )
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">{children}</div>
}

function StartCard({
  icon: Icon,
  title,
  description,
  recommended,
  loading,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  recommended?: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left outline-none transition-colors",
        "hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
        recommended && "border-foreground/20",
        disabled && !loading && "opacity-60"
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface",
          recommended && "border-transparent bg-foreground text-background"
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          {title}
          {recommended && (
            <span className="rounded-sm bg-brand-soft px-1.5 py-px font-mono text-[10px] uppercase tracking-wider">Recommended</span>
          )}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>
      </span>
      {loading ? (
        <Spinner className="text-muted-foreground" />
      ) : (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  )
}
