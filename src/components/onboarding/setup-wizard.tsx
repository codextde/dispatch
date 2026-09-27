"use client"

import { useState, useTransition } from "react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Building2,
  CheckCircle2,
  Globe,
  Inbox,
  KeyRound,
  Lock,
  MessagesSquare,
  Sparkles,
  TriangleAlert,
  Users,
  Workflow,
} from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { UserAvatar } from "@/components/app/user-avatar"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { TagInput, DOMAIN_RE } from "@/components/admin/tag-input"
import { EmailDeliveryFields, TestEmailPanel, type EmailDeliveryValue } from "@/components/admin/email-delivery-fields"
import { StepProgress, StepRail, type RailStep } from "@/components/onboarding/step-rail"
import { WorkspaceFields, type WorkspaceFieldsValue } from "@/components/onboarding/workspace-fields"
import {
  checkSetupSlugAction,
  createOwnerAction,
  finishSetupAction,
  saveEmailSetupAction,
  saveInstanceAction,
} from "@/app/setup/actions"
import { cn } from "@/lib/utils"

const STEPS: RailStep[] = [
  { id: "welcome", label: "Welcome", hint: "System check" },
  { id: "owner", label: "Owner account", hint: "Your super admin login" },
  { id: "instance", label: "Instance", hint: "Name and sign-up policy" },
  { id: "email", label: "Email delivery", hint: "SMTP or Amazon SES" },
  { id: "workspace", label: "First workspace", hint: "Where your team works" },
]

export type SetupWizardProps = {
  initialStep: number
  productName: string
  version: string
  appUrl: string
  checks: { label: string; ok: boolean; detail: string }[]
  owner: { name: string | null; email: string } | null
  general: { instanceName: string; mode: "private" | "saas"; marketingSite: boolean }
  auth: { signupMode: "open" | "invite_only" | "domains"; allowedSignupDomains: string[] }
  email: EmailDeliveryValue
  emailPasswordPreview: string
  defaultFromEmail: string
}

type ActionRes<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }

