"use client"

import { useState } from "react"
import { Boxes, Sparkles, Zap } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Panel, StatusBadge } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { SecretInput } from "@/components/admin/secret-input"
import { GRID_FIELD, SettingField, SettingsFormShell, SwitchField, TestResult, useSettingsForm } from "@/components/admin/settings/form"
import { testAiAction } from "@/app/admin/settings/actions"

export type AiSettingsValue = {
  enabled: boolean
  provider: "anthropic" | "openai"
  apiKeyEnc: string
  model: string
  baseUrl: string
  allowOrgKeys: boolean
}

const ANTHROPIC_MODELS = ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"]

export function AiSettingsForm({ initial }: { initial: AiSettingsValue }) {
  const form = useSettingsForm("ai", initial)
  const v = form.values
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const hasKey = Boolean(form.secretPreview("apiKeyEnc") || form.secrets.apiKeyEnc)

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await testAiAction({ provider: v.provider, model: v.model, baseUrl: v.baseUrl.trim(), apiKey: form.secrets.apiKeyEnc })
      setResult(
        res.ok
          ? { ok: true, message: `${res.data.model} replied in ${res.data.latencyMs} ms: “${res.data.reply}”` }
          : { ok: false, message: res.error }
      )
    } catch {
      setResult({ ok: false, message: "Could not reach the server." })
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsFormShell form={form}>
      <Panel
        title="AI features"
        description="AI assistance inside workspaces, such as drafting replies and summarizing conversations. Conversation content is sent to the provider you configure."
        actions={
          form.baseline.enabled ? <StatusBadge tone="ok">Enabled</StatusBadge> : <StatusBadge tone="neutral">Disabled</StatusBadge>
        }
      >
        <div className="divide-y divide-border">
          <SwitchField
            id="ai-enabled"
            label="Enable AI features"
            description="Uses the instance key below for every workspace (unless a workspace brings its own)."
            checked={v.enabled}
            onCheckedChange={(enabled) => form.set({ enabled })}
          />
          <SwitchField
            id="ai-org-keys"
            label="Let workspaces bring their own key"
            description="Workspace admins can enter their own provider key in workspace settings; usage is then billed to them."
            checked={v.allowOrgKeys}
            onCheckedChange={(allowOrgKeys) => form.set({ allowOrgKeys })}
          />
        </div>
      </Panel>

      <Panel title="Provider" description="Anthropic Claude, or any OpenAI-compatible API (OpenAI, Azure, OpenRouter, Ollama, vLLM …).">
        <ChoiceCards
          aria-label="AI provider"
          value={v.provider}
          onChange={(provider) => form.set({ provider })}
          options={[
            { value: "anthropic", title: "Anthropic Claude", description: "Recommended. Uses the Messages API.", icon: Sparkles },
            { value: "openai", title: "OpenAI-compatible", description: "Any /chat/completions endpoint.", icon: Boxes },
          ]}
        />
        <div className="mt-4 grid gap-x-6 border-t border-border pt-4 sm:grid-cols-2">
          <SettingField
            label="API key"
            htmlFor="ai-key"
            className={`${GRID_FIELD} sm:col-span-2`}
            description={
              v.provider === "anthropic" ? (
                <>
                  Create one in the{" "}
                  <a
                    href="https://platform.claude.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Claude Console
                  </a>
                  .
                </>
              ) : (
                "Optional for local servers such as Ollama."
              )
            }
          >
            <SecretInput
              key={form.formKey}
              id="ai-key"
              preview={form.secretPreview("apiKeyEnc")}
              value={form.secrets.apiKeyEnc}
              onChange={(val) => form.setSecret("apiKeyEnc", val)}
              placeholder={v.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
            />
          </SettingField>
          <SettingField
            label="Model"
            htmlFor="ai-model"
            className={GRID_FIELD}
            error={form.error("model")}
            description={v.provider === "anthropic" ? "Default: claude-sonnet-5." : "The model id exactly as your provider names it."}
          >
            <Input
              id="ai-model"
              value={v.model}
              list={v.provider === "anthropic" ? "ai-model-suggestions" : undefined}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[13px]"
              onChange={(e) => form.set({ model: e.target.value })}
              aria-invalid={Boolean(form.error("model"))}
            />
            <datalist id="ai-model-suggestions">
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </SettingField>
          <SettingField
            label="Base URL (optional)"
            htmlFor="ai-base-url"
            className={GRID_FIELD}
            error={form.error("baseUrl")}
            description={
              v.provider === "anthropic"
                ? "Only for proxies/gateways. Default: https://api.anthropic.com"
                : "Including /v1. Default: https://api.openai.com/v1"
            }
          >
            <Input
              id="ai-base-url"
              value={v.baseUrl}
              placeholder={v.provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => form.set({ baseUrl: e.target.value })}
              aria-invalid={Boolean(form.error("baseUrl"))}
            />
          </SettingField>
        </div>
      </Panel>

      <Panel title="Test connection" description="Sends a one-word prompt with the values above — including unsaved changes.">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={runTest} disabled={testing || !v.model.trim() || (!hasKey && v.provider === "anthropic")}>
            {testing ? <Spinner /> : <Zap />} Test AI provider
          </Button>
          {!hasKey && v.provider === "anthropic" && <span className="text-[13px] text-muted-foreground">Add an API key to test.</span>}
        </div>
        <div className="mt-2.5">
          <TestResult result={result} />
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
