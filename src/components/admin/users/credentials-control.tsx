"use client"

import { useState } from "react"
import { KeyRound, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { useAdminAction } from "@/components/admin/client"
import { updateUserCredentialsAction } from "@/app/admin/users/actions"
import { useI18n } from "@/lib/i18n"

export function CredentialsControl({ id, email }: { id: string; email: string }) {
  const { t } = useI18n()
  const [nextEmail, setNextEmail] = useState(email)
  const [password, setPassword] = useState("")
  const action = useAdminAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        action.run(() => updateUserCredentialsAction({ id, email: nextEmail !== email ? nextEmail : undefined, password: password || undefined }), {
          success: t("credentialsUpdated"),
          onSuccess: () => setPassword(""),
        })
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="admin-user-email">{t("loginEmailLabel")}</Label>
        <Input id="admin-user-email" type="email" value={nextEmail} onChange={(e) => setNextEmail(e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="admin-user-password">{t("setNewPassword")}</Label>
        <PasswordInput id="admin-user-password" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("keepPasswordPlaceholder")} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
        <p className="text-xs text-muted-foreground">{t("passwordSessionHelp")}</p>
      </div>
      <Button type="submit" disabled={action.pending || (nextEmail === email && !password)} className="w-fit">
        <Save /> {action.pending ? t("saving") : t("saveCredentials")}
      </Button>
    </form>
  )
}
