export const GITHUB_REPO = "codextde/dispatch"
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`
export const GITHUB_DISCUSSIONS_URL = `${GITHUB_URL}/discussions`
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`
export const GITHUB_SECURITY_URL = `${GITHUB_URL}/security/advisories/new`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`

export const COMPANY = "Codext GmbH"
export const COMPANY_COUNTRY = "Germany"

/** Where the primary CTAs go. The login page handles sign-up and forwards signed-in users. */
export const APP_ENTRY = "/login"

/** Mail providers shown in the "Works with" strip — rendered as text wordmarks, never logos. */
export const PROVIDERS = [
  { name: "Gmail", style: "font-medium" },
  { name: "Google Workspace", style: "font-normal" },
  { name: "Outlook", style: "font-semibold tracking-tight" },
  { name: "Microsoft 365", style: "font-normal" },
  { name: "iCloud Mail", style: "font-medium tracking-tight" },
  { name: "Fastmail", style: "font-semibold" },
  { name: "Zoho Mail", style: "font-medium" },
  { name: "Any IMAP / SMTP", style: "font-mono text-[13px] uppercase tracking-wider" },
] as const
