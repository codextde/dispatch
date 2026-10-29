"use client"

import { useState, useTransition } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Spinner } from "@/components/ui/spinner"
import { localizeError, useI18n } from "@/lib/i18n"
import { setInvitePasswordAction } from "@/app/invite/[token]/actions"

export function InvitePasswordForm({ token, email }: { token: string; email: string }) {
  const { t, locale } = useI18n()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 12 || confirm.length < 12) return setError(t("passwordTooShort"))
    if (password !== confirm) return setError(t("passwordsDoNotMatch"))
    setError(null)
    startTransition(async () => {
      const result = await setInvitePasswordAction({ token, password })
      if (result && !result.ok) setError(localizeError(result.error, locale))
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="invite-password">{t("createPassword")}</Label>
        <PasswordInput id="invite-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} autoComplete="new-password" required showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-password-confirm">{t("confirmPassword")}</Label>
        <PasswordInput id="invite-password-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} autoComplete="new-password" required showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </div>
      <p className="text-xs text-muted-foreground">{t("invitePasswordHelp")} {email}</p>
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-10 w-full rounded-md" disabled={pending}>
        {pending ? <Spinner /> : null}
        {t("setPasswordAndJoin")}
        {!pending && <ArrowRight />}
      </Button>
    </form>
  )
}
