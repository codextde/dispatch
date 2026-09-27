import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { getAppUrl } from "@/server/env"
import { WEBHOOK_EVENTS } from "@/server/jobs"
import { loadApiKeys, loadWebhooks } from "@/server/workspace/queries/integrations"
import { SettingsPage } from "@/components/settings/settings-ui"
import { ApiKeysSection } from "@/components/settings/integrations/api-keys"
import { WebhooksSection } from "@/components/settings/integrations/webhooks"
import { ApiDocs } from "@/components/settings/integrations/api-docs"

export const metadata: Metadata = { title: "API & webhooks" }

export default async function IntegrationsPage({ params }: PageProps<"/w/[slug]/settings/integrations">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "integrations.manage")
  const [keys, webhooks] = await Promise.all([loadApiKeys(ctx.org.id), loadWebhooks(ctx.org.id)])
  const appUrl = getAppUrl()
  // Request time, so key status (expired or not) is computed consistently on server and client
  const now = new Date().getTime()

  return (
    <SettingsPage
      eyebrow="Developers"
      title="API & webhooks"
      quiet="— connect Dispatch to your stack."
      description="Create API keys for the REST API and stream workspace events to your own services."
    >
      <ApiKeysSection slug={ctx.org.slug} keys={keys} appUrl={appUrl} now={now} />
      <WebhooksSection slug={ctx.org.slug} webhooks={webhooks} events={WEBHOOK_EVENTS} />
      <ApiDocs slug={ctx.org.slug} appUrl={appUrl} />
    </SettingsPage>
  )
}
