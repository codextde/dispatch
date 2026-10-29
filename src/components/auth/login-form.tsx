"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, Info, MailCheck, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { loginWithPasswordAction, requestLoginCodeAction, verifyLoginCodeAction } from "@/app/login/actions"
import { cn } from "@/lib/utils"
import { localizeError, useI18n } from "@/lib/i18n"

const RESEND_COOLDOWN = 30

export type LoginNotice = { tone: "success" | "error" | "info"; text: string }

/**
 * Sign-in supports a local password and keeps the existing magic-link flow as
 * a recovery/fallback method.
 */
export function LoginForm({
  next,
  initialEmail = "",
  emailConfigured,
  providers,
  notice,
  signupHint,
}: {
  next?: string
  initialEmail?: string
  emailConfigured: boolean
  providers?: { google: boolean; microsoft: boolean }
  notice?: LoginNotice | null
  signupHint?: string
}) {
  const [step, setStep] = useState<"email" | "code">("email")
  const [mode, setMode] = useState<"password" | "magic">("password")
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [delivered, setDelivered] = useState(true)
  const [cooldown, setCooldown] = useState(0)
  const [redirecting, setRedirecting] = useState(false)
  const { t, locale } = useI18n()
  const [pending, startTransition] = useTransition()
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  function changeLocale(nextLocale: "en" | "it") {
    document.cookie = `dispatch-locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function requestCode(opts: { resend?: boolean } = {}) {
    setError(null)
    startTransition(async () => {
      const res = await requestLoginCodeAction({ email, next })
      if (!res.ok) {
        setError(localizeError(res.error, locale))
        return
      }
      setEmail(res.data.email)
      setDelivered(res.data.delivered)
      setCode("")
      setCooldown(RESEND_COOLDOWN)
      setStep("code")
      if (opts.resend) setError(null)
    })
  }

  function loginWithPassword() {
    setError(null)
    startTransition(async () => {
      const res = await loginWithPasswordAction({ email, password, next })
      if (res && !res.ok) setError(localizeError(res.error, locale))
      else setRedirecting(true)
    })
  }

  function verify(value: string) {
    if (value.length !== 6 || pending) return
    setError(null)
    startTransition(async () => {
      // On success the action redirects (client-side navigation) and never returns a result
      const res = await verifyLoginCodeAction({ email, code: value, next })
      if (res && !res.ok) {
        setError(localizeError(res.error, locale))
        setCode("")
        return
      }
      setRedirecting(true)
    })
  }

  // The code field is disabled while the send transition settles, so `autoFocus`
  // alone misses it: focus it as soon as it becomes interactive (and after errors).
  const codeInteractive = step === "code" && !pending && !redirecting
  useEffect(() => {
    if (codeInteractive) codeRef.current?.focus()
  }, [codeInteractive, error])

  if (step === "code") {
    return (
      <div>
        <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-card">
          <MailCheck className="size-5 text-brand" />
        </div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
          {t("checkEmail")}<span className="text-quiet">.</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {locale === "it" ? "Abbiamo inviato un’email a" : "We sent an email to"} <span className="font-medium break-words text-foreground">{email}</span>. {t("codeHelp")}
        </p>

        {!delivered && (
          <div className="mt-5 flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
            <Terminal className="mt-0.5 size-4 shrink-0" />
            <p>
              {t("emailNotConfigured")} (
              <code className="font-mono text-[12px]">docker compose logs app</code>).
            </p>
          </div>
        )}

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault()
            verify(code)
          }}
        >
          <Label htmlFor="login-code" className="sr-only">
            6-digit code
          </Label>
          <InputOTP
            ref={codeRef}
            id="login-code"
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v.replace(/\D/g, ""))
              if (error) setError(null)
            }}
            onComplete={verify}
            inputMode="numeric"
            pattern="^[0-9]*$"
            autoComplete="one-time-code"
            autoFocus
            disabled={pending || redirecting}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
            containerClassName="w-full"
          >
            <InputOTPGroup className="w-full">
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-auto h-12 min-w-0 flex-1 bg-card font-mono text-lg" aria-invalid={Boolean(error)} />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {error && <ErrorText id="login-error">{error}</ErrorText>}

          <Button type="submit" size="lg" className="mt-4 h-10 w-full rounded-md" disabled={code.length !== 6 || pending || redirecting}>
            {pending || redirecting ? <Spinner /> : null}
            {redirecting ? t("signingIn") : t("signIn")}
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setStep("email")
              setError(null)
              setCode("")
              setTimeout(() => emailRef.current?.focus(), 0)
            }}
          >
            <ArrowLeft className="size-3.5" /> {t("useDifferentEmail")}
          </button>
          <button
            type="button"
            disabled={cooldown > 0 || pending}
            className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:font-normal disabled:text-muted-foreground disabled:no-underline"
            onClick={() => requestCode({ resend: true })}
          >
            {cooldown > 0 ? `${t("resendIn")} ${cooldown}s` : t("resendCode")}
          </button>
        </div>
      </div>
    )
  }

  const hasProviders = Boolean(providers?.google || providers?.microsoft)
  const oauthHref = (provider: "google" | "microsoft") =>
    `/api/oauth/${provider}/start?purpose=login${next ? `&next=${encodeURIComponent(next)}` : ""}`

  return (
    <div>
      {notice && <NoticeBanner notice={notice} />}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t("signIn")}</div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">{t("language")}</span>
          <select value={locale} onChange={(e) => changeLocale(e.target.value as "en" | "it")} className="rounded-md border bg-card px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring">
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </label>
      </div>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">
        {t("welcome")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("signInHelp")}</p>

      <form
        className="mt-7"
        onSubmit={(e) => { e.preventDefault(); mode === "password" ? loginWithPassword() : requestCode() }}
      >
        <Label htmlFor="login-email" className="mb-1.5 text-[13px]">
          {t("workEmail")}
        </Label>
        <Input
          ref={emailRef}
          id="login-email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : undefined}
          className="h-10 bg-card"
        />
        {mode === "password" && (
          <>
            <Label htmlFor="login-password" className="mb-1.5 mt-4 text-[13px]">{t("password")}</Label>
            <PasswordInput
              id="login-password"
              name="password"
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(null) }}
              className="h-10 bg-card"
            />
          </>
        )}
        {error && <ErrorText id="login-error">{error}</ErrorText>}
        <Button type="submit" size="lg" className="mt-3 h-10 w-full rounded-md" disabled={pending || !email.trim()}>
          {pending ? <Spinner /> : null}
          {mode === "password" ? t("continue") : t("sendCode")}
          {!pending && <ArrowRight />}
        </Button>
      </form>

      <button
        type="button"
        className="mt-4 w-full text-center text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(null) }}
      >
        {mode === "password" ? t("useCode") : t("usePassword")}
      </button>

      {hasProviders && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {providers?.google && (
              <Button asChild variant="outline" size="lg" className="h-10 rounded-md bg-card">
                <a href={oauthHref("google")}>
                  <GoogleIcon /> {t("continueWithGoogle")}
                </a>
              </Button>
            )}
            {providers?.microsoft && (
              <Button asChild variant="outline" size="lg" className="h-10 rounded-md bg-card">
                <a href={oauthHref("microsoft")}>
                  <MicrosoftIcon /> {t("continueWithMicrosoft")}
                </a>
              </Button>
            )}
          </div>
        </>
      )}

      {!emailConfigured && (
        <p className="mt-6 flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            {t("emailNotConfigured")} (
            <code className="font-mono">docker compose logs app</code>).
          </span>
        </p>
      )}
      {signupHint && <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{signupHint}</p>}
    </div>
  )
}

function ErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 text-[13px] text-destructive">
      {children}
    </p>
  )
}

function NoticeBanner({ notice }: { notice: LoginNotice }) {
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-6 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px]",
        notice.tone === "success" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
        notice.tone === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        notice.tone === "info" && "border-border bg-surface text-foreground"
      )}
    >
      {notice.tone === "success" ? <CheckCircle2 className="mt-px size-4 shrink-0" /> : <Info className="mt-px size-4 shrink-0" />}
      {notice.text}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  )
}
