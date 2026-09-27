"use client"

import { useState } from "react"
import { Cloud, FlaskConical, HardDrive, TriangleAlert } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Panel, StatusBadge } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { SecretInput } from "@/components/admin/secret-input"
import {
  Callout,
  NumberInput,
  GRID_FIELD,
  SettingField,
  SettingsFormShell,
  SwitchField,
  TestResult,
  useSettingsForm,
} from "@/components/admin/settings/form"
import { testStorageAction } from "@/app/admin/settings/actions"

export type StorageSettingsValue = {
  driver: "local" | "s3"
  s3Endpoint: string
  s3Region: string
  s3Bucket: string
  s3AccessKeyId: string
  s3SecretEnc: string
  s3ForcePathStyle: boolean
  maxAttachmentMb: number
}

export function StorageSettingsForm({ initial, localPath }: { initial: StorageSettingsValue; localPath: string }) {
  const form = useSettingsForm("storage", initial)
  const v = form.values
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const driverChanged = v.driver !== form.baseline.driver

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await testStorageAction({})
      setResult(res.ok ? { ok: true, message: res.data.message } : { ok: false, message: res.error })
    } catch {
      setResult({ ok: false, message: "Could not reach the server." })
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsFormShell form={form}>
      <Panel
        title="Attachment storage"
        description="Where email attachments and uploaded files are stored."
        actions={
          <StatusBadge tone="ok">
            {form.baseline.driver === "s3" ? `S3 · ${form.baseline.s3Bucket || "no bucket"}` : "Local disk"}
          </StatusBadge>
        }
      >
        <ChoiceCards
          aria-label="Storage driver"
          value={v.driver}
          onChange={(driver) => form.set({ driver })}
          options={[
            { value: "local", title: "Local disk", description: "Files live in the data volume. Simple and fast for single-server installs.", icon: HardDrive },
            {
              value: "s3",
              title: "S3-compatible bucket",
              description: "AWS S3, Cloudflare R2, Hetzner, Backblaze B2, MinIO … Scales independently of the server.",
              icon: Cloud,
            },
          ]}
        />

        {driverChanged && (
          <Callout tone="warn" icon={TriangleAlert} className="mt-4">
            Switching storage doesn&apos;t move existing files. Attachments stored so far stay in the previous location and won&apos;t load
            until you copy them over (same keys) — switch before storing important data.
          </Callout>
        )}

        {v.driver === "local" ? (
          <div className="mt-4 grid gap-1.5">
            <span className="text-[13px] text-muted-foreground">Storage path</span>
            <code className="w-fit max-w-full truncate rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[12.5px]">
              {localPath}
            </code>
            <p className="text-[13px] text-muted-foreground">Make sure this directory is on a persistent volume and included in your backups.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-x-6 border-t border-border pt-4 sm:grid-cols-2">
            <SettingField
              label="Endpoint"
              htmlFor="s3-endpoint"
              description="Leave empty for AWS S3. R2: https://<account-id>.r2.cloudflarestorage.com"
              error={form.error("s3Endpoint")}
              className={`${GRID_FIELD} sm:col-span-2`}
            >
              <Input
                id="s3-endpoint"
                value={v.s3Endpoint}
                placeholder="https://s3.eu-central-1.amazonaws.com"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => form.set({ s3Endpoint: e.target.value })}
                aria-invalid={Boolean(form.error("s3Endpoint"))}
              />
            </SettingField>
            <SettingField label="Bucket" htmlFor="s3-bucket" className={GRID_FIELD} error={form.error("s3Bucket")}>
              <Input
                id="s3-bucket"
                value={v.s3Bucket}
                placeholder="dispatch-attachments"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => form.set({ s3Bucket: e.target.value })}
              />
            </SettingField>
            <SettingField label="Region" htmlFor="s3-region" className={GRID_FIELD} description="Use “auto” for Cloudflare R2." error={form.error("s3Region")}>
              <Input
                id="s3-region"
                value={v.s3Region}
                placeholder="auto"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => form.set({ s3Region: e.target.value })}
              />
            </SettingField>
            <SettingField label="Access key ID" htmlFor="s3-access-key" className={GRID_FIELD} error={form.error("s3AccessKeyId")}>
              <Input
                id="s3-access-key"
                value={v.s3AccessKeyId}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-[13px]"
                onChange={(e) => form.set({ s3AccessKeyId: e.target.value })}
              />
            </SettingField>
            <SettingField label="Secret access key" htmlFor="s3-secret" className={GRID_FIELD}>
              <SecretInput
                key={form.formKey}
                id="s3-secret"
                preview={form.secretPreview("s3SecretEnc")}
                value={form.secrets.s3SecretEnc}
                onChange={(val) => form.setSecret("s3SecretEnc", val)}
              />
            </SettingField>
            <div className="sm:col-span-2">
              <SwitchField
                id="s3-path-style"
                label="Path-style URLs"
                description="Required by MinIO and most self-hosted gateways. AWS and R2 work either way."
                checked={v.s3ForcePathStyle}
                onCheckedChange={(s3ForcePathStyle) => form.set({ s3ForcePathStyle })}
              />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Limits">
        <SettingField
          label="Maximum attachment size"
          htmlFor="max-attachment"
          description="Per file, for uploads and outgoing attachments (1–200 MB). Most mail servers reject messages above 25 MB."
          error={form.error("maxAttachmentMb")}
        >
          <NumberInput
            id="max-attachment"
            value={v.maxAttachmentMb}
            min={1}
            max={200}
            suffix="MB"
            onChange={(maxAttachmentMb) => form.set({ maxAttachmentMb })}
            aria-invalid={Boolean(form.error("maxAttachmentMb"))}
          />
        </SettingField>
      </Panel>

      <Panel title="Test storage" description="Writes, reads back and deletes a small file using the saved configuration.">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={runTest} disabled={testing || form.dirty}>
            {testing ? <Spinner /> : <FlaskConical />} Run storage test
          </Button>
          {form.dirty && <span className="text-[13px] text-muted-foreground">Save changes to test them.</span>}
        </div>
        <div className="mt-2.5">
          <TestResult result={result} />
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