export function SetupWizard(props: SetupWizardProps) {
  const [step, setStep] = useState(props.initialStep)
  const [direction, setDirection] = useState(1)
  const [owner, setOwner] = useState(props.owner)
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Step state lives here so going back keeps what was entered
  const [ownerForm, setOwnerForm] = useState({ setupCode: "", name: "", email: "" })
  const [general, setGeneral] = useState(props.general)
  const [auth, setAuth] = useState(props.auth)
  const [email, setEmail] = useState<EmailDeliveryValue>(props.email)
  const [password, setPassword] = useState<string | undefined>(undefined)
  const [passwordPreview, setPasswordPreview] = useState(props.emailPasswordPreview)
  const [workspace, setWorkspace] = useState<WorkspaceFieldsValue>({ name: "", slug: "", slugEdited: false })
  const [slugState, setSlugState] = useState<"idle" | "checking" | "available" | "unavailable">("idle")
  const [demo, setDemo] = useState(true)
  const [finished, setFinished] = useState<{ path: string; demoError: string | null } | null>(null)

  const appHost = props.appUrl.replace(/^https?:\/\//, "")

  function go(to: number) {
    setDirection(to > step ? 1 : -1)
    setFieldErrors({})
    setStep(to)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function run<T>(fn: () => Promise<ActionRes<T>>, onOk: (data: T) => void) {
    setFieldErrors({})
    startTransition(async () => {
      try {
        const res = await fn()
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {})
          toast.error(res.error)
          return
        }
        onOk(res.data)
      } catch {
        toast.error("Could not reach the server. Please try again.")
      }
    })
  }

  const err = (...keys: string[]) => keys.map((k) => fieldErrors[k]).find(Boolean)

  const body = (() => {
    switch (STEPS[step]!.id) {
      case "welcome":
        return (
          <StepShell
            eyebrow="Instance setup"
            title={`Welcome to ${props.productName}.`}
            quiet="Let's get your instance ready in a few minutes."
            description="Dispatch turns shared mailboxes into a collaborative workspace: assign conversations, discuss them internally and reply as a team — on top of Gmail, Outlook or any IMAP account."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { icon: Inbox, title: "Shared inboxes", text: "support@, sales@ and personal accounts in one place." },
                { icon: MessagesSquare, title: "Internal comments", text: "Discuss emails with @mentions — no more forwards." },
                { icon: Workflow, title: "Rules & assignments", text: "Route, label and balance work automatically." },
              ].map((f) => (
                <div key={f.title} className="rounded-lg border border-border bg-card p-3.5">
                  <f.icon className="size-4 text-brand" />
                  <div className="mt-3 text-sm font-medium">{f.title}</div>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                System check
              </div>
              <ul className="divide-y divide-border">
                {props.checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-3 px-4 py-3">
                    {c.ok ? (
                      <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TriangleAlert className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-[13px] break-words text-muted-foreground">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <StepFooter>
              <span />
              <Button size="lg" className="h-10 rounded-md px-5" onClick={() => go(1)}>
                Get started <ArrowRight />
              </Button>
            </StepFooter>
          </StepShell>
        )

      case "owner":
        return (
          <StepShell
            eyebrow={`Step 2 of ${STEPS.length}`}
            title="Create the owner account."
            quiet="This is your super admin login."
            description="The instance owner can manage every workspace, user and setting from the admin panel. Sign-in is passwordless — later you'll receive a link and code by email."
          >
            {owner ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
                  <UserAvatar name={owner.name} email={owner.email} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{owner.name || owner.email}</div>
                    <div className="truncate text-[13px] text-muted-foreground">{owner.email}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" /> Signed in
                  </span>
                </div>
                <StepFooter>
                  <BackButton onClick={() => go(0)} />
                  <Button size="lg" className="h-10 rounded-md px-5" onClick={() => go(2)}>
                    Continue <ArrowRight />
                  </Button>
                </StepFooter>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  run(
                    () => createOwnerAction(ownerForm),
                    (data) => {
                      setOwner(data)
                      toast.success("Owner account created — you're signed in.")
                      go(2)
                    }
                  )
                }}
              >
                <div className="grid gap-4">
                  <div className="grid gap-2 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-4 text-brand" />
                      <Label htmlFor="setup-code" className="text-[13px]">
                        Setup code
                      </Label>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      To prove you run this server, enter the one-time code printed in its logs. Run{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">docker compose logs app</code> or
                      open the app&apos;s logs in Coolify and look for &ldquo;Dispatch first-run setup code&rdquo;.
                    </p>
                    <Input
                      id="setup-code"
                      autoFocus
                      required
                      autoComplete="one-time-code"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={14}
                      placeholder="XXXX-XXXX-XXXX"
                      value={ownerForm.setupCode}
                      onChange={(e) => setOwnerForm((f) => ({ ...f, setupCode: formatCodeInput(e.target.value) }))}
                      className="h-10 bg-background font-mono text-[15px] tracking-[0.2em] placeholder:tracking-[0.2em]"
                      aria-invalid={Boolean(err("setupCode"))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="owner-name" className="text-[13px]">
                      Your name
                    </Label>
                    <Input
                      id="owner-name"
                      autoComplete="name"
                      required
                      maxLength={80}
                      value={ownerForm.name}
                      onChange={(e) => setOwnerForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Ada Lovelace"
                      className="h-10 bg-card"
                      aria-invalid={Boolean(err("name"))}
                    />
                    {err("name") && <FieldError>{err("name")}</FieldError>}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="owner-email" className="text-[13px]">
                      Email
                    </Label>
                    <Input
                      id="owner-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={ownerForm.email}
                      onChange={(e) => setOwnerForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="h-10 bg-card"
                      aria-invalid={Boolean(err("email"))}
                    />
                    {err("email") ? (
                      <FieldError>{err("email")}</FieldError>
                    ) : (
                      <p className="text-xs text-muted-foreground">Use an address you can receive email at — it&apos;s how you sign in.</p>
                    )}
                  </div>
                </div>
                <StepFooter>
                  <BackButton onClick={() => go(0)} disabled={pending} />
                  <Button type="submit" size="lg" className="h-10 rounded-md px-5" disabled={pending}>
                    {pending && <Spinner />} Create owner account
                  </Button>
                </StepFooter>
              </form>
            )}
          </StepShell>
        )

      case "instance":
        return (
          <StepShell
            eyebrow={`Step 3 of ${STEPS.length}`}
            title="Set up your instance."
            quiet="Who is it for?"
            description="You can change all of this later in Admin → Settings."
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(() => saveInstanceAction({ general, auth }), () => go(3))
              }}
              className="grid gap-7"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="instance-name" className="text-[13px]">
                  Instance name
                </Label>
                <Input
                  id="instance-name"
                  value={general.instanceName}
                  maxLength={80}
                  required
                  onChange={(e) => setGeneral((g) => ({ ...g, instanceName: e.target.value }))}
                  className="h-10 bg-card"
                  aria-invalid={Boolean(err("general.instanceName"))}
                />
                {err("general.instanceName") ? (
                  <FieldError>{err("general.instanceName")}</FieldError>
                ) : (
                  <p className="text-xs text-muted-foreground">Shown in the admin panel and in system emails.</p>
                )}
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-[13px] font-medium">How will you use it?</legend>
                <ChoiceCards
                  aria-label="Instance mode"
                  value={general.mode}
                  onChange={(mode) => {
                    setGeneral((g) => ({ ...g, mode, marketingSite: mode === "saas" }))
                    setAuth((a) => ({ ...a, signupMode: mode === "saas" ? "open" : "invite_only" }))
                  }}
                  options={[
                    {
                      value: "private",
                      title: "Private — just my company",
                      description: "A self-hosted instance for your own team. No public sign-ups, no billing.",
                      icon: Building2,
                    },
                    {
                      value: "saas",
                      title: "Public SaaS",
                      description: "Let other companies sign up for their own workspaces, with optional Stripe billing.",
                      icon: Globe,
                    },
                  ]}
                />
                {general.mode === "saas" && (
                  <p className="text-xs text-muted-foreground">
                    Billing is off until you add Stripe keys in Admin → Settings → Billing. Workspaces then get a free trial and a
                    monthly subscription.
                  </p>
                )}
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-[13px] font-medium">Who can sign up?</legend>
                <ChoiceCards
                  aria-label="Sign-up policy"
                  columns={3}
                  value={auth.signupMode}
                  onChange={(signupMode) => setAuth((a) => ({ ...a, signupMode }))}
                  options={[
                    { value: "invite_only", title: "Invite only", description: "People join when an admin invites them.", icon: Lock },
                    { value: "domains", title: "Allowed domains", description: "Anyone with an approved email domain.", icon: AtSign },
                    { value: "open", title: "Anyone", description: "Open sign-up — anyone can create an account.", icon: Users },
                  ]}
                />
                {auth.signupMode === "domains" && (
                  <div className="mt-2 grid gap-1.5">
                    <Label htmlFor="signup-domains" className="text-[13px]">
                      Allowed email domains
                    </Label>
                    <TagInput
                      id="signup-domains"
                      value={auth.allowedSignupDomains}
                      onChange={(allowedSignupDomains) => setAuth((a) => ({ ...a, allowedSignupDomains }))}
                      placeholder="acme.com, acme.de"
                      normalize={(v) => v.trim().toLowerCase().replace(/^@/, "")}
                      validate={(v) => (DOMAIN_RE.test(v) ? null : `“${v}” is not a valid domain`)}
                      className="bg-card"
                      aria-invalid={Boolean(err("auth.allowedSignupDomains"))}
                    />
                    <p className="text-xs text-muted-foreground">Press Enter or comma to add. Invited people can always join.</p>
                  </div>
                )}
              </fieldset>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
                <div>
                  <Label htmlFor="marketing-site" className="text-sm">
                    Public website
                  </Label>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Show the landing, pricing and legal pages at {appHost}. When off, visitors go straight to sign-in.
                  </p>
                </div>
                <Switch
                  id="marketing-site"
                  checked={general.marketingSite}
                  onCheckedChange={(marketingSite) => setGeneral((g) => ({ ...g, marketingSite }))}
                />
              </div>

              <StepFooter className="mt-0">
                <BackButton onClick={() => go(1)} disabled={pending} />
                <Button type="submit" size="lg" className="h-10 rounded-md px-5" disabled={pending}>
                  {pending && <Spinner />} Continue <ArrowRight />
                </Button>
              </StepFooter>
            </form>
          </StepShell>
        )

      case "email":
        return (
          <StepShell
            eyebrow={`Step 4 of ${STEPS.length}`}
            title="Email delivery."
            quiet="How sign-in links reach your team."
            description="Dispatch sends sign-in codes, invitations and notifications through this account. Your team's inboxes are connected separately, per workspace."
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(
                  () => saveEmailSetupAction({ values: email, password }),
                  (data) => {
                    setPasswordPreview(data.passwordPreview)
                    setPassword(undefined)
                    go(4)
                  }
                )
              }}
              className="grid gap-5"
            >
              <EmailDeliveryFields
                value={email}
                onChange={(patch) => setEmail((v) => ({ ...v, ...patch }))}
                passwordPreview={passwordPreview}
                password={password}
                onPasswordChange={setPassword}
                showReplyTo={false}
                defaultFromEmail={props.defaultFromEmail}
                fieldErrors={fieldErrors}
              />
              {email.provider !== "log" && owner && <TestEmailPanel config={email} password={password} defaultTo={owner.email} />}

              <StepFooter className="mt-1">
                <BackButton onClick={() => go(2)} disabled={pending} />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {email.provider !== "log" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="h-10 rounded-md"
                      disabled={pending}
                      onClick={() => {
                        const next = { ...email, provider: "log" as const }
                        setEmail(next)
                        run(() => saveEmailSetupAction({ values: next }), () => go(4))
                      }}
                    >
                      Skip for now
                    </Button>
                  )}
                  <Button type="submit" size="lg" className="h-10 rounded-md px-5" disabled={pending}>
                    {pending && <Spinner />} {email.provider === "log" ? "Continue without email" : "Save & continue"} <ArrowRight />
                  </Button>
                </div>
              </StepFooter>
            </form>
          </StepShell>
        )

      case "workspace":
        return (
          <StepShell
            eyebrow={`Step 5 of ${STEPS.length}`}
            title="Create your first workspace."
            quiet="Where your team works together."
            description="A workspace holds your shared inboxes, teammates, labels and rules. You can create more later."
          >
            {finished ? (
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" /> Your workspace is ready.
                </div>
                {finished.demoError && (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    The demo data couldn&apos;t be loaded ({finished.demoError}). You can load it later from the workspace.
                  </p>
                )}
                <Button size="lg" className="mt-4 h-10 rounded-md px-5" onClick={() => window.location.assign(finished.path)}>
                  Open your inbox <ArrowRight />
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  run(
                    () => finishSetupAction({ name: workspace.name, slug: workspace.slug, demo }),
                    (data) => {
                      if (data.demoError) setFinished(data)
                      else window.location.assign(data.path)
                    }
                  )
                }}
                className="grid gap-6"
              >
                <WorkspaceFields
                  value={workspace}
                  onChange={setWorkspace}
                  check={checkSetupSlugAction}
                  appHost={appHost}
                  onStatus={setSlugState}
                  autoFocus
                  error={err("name", "slug")}
                />
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
                  <div className="flex gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft">
                      <Sparkles className="size-4 text-foreground" />
                    </span>
                    <div>
                      <Label htmlFor="demo-data" className="text-sm">
                        Load demo data
                      </Label>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        Explore with sample conversations, teammates, tasks and rules. You can remove it anytime.
                      </p>
                    </div>
                  </div>
                  <Switch id="demo-data" checked={demo} onCheckedChange={setDemo} />
                </div>
                <StepFooter className="mt-0">
                  <BackButton onClick={() => go(3)} disabled={pending} />
                  <Button
                    type="submit"
                    size="lg"
                    className="h-10 rounded-md px-5"
                    disabled={pending || !workspace.name.trim() || slugState === "unavailable" || slugState === "checking"}
                  >
                    {pending && <Spinner />} {pending ? (demo ? "Creating workspace & demo data…" : "Creating workspace…") : "Finish setup"}
                    {!pending && <ArrowRight />}
                  </Button>
                </StepFooter>
              </form>
            )}
          </StepShell>
        )
    }
  })()

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-6 lg:flex">
        <Logo name={props.productName} />
        <div className="mt-10 mb-4 px-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Instance setup</div>
        <StepRail
          steps={STEPS}
          current={step}
          onSelect={pending ? undefined : go}
          canSelect={(i) => i < step}
        />
        <div className="mt-auto px-2 text-xs leading-relaxed text-muted-foreground">
          {props.productName} v{props.version} · open source
          <br />
          <a
            href="https://github.com/codextde/dispatch"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Self-hosting guide
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 backdrop-blur lg:hidden">
          <div className="mb-3">
            <Logo name={props.productName} />
          </div>
          <StepProgress steps={STEPS} current={step} />
        </header>
        <main className="flex flex-1 justify-center px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 lg:items-center lg:py-12">
          <div className="w-full max-w-xl">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -16 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {body}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

/** Uppercase, keep the setup code alphabet only, group as XXXX-XXXX-XXXX. */
function formatCodeInput(raw: string) {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
  return chars.match(/.{1,4}/g)?.join("-") ?? ""
}

function StepShell({
  eyebrow,
  title,
  quiet,
  description,
  children,
}: {
  eyebrow: string
  title: string
  quiet?: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div
        className={cn(
          "mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
          // the mobile header already shows "Step x of y"
          eyebrow.startsWith("Step") && "max-lg:hidden"
        )}
      >
        {eyebrow}
      </div>
      <h1 className="text-[28px] leading-[1.15] font-semibold tracking-tight text-balance sm:text-[32px]">
        {title}
        {quiet && <span className="text-quiet"> {quiet}</span>}
      </h1>
      {description && <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
      <div className="mt-8">{children}</div>
    </section>
  )
}

function StepFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mt-8 flex items-center justify-between gap-3 border-t border-border pt-5", className)}>{children}</div>
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="lg" className="h-10 rounded-md" onClick={onClick} disabled={disabled}>
      <ArrowLeft /> Back
    </Button>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  )
}
