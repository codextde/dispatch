import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, Users } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import { listUsers } from "@/server/admin/users"
import { UserAvatar } from "@/components/app/user-avatar"
import { AdminPageHeader, DataTable, EmptyState, StatusBadge, Td, Th, formatNumber } from "@/components/admin/ui"
import { FilterSelect, Pager, SearchParamInput } from "@/components/admin/client"
import { formatDate, timeAgo } from "@/components/admin/format"

export const metadata: Metadata = { title: "Users" }

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { user: me } = await requireSuperAdminPage()
  const sp = await searchParams
  const q = first(sp.q) ?? ""
  const filter = first(sp.filter)
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1)
  const { rows, total, pageSize } = await listUsers({ q, filter, page })
  const filtered = Boolean(q || filter)

  return (
    <>
      <AdminPageHeader
        eyebrow="Instance"
        title="Users"
        quiet="and their access"
        description={`${formatNumber(total)} ${total === 1 ? "account" : "accounts"}${filtered ? " match your filters" : ""}. Grant super admin access, disable accounts, revoke sessions or impersonate to help with support.`}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchParamInput placeholder="Search name or email…" />
        <FilterSelect
          param="filter"
          label="Show"
          options={[
            { value: "super_admins", label: "Super admins" },
            { value: "active", label: "Active" },
            { value: "disabled", label: "Disabled" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState icon={Users} title={filtered ? "No users match" : "No users yet"} description="Try a different search or clear the filter." />
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar name={u.name} email={u.email} src={u.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{u.name || u.email}</span>
                      {u.id === me.id && <span className="text-[11px] text-muted-foreground">(you)</span>}
                    </div>
                    {u.name && <div className="truncate text-[12.5px] text-muted-foreground">{u.email}</div>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {u.isSuperAdmin && (
                        <StatusBadge tone="brand" dot={false}>
                          Super admin
                        </StatusBadge>
                      )}
                      {u.status === "disabled" && <StatusBadge tone="error">Disabled</StatusBadge>}
                      <span className="text-[12px] text-muted-foreground">
                        {u.workspaces} {u.workspaces === 1 ? "workspace" : "workspaces"} · seen {timeAgo(u.lastSeenAt, "never")}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>

          <DataTable className="hidden md:block">
            <thead>
              <tr>
                <Th>User</Th>
                <Th className="text-right">Workspaces</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Sessions</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="relative transition-colors hover:bg-surface/60">
                  <Td>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={u.name} email={u.email} src={u.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="block max-w-[260px] truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          {u.name || u.email}
                          {u.id === me.id && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(you)</span>}
                        </Link>
                        {u.name && <div className="max-w-[260px] truncate text-[12px] text-muted-foreground">{u.email}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{formatNumber(u.workspaces)}</Td>
                  <Td>
                    {u.isSuperAdmin ? (
                      <StatusBadge tone="brand" dot={false}>
                        Super admin
                      </StatusBadge>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">User</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge tone={u.status === "active" ? "ok" : "error"}>{u.status === "active" ? "Active" : "Disabled"}</StatusBadge>
                  </Td>
                  <Td className="text-[13px] whitespace-nowrap text-muted-foreground">{timeAgo(u.lastSeenAt, "Never")}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(u.sessions)}</Td>
                  <Td className="text-[13px] whitespace-nowrap text-muted-foreground">{formatDate(u.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      {total > pageSize && <Pager page={page} pageSize={pageSize} total={total} />}
    </>
  )
}
