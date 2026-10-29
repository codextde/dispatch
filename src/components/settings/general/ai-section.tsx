"use client"

import { useState } from "react"
import { CheckCircle2, KeyRound, Loader2, PowerOff, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField, SectionFooter, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { OptionCards } from "@/components/settings/personal/option-cards"
import { useServerAction } from "@/components/settings/use-server-action"
import { testWorkspaceAi, updateWorkspaceAi } from "@/server/workspace/actions/general"
import { useI18n } from "@/lib/i18n"

export type AiMode = "instance" | "off" | "custom"
export type AiState = {
  mode: AiMode
  provider: "anthropic" | "openai"
  model: string
  baseUrl: string
  keyPreview: string
}

const DEFAULT_MODEL = { anthropic: "claude-sonnet-5", openai: "gpt-4o-mini" } as const

export function AiSection({
  slug,
  initial,
  instance,
}: {
  slug: string
  initial: AiState
  instance: { allowOrgKeys: boolean; available: boolean; provider: string; model: string }
}) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [apiKey, setApiKey] = useState("")
  const [clearKey, setClearKey] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const save = useServerAction()
  const tester = useServerAction()
  const dirty = JSON.stringify(form) !== JSON.stringify(saved) || apiKey !== "" || clearKey
  const set = <K extends keyof AiState>(k: K, v: AiState[K]) => {
    setTest(null)
    setForm((f) => ({ ...f, [k]: v }))
  }
  const payload = () => ({ slug, mode: form.mode, provider: form.provider, model: form.model, baseUrl: form.baseUrl, apiKey, clearKey })
  const hasStoredKey = Boolean(saved.keyPreview) && !clearKey

  const status =
    saved.mode === "off" ? (
      <StatusBadge tone="neutral">{t("off")}</StatusBadge>
    ) : saved.mode === "custom" ? (
      <StatusBadge tone="success">{t("aiWorkspaceKey")}</StatusBadge>
    ) : instance.available ? (
      <StatusBadge tone="success">{t("aiInstanceDefault")}</StatusBadge>
    ) : (
      <StatusBadge tone="neutral">{t("aiNotConfigured")}</StatusBadge>
    )

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          {t("aiAssistant")} {status}
        </span>
      }
      description={t("aiDescription")}
      footer={
        <SectionFooter
          hint={
            test ? (
              <span className={test.ok ? "flex items-center gap-1.5 text-success" : "text-destructive"}>
                {test.ok && <CheckCircle2 className="size-3.5" />}
                {test.text}
              </span>
            ) : form.mode === "custom" ? (
              t("aiSecureKey")
            ) : undefined
          }
        >
          {form.mode === "custom" && (
            <Button
              variant="outline"
              size="sm"
              disabled={tester.pending}
              onClick={() =>
                tester.run(() => testWorkspaceAi(payload()), {
                  silentError: true,
                  onSuccess: (d) => setTest({ ok: true, text: `Connected to ${d.model} in ${(d.latencyMs / 1000).toFixed(1)}s` }),
                  onError: (e) => setTest({ ok: false, text: e }),
                })
              }
            >
              {tester.pending ? <Loader2 className="animate-spin" /> : <Zap />}
              {t("aiTestConnection")}
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || save.pending}
            onClick={() =>
              save.run(() => updateWorkspaceAi(payload()), {
                success: t("aiSettingsSaved"),
                onSuccess: () => {
                  const next = {
                    ...form,
                    keyPreview: form.mode !== "custom" ? "" : apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : clearKey ? "" : form.keyPreview,
                  }
                  setForm(next)
                  setSaved(next)
                  setApiKey("")
                  setClearKey(false)
                },
              })
            }
          >
            {save.pending && <Loader2 className="animate-spin" />}
            {t("saveChanges")}
          </Button>
        </SectionFooter>
      }
    >
      <div className="flex flex-col gap-5">
        <OptionCards<AiMode>
          label={t("aiProvider")}
          value={form.mode}
          onChange={(v) => set("mode", v)}
          options={[
            {
              value: "instance",
              label: t("aiInstanceDefault"),
              icon: <Sparkles />,
              description: instance.available
                ? t("aiProvidedByAdmin").replace("{model}", instance.model || instance.provider)
                : t("aiAdminNotConfigured"),
            },
            {
              value: "custom",
              label: t("aiOwnKey"),
              icon: <KeyRound />,
              description: instance.allowOrgKeys ? t("aiBringKey") : t("aiDisabledByAdmin"),
              disabled: !instance.allowOrgKeys,
            },
            { value: "off", label: t("off"), icon: <PowerOff />, description: t("aiHideFeatures") },
          ]}
        />

        {form.mode === "custom" && (
          <div className="grid gap-4 rounded-lg border bg-surface/40 p-4 sm:grid-cols-2">
            <FormField label={t("aiProviderField")} htmlFor="ai-provider">
              <Select value={form.provider} onValueChange={(v) => set("provider", v as AiState["provider"])}>
                <SelectTrigger id="ai-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">{t("aiOpenAICompatible")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("aiModel")} htmlFor="ai-model" optional description={t("aiDefaultModel").replace("{model}", DEFAULT_MODEL[form.provider])}>
              <PasswordInput
                id="ai-model"
                spellCheck={false}
                placeholder={DEFAULT_MODEL[form.provider]}
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("aiApiKey")}
              htmlFor="ai-key"
              className="sm:col-span-2"
              optional={form.provider === "openai"}
              description={
                hasStoredKey ? (
                  <span className="flex flex-wrap items-center gap-x-2">
                    {t("aiSavedKey")} <span className="font-mono">{saved.keyPreview}</span> — {t("aiLeaveBlank")}
                    <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setClearKey(true)}>
                      {t("aiRemoveKey")}
                    </button>
                  </span>
                ) : clearKey ? (
                  <span>
                    {t("aiKeyWillBeRemoved")}{" "}
                    <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setClearKey(false)}>
                      {t("aiUndo")}
                    </button>
                  </span>
                ) : form.provider === "openai" ? (
                  t("aiKeylessHelp")
                ) : undefined
              }
            >
              <PasswordInput
                id="ai-key"
                autoComplete="off"
                spellCheck={false}
                placeholder={hasStoredKey ? "••••••••••••" : form.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
                value={apiKey}
                onChange={(e) => {
                  setTest(null)
                  setApiKey(e.target.value)
                }}
              />
            </FormField>
            <FormField
              label={t("aiBaseUrl")}
              htmlFor="ai-base"
              optional
              className="sm:col-span-2"
              description={
                form.provider === "openai"
                  ? t("aiOpenAIBaseHelp")
                  : t("aiAnthropicBaseHelp")
              }
            >
              <Input
                id="ai-base"
                spellCheck={false}
                placeholder={form.provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"}
                value={form.baseUrl}
                onChange={(e) => set("baseUrl", e.target.value)}
              />
            </FormField>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
