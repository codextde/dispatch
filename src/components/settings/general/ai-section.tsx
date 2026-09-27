"use client"

import { useState } from "react"
import { CheckCircle2, KeyRound, Loader2, PowerOff, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField, SectionFooter, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { OptionCards } from "@/components/settings/personal/option-cards"
import { useServerAction } from "@/components/settings/use-server-action"
import { testWorkspaceAi, updateWorkspaceAi } from "@/server/workspace/actions/general"

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
      <StatusBadge tone="neutral">Off</StatusBadge>
    ) : saved.mode === "custom" ? (
      <StatusBadge tone="success">Workspace key</StatusBadge>
    ) : instance.available ? (
      <StatusBadge tone="success">Instance default</StatusBadge>
    ) : (
      <StatusBadge tone="neutral">Not configured</StatusBadge>
    )

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          AI assistant {status}
        </span>
      }
      description="Summaries, reply drafts, rewriting and translation in the composer."
      footer={
        <SectionFooter
          hint={
            test ? (
              <span className={test.ok ? "flex items-center gap-1.5 text-success" : "text-destructive"}>
                {test.ok && <CheckCircle2 className="size-3.5" />}
                {test.text}
              </span>
            ) : form.mode === "custom" ? (
              "API keys are encrypted at rest and never shown again."
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
              Test connection
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || save.pending}
            onClick={() =>
              save.run(() => updateWorkspaceAi(payload()), {
                success: "AI settings saved",
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
            Save
          </Button>
        </SectionFooter>
      }
    >
      <div className="flex flex-col gap-5">
        <OptionCards<AiMode>
          label="AI provider"
          value={form.mode}
          onChange={(v) => set("mode", v)}
          options={[
            {
              value: "instance",
              label: "Instance default",
              icon: <Sparkles />,
              description: instance.available
                ? `Provided by your administrator (${instance.model || instance.provider}).`
                : "Your administrator hasn't configured AI yet.",
            },
            {
              value: "custom",
              label: "Our own API key",
              icon: <KeyRound />,
              description: instance.allowOrgKeys ? "Bring your own Anthropic or OpenAI-compatible key." : "Disabled by your administrator.",
              disabled: !instance.allowOrgKeys,
            },
            { value: "off", label: "Off", icon: <PowerOff />, description: "Hide AI features for everyone in this workspace." },
          ]}
        />

        {form.mode === "custom" && (
          <div className="grid gap-4 rounded-lg border bg-surface/40 p-4 sm:grid-cols-2">
            <FormField label="Provider" htmlFor="ai-provider">
              <Select value={form.provider} onValueChange={(v) => set("provider", v as AiState["provider"])}>
                <SelectTrigger id="ai-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI-compatible</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Model" htmlFor="ai-model" optional description={`Default: ${DEFAULT_MODEL[form.provider]}`}>
              <Input
                id="ai-model"
                spellCheck={false}
                placeholder={DEFAULT_MODEL[form.provider]}
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
              />
            </FormField>
            <FormField
              label="API key"
              htmlFor="ai-key"
              className="sm:col-span-2"
              optional={form.provider === "openai"}
              description={
                hasStoredKey ? (
                  <span className="flex flex-wrap items-center gap-x-2">
                    Saved key <span className="font-mono">{saved.keyPreview}</span> — leave blank to keep it.
                    <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setClearKey(true)}>
                      Remove key
                    </button>
                  </span>
                ) : clearKey ? (
                  <span>
                    The saved key will be removed.{" "}
                    <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setClearKey(false)}>
                      Undo
                    </button>
                  </span>
                ) : form.provider === "openai" ? (
                  "Not needed for keyless local servers such as Ollama."
                ) : undefined
              }
            >
              <Input
                id="ai-key"
                type="password"
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
              label="Base URL"
              htmlFor="ai-base"
              optional
              className="sm:col-span-2"
              description={
                form.provider === "openai"
                  ? "For OpenRouter, Azure, Ollama, LM Studio, vLLM … e.g. http://localhost:11434/v1"
                  : "Only needed for a proxy or gateway in front of the Anthropic API."
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
