import Link from "next/link"
import { eq } from "drizzle-orm"
import { requireOrgPage } from "@/server/authz"
import { listUserOrganizations } from "@/server/orgs"
import { getSettings } from "@/server/settings"
import { db, schema } from "@/server/db"
import { OrgProvider } from "@/components/app/org-provider"

/**
 * Workspace shell: authenticates the member, provides the client-side org
 * context, and shows lock/impersonation banners. Area layouts (mail, settings,
 * analytics ...) render their own navigation.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const [workspaces, branding, general] = await Promise.all([
    listUserOrganizations(ctx.user.id),
    getSettings("branding"),
    getSettings("general"),
  ])

  // Remember last visited workspace for next sign-in
  if (ctx.user.preferences?.lastOrgSlug !== slug) {
    await db
      .update(schema.users)
      .set({ preferences: { ...ctx.user.preferences, lastOrgSlug: slug } })
      .where(eq(schema.users.id, ctx.user.id))
  }

  const value = {
    org: {
      id: ctx.org.id,
      name: ctx.org.name,
      slug: ctx.org.slug,
      logoUrl: ctx.org.logoUrl,
      plan: ctx.org.plan,
      subscriptionStatus: ctx.org.subscriptionStatus,
      trialEndsAt: ctx.org.trialEndsAt?.toISOString() ?? null,
      features: { chat: ctx.org.settings.features?.chat !== false },
      navigation: {
        hiddenItems: ctx.org.settings.navigation?.hiddenItems ?? [],
        hiddenSections: ctx.org.settings.navigation?.hiddenSections ?? [],
      },
    },
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      avatarUrl: ctx.user.avatarUrl,
      isSuperAdmin: ctx.user.isSuperAdmin,
      timezone: ctx.user.timezone,
      preferences: ctx.user.preferences as Record<string, unknown>,
    },
    role: { id: ctx.role.id, key: ctx.role.key, name: ctx.role.name },
    permissions: [...ctx.permissions],
    locked: ctx.locked,
    impersonating: Boolean(ctx.session.impersonatorId),
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug, logoUrl: w.logoUrl })),
    productName: branding.productName || general.instanceName,
  }
  const it = ctx.user.locale === "it"
  const lockedMessage = !ctx.locked ? null : it
    ? ctx.locked.message === "Your free trial has ended. Subscribe to keep using this workspace."
      ? "Il periodo di prova è terminato. Abbonati per continuare a usare questo workspace."
      : ctx.locked.message === "This workspace has no active subscription. Subscribe to continue."
        ? "Questo workspace non ha un abbonamento attivo. Abbonati per continuare."
        : ctx.locked.message === "This workspace has been suspended by the instance administrator."
          ? "Questo workspace è stato sospeso dall’amministratore dell’istanza."
          : ctx.locked.message
    : ctx.locked.message

  return (
    <OrgProvider value={value}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        {value.impersonating && (
          <div className="flex shrink-0 items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-xs font-medium text-black">
            {it ? `Stai impersonando ${ctx.user.email}.` : `You are impersonating ${ctx.user.email}.`}
            <form action="/admin/impersonate/stop" method="post">
              <button className="underline underline-offset-2">{it ? "Termina impersonificazione" : "Stop impersonating"}</button>
            </form>
          </div>
        )}
        {ctx.locked && (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200">
            <span>{lockedMessage} {it ? "Il workspace è in sola lettura." : "The workspace is read-only."}</span>
            {ctx.locked.reason === "billing" && ctx.permissions.has("billing.manage") && (
              <Link href={`/w/${slug}/settings/billing`} className="font-semibold underline underline-offset-2">
                {it ? "Abbonati ora" : "Subscribe now"}
              </Link>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </OrgProvider>
  )
}
