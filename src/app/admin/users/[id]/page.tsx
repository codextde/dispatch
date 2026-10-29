import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { UAParser } from "ua-parser-js"
import { AlertTriangle, Building2, History, KeyRound, UserRound } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import { getUserDetail } from "@/server/admin/users"
import { UserAvatar } from "@/components/app/user-avatar"
import { AdminPageHeader, EmptyState, KeyValueList, MicroLabel, Panel, StatusBadge } from "@/components/admin/ui"
import { PostButton } from "@/components/admin/client"
import { LocalTime } from "@/components/app/local-time"
import {
  AccountStatusControl,
  DeleteUserControl,
  SessionsList,
  SuperAdminControl,
  type SessionItem,
} from "@/components/admin/users/user-controls"
import { CredentialsControl } from "@/components/admin/users/credentials-control"
import { localizeRoleName } from "@/lib/i18n"

export async function generateMetadata({ params }: PageProps<"/admin/users/[id]">): Promise<Metadata> {
  await requireSuperAdminPage()
  const { id } = await params
  const detail = await getUserDetail(id)
  return { title: detail ? `${detail.user.name || detail.user.email} · Users` : "User" }
}

const IMPERSONATE_ERRORS: Record<string, string> = {
  self: "You can't impersonate yourself.",
  disabled: "Disabled accounts can't be impersonated. Enable the account first.",
  super_admin: "Other super admins can't be impersonated.",
}

