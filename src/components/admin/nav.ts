import {
  Activity,
  Bot,
  Building2,
  CreditCard,
  Globe,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Mail,
  Palette,
  Scale,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react"

/** Navigation of the super admin panel (shared by the sidebar, mobile sheet and settings sub-nav). */
export type AdminNavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean }

export const ADMIN_NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Instance",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: ScrollText },
      { href: "/admin/system", label: "System", icon: Activity },
    ],
  },
]

export type SettingsSectionSlug =
  | "general"
  | "authentication"
  | "email"
  | "oauth"
  | "billing"
  | "storage"
  | "ai"
  | "branding"
  | "security"
  | "legal"

export const SETTINGS_SECTIONS: { slug: SettingsSectionSlug; label: string; description: string; icon: LucideIcon }[] = [
  { slug: "general", label: "General", description: "Instance name, mode and announcements", icon: Settings2 },
  { slug: "authentication", label: "Authentication", description: "Sign-up policy, sessions and social login", icon: KeyRound },
  { slug: "email", label: "Email delivery", description: "SMTP or Amazon SES for system emails", icon: Mail },
  { slug: "oauth", label: "OAuth apps", description: "Google and Microsoft app credentials", icon: Globe },
  { slug: "billing", label: "Billing", description: "Stripe subscriptions for hosted workspaces", icon: CreditCard },
  { slug: "storage", label: "Storage", description: "Local disk or S3-compatible attachment storage", icon: HardDrive },
  { slug: "ai", label: "AI", description: "Model provider for AI features", icon: Bot },
  { slug: "branding", label: "Branding", description: "Product name, logo and accent color", icon: Palette },
  { slug: "security", label: "Security", description: "Network policy, rate limits and sessions", icon: ShieldCheck },
  { slug: "legal", label: "Legal", description: "Imprint, privacy policy and terms", icon: Scale },
]

export function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}
