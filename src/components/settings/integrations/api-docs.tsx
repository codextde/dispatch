"use client"

import { BookOpen } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Code, SettingsSection } from "@/components/settings/settings-ui"
import { CodeBlock } from "@/components/settings/integrations/code-block"

const VERIFY_SNIPPET = `import crypto from "node:crypto"

/**
 * Verify a Dispatch webhook. Use the raw request body (before JSON parsing).
 * Header format: X-Dispatch-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
 */
export function verifyDispatchSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const i = part.indexOf("=")
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()]
    })
  )
  const timestamp = Number(parts.t)
  if (!Number.isFinite(timestamp)) return false
  // Reject old (replayed) deliveries
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex")
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(parts.v1 ?? "", "utf8")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}`

const EXPRESS_SNIPPET = `import express from "express"

const app = express()

app.post("/webhooks/dispatch", express.text({ type: "application/json" }), (req, res) => {
  const ok = verifyDispatchSignature(
    req.body,
    req.get("X-Dispatch-Signature"),
    process.env.DISPATCH_WEBHOOK_SECRET
  )
  if (!ok) return res.status(400).send("Invalid signature")

  const event = JSON.parse(req.body)
  console.log(event.event, event.data)
  res.sendStatus(200) // respond quickly; do heavy work asynchronously
})`

export function ApiDocs({ slug, appUrl }: { slug: string; appUrl: string }) {
  const base = `${appUrl}/api/w/${slug}`
  const listCurl = `curl ${base}/conversations \\
  -H "Authorization: Bearer dsp_..."`
  const payload = `{
  "id": "evt_Qm9vX2V4YW1wbGU",
  "event": "conversation.assigned",
  "createdAt": "2026-09-27T09:41:00.000Z",
  "data": {
    "conversationId": "3f0c2a4e-…"
  }
}`

  return (
    <SettingsSection
      id="docs"
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" /> Quickstart
        </span>
      }
      description="Everything you need to make your first request and receive your first event."
    >
      <Tabs defaultValue="api" className="gap-4">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="api">REST API</TabsTrigger>
          <TabsTrigger value="events">Webhook events</TabsTrigger>
          <TabsTrigger value="verify">Verify signatures</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="flex flex-col gap-3">
          <p className="text-[13px] text-pretty text-muted-foreground">
            Send the key as a Bearer token. The base URL for this workspace is <Code>{base}</Code>. Responses are JSON; errors
            use <Code>{`{ "error": { "code", "message" } }`}</Code> with a matching HTTP status.
          </p>
          <CodeBlock label="bash" code={listCurl} />
          <p className="text-xs text-muted-foreground">
            Keys see exactly what their creator can see (inbox access and role), limited further by the key&apos;s permissions.
          </p>
        </TabsContent>

        <TabsContent value="events" className="flex flex-col gap-3">
          <p className="text-[13px] text-pretty text-muted-foreground">
            Each delivery is an HTTP <Code>POST</Code> with a JSON body. Respond with any <Code>2xx</Code> status to acknowledge;
            other responses and timeouts are retried with exponential backoff. The shape of <Code>data</Code> depends on the event;
            use <Code>id</Code> to deduplicate retried deliveries.
          </p>
          <CodeBlock label="json" code={payload} />
        </TabsContent>

        <TabsContent value="verify" className="flex flex-col gap-3">
          <p className="text-[13px] text-pretty text-muted-foreground">
            Every delivery carries <Code>X-Dispatch-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</Code> where <Code>v1</Code> is the
            HMAC-SHA256 of <Code>{"<t>.<raw body>"}</Code> keyed with the endpoint&apos;s signing secret. Compare in constant time and
            reject timestamps older than 5 minutes.
          </p>
          <CodeBlock label="Node.js" code={VERIFY_SNIPPET} maxHeight={360} />
          <CodeBlock label="Express" code={EXPRESS_SNIPPET} maxHeight={320} />
        </TabsContent>
      </Tabs>
    </SettingsSection>
  )
}