export default async function AdminUserDetailPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { user: me, session: mySession } = await requireSuperAdminPage()
  const it = me.locale === "it"
  const { id } = await params
  const sp = await searchParams
  const detail = await getUserDetail(id)
  if (!detail) notFound()
  const { user, memberships, sessions, events, soleOwned, activeSuperAdmins } = detail

  const isSelf = user.id === me.id
  const impersonateError = typeof sp.impersonate_error === "string" ? (it ? ({ self: "Non puoi accedere come te stesso.", disabled: "Non puoi accedere come un account disattivato. Riattiva prima l’account.", super_admin: "Non puoi accedere come un altro super amministratore." }[sp.impersonate_error] ?? IMPERSONATE_ERRORS[sp.impersonate_error]) : IMPERSONATE_ERRORS[sp.impersonate_error]) : undefined
  const lastActiveSuperAdmin = user.isSuperAdmin && user.status === "active" && activeSuperAdmins <= 1

  const superAdminBlocked = user.isSuperAdmin
    ? isSelf
      ? (it ? "Non puoi rimuovere il tuo accesso da super amministratore." : "You can't remove your own super admin access.")
      : lastActiveSuperAdmin
        ? (it ? "Questo è l’ultimo super amministratore attivo." : "This is the last active super admin.")
        : null
    : user.status !== "active"
      ? (it ? "Riattiva prima l’account." : "Enable the account first.")
      : null
  const statusBlocked =
    user.status === "active" ? (isSelf ? (it ? "Non puoi disattivare il tuo account." : "You can't disable your own account.") : lastActiveSuperAdmin ? (it ? "Questo è l’ultimo super amministratore attivo." : "This is the last active super admin.") : null) : null
  const deleteBlocked = isSelf
    ? (it ? "Non puoi eliminare il tuo account." : "You can't delete your own account.")
    : lastActiveSuperAdmin
      ? (it ? "Questo è l’ultimo super amministratore e non può essere eliminato." : "This is the last super admin and can't be deleted.")
      : soleOwned.length
        ? (it ? "Trasferisci prima la proprietà di questi workspace:" : "Transfer ownership of these workspaces first:")
        : null

  const sessionItems: SessionItem[] = sessions.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel || (it ? "Dispositivo sconosciuto" : "Unknown device"),
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    impersonation: Boolean(s.impersonatorId),
    current: s.id === mySession.id,
    mobile: s.userAgent ? ["mobile", "tablet"].includes(new UAParser(s.userAgent).getResult().device.type ?? "") : false,
  }))

  const canImpersonate = !isSelf && user.status === "active" && !user.isSuperAdmin

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/users", label: it ? "Utenti" : "Users" }}
        eyebrow={it ? "Utente" : "User"}
        title={user.name || user.email}
        quiet={user.name ? user.email : undefined}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            {user.isSuperAdmin && (
              <StatusBadge tone="brand" dot={false}>
                {it ? "Super amministratore" : "Super admin"}
              </StatusBadge>
            )}
            <StatusBadge tone={user.status === "active" ? "ok" : "error"}>{user.status === "active" ? (it ? "Attivo" : "Active") : (it ? "Disattivato" : "Disabled")}</StatusBadge>
            <span className="text-muted-foreground">
              · {it ? "iscritto" : "joined"} <LocalTime date={user.createdAt} format="relative" titleFormat="datetime" /> · {it ? "ultimo accesso" : "last seen"}{" "}
              <LocalTime date={user.lastSeenAt} format="relative" titleFormat="datetime" fallback={it ? "mai" : "never"} />
            </span>
          </span>
        }
        actions={
          <>
            <UserAvatar name={user.name} email={user.email} src={user.avatarUrl} size="lg" className="hidden sm:flex" />
            {canImpersonate && (
              <PostButton action={`/admin/impersonate/${user.id}`} variant="default">
                <UserRound /> {it ? "Accedi come utente" : "Impersonate"}
              </PostButton>
            )}
          </>
        }
      />

      {impersonateError && (
        <div role="alert" className="mb-6 flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" /> {impersonateError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel title={it ? "Profilo" : "Profile"}>
            <KeyValueList
              items={[
                { label: it ? "ID utente" : "User ID", value: user.id, mono: true },
                { label: "Email", value: user.email },
                { label: it ? "Nome" : "Name", value: user.name || <span className="text-muted-foreground">{it ? "Non impostato" : "Not set"}</span> },
                { label: it ? "Fuso orario" : "Time zone", value: user.timezone || <span className="text-muted-foreground">{it ? "Predefinito istanza" : "Instance default"}</span> },
                { label: it ? "Creato" : "Created", value: <LocalTime date={user.createdAt} /> },
                {
                  label: it ? "Ultimo accesso" : "Last seen",
                  value: user.lastSeenAt ? (
                    <>
                      <LocalTime date={user.lastSeenAt} /> (<LocalTime date={user.lastSeenAt} format="relative" />)
                    </>
                  ) : (
                    it ? "Mai" : "Never"
                  ),
                },
                ...(user.awayUntil && user.awayUntil > new Date() ? [{ label: it ? "Assente fino al" : "Away until", value: <LocalTime date={user.awayUntil} /> }] : []),
              ]}
            />
          </Panel>

          <Panel title={it ? "Credenziali di accesso" : "Login credentials"} description={it ? "Modifica l’email di accesso o imposta una password locale. L’accesso con codice email resta disponibile." : "Change the login email or set a local password. The existing email-code login remains available."}>
            <CredentialsControl id={user.id} email={user.email} />
          </Panel>

          <Panel title="Workspace" description={it ? `Membro di ${memberships.length} workspace` : `Member of ${memberships.length} ${memberships.length === 1 ? "workspace" : "workspaces"}`} bodyClassName="p-0">
            {memberships.length === 0 ? (
              <EmptyState icon={Building2} title={it ? "Nessun workspace" : "No workspaces"} description={it ? "Questa persona non ha ancora creato né aderito a un workspace." : "This person hasn't joined or created a workspace yet."} />
            ) : (
              <ul className="divide-y divide-border">
                {memberships.map((m) => (
                  <li key={m.orgId}>
                    <Link
                      href={`/admin/workspaces/${m.orgId}`}
                      className="flex items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-surface/60 focus-visible:bg-surface md:px-5"
                    >
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background"
                      >
                        {(m.orgName.trim()[0] ?? "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.orgName}</div>
                        <div className="truncate font-mono text-[12px] text-muted-foreground">
                          /{m.orgSlug} · {it ? "iscritto" : "joined"} <LocalTime date={m.joinedAt} format="relative" titleFormat="datetime" />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        {m.suspendedAt && <StatusBadge tone="error">{it ? "Sospeso" : "Suspended"}</StatusBadge>}
                        {m.status !== "active" && <StatusBadge tone="warn">{it ? "Appartenenza sospesa" : "Membership suspended"}</StatusBadge>}
                        <StatusBadge tone={m.roleKey === "owner" ? "brand" : "neutral"} dot={false}>
                          {localizeRoleName(m.roleKey, m.roleName, it ? "it" : "en")}
                        </StatusBadge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={it ? "Sessioni attive" : "Active sessions"}
            description={it ? `${sessions.length} ${sessions.length === 1 ? "dispositivo connesso" : "dispositivi connessi"}. Le sessioni durano un anno e si rinnovano durante l’uso.` : `${sessions.length} signed-in ${sessions.length === 1 ? "device" : "devices"}. Sessions last one year and renew while in use.`}
            bodyClassName="p-0"
          >
            {sessions.length === 0 ? (
              <EmptyState icon={KeyRound} title={it ? "Nessun accesso attivo" : "Not signed in anywhere"} />
            ) : (
              <SessionsList userId={user.id} sessions={sessionItems} isSelf={isSelf} />
            )}
          </Panel>

          <Panel title={it ? "Attività recente" : "Recent activity"} description={it ? "Ultimi 20 eventi di registro di questo utente" : "Last 20 audit events by this user"} bodyClassName="p-0">
            {events.length === 0 ? (
              <EmptyState icon={History} title={it ? "Nessuna attività registrata" : "No recorded activity"} />
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 md:px-5">
                    <code className="w-fit shrink-0 rounded-sm border border-border bg-surface px-1.5 py-px font-mono text-[11.5px]">{e.action}</code>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                      {e.orgName ? (
                        <Link href={`/admin/workspaces/${e.orgId}`} className="hover:text-foreground hover:underline">
                          {e.orgName}
                        </Link>
                      ) : (
                        it ? "Istanza" : "Instance"
                      )}
                      {e.targetType && ` · ${e.targetType}`}
                      {e.ip && ` · ${e.ip}`}
                    </span>
                    <LocalTime date={e.createdAt} format="relative" titleFormat="datetime" className="shrink-0 text-[12px] text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Panel title={it ? "Accesso" : "Access"} description={it ? "Permessi dell’istanza e accesso" : "Instance-level permissions and sign-in"}>
            <div className="grid gap-3">
              <SuperAdminControl id={user.id} email={user.email} isSuperAdmin={user.isSuperAdmin} blockedReason={superAdminBlocked} />
              <AccountStatusControl id={user.id} email={user.email} status={user.status} blockedReason={statusBlocked} />
              {!canImpersonate && !isSelf && (
                <p className="text-xs text-muted-foreground">
                  {user.isSuperAdmin ? (it ? "Non è possibile accedere come un super amministratore." : "Super admins can't be impersonated.") : (it ? "Non è possibile accedere come un account disattivato." : "Disabled accounts can't be impersonated.")}
                </p>
              )}
            </div>
          </Panel>

          <section className="rounded-lg border border-destructive/30 bg-card">
            <header className="border-b border-destructive/20 px-4 py-3 md:px-5">
              <MicroLabel className="text-destructive">{it ? "Zona pericolosa" : "Danger zone"}</MicroLabel>
            </header>
            <div className="p-4 md:p-5">
              <DeleteUserControl
                id={user.id}
                email={user.email}
                blockedReason={deleteBlocked}
                soleOwned={soleOwned.map((w) => ({ id: w.id, name: w.name }))}
              />
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
