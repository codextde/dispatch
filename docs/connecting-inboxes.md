# Connecting inboxes

Dispatch doesn't host email. It works on top of mailboxes you already have: Gmail and Google Workspace, Outlook and Microsoft 365, or any provider with IMAP and SMTP. The worker syncs mail over IMAP and sends replies through the mailbox's own SMTP server, so sent mail looks exactly like mail sent from any other client and lands in the mailbox's Sent folder.

Connect an inbox in **Workspace → Settings → Inboxes → Connect inbox**:

- **Shared inbox** (e.g. `support@`): needs the *Manage shared inboxes* permission. Access is then granted to people or teams with read, reply or manage rights.
- **Personal inbox:** needs the *Connect personal inboxes* permission. Only you can see it unless you share it.

There are three ways to connect:

| Method | Best for | Needs |
| --- | --- | --- |
| **Sign in with Google** | Gmail and Google Workspace | A Google OAuth app configured by the instance admin ([below](#google-oauth-app)) |
| **Sign in with Microsoft** | Outlook.com and Microsoft 365 | A Microsoft Entra app configured by the instance admin ([below](#microsoft-entra-app)) |
| **IMAP / SMTP** | Everything else, or Gmail with an app password | Server settings and a password (often an app password) |

## IMAP / SMTP

Pick a preset or enter the servers yourself. The presets fill in these values:

| Provider | IMAP | SMTP | Notes |
| --- | --- | --- | --- |
| Gmail / Google Workspace | `imap.gmail.com:993` TLS | `smtp.gmail.com:465` TLS | Needs 2-Step Verification and an [app password](https://myaccount.google.com/apppasswords). Workspace admins can disable app passwords, in which case use Sign in with Google. |
| Outlook / Microsoft 365 | `outlook.office365.com:993` TLS | `smtp.office365.com:587` STARTTLS | Microsoft 365 has turned off password (basic) authentication for IMAP, so use Sign in with Microsoft. |
| iCloud Mail | `imap.mail.me.com:993` TLS | `smtp.mail.me.com:587` STARTTLS | Needs an app-specific password from [account.apple.com](https://account.apple.com). |
| Fastmail | `imap.fastmail.com:993` TLS | `smtp.fastmail.com:465` TLS | Use an app password. |
| Zoho Mail (EU) | `imap.zoho.eu:993` TLS | `smtp.zoho.eu:465` TLS | Enable IMAP access in Zoho first. Outside the EU use `imap.zoho.com` / `smtp.zoho.com`. |
| IONOS | `imap.ionos.de:993` TLS | `smtp.ionos.de:465` TLS | Use `.com` hostnames for IONOS US accounts. |
| Yahoo Mail | `imap.mail.yahoo.com:993` TLS | `smtp.mail.yahoo.com:465` TLS | Needs an app password. |

The username is usually the full email address. Dispatch tests the IMAP and SMTP login before saving. Credentials are stored encrypted (AES-256-GCM) and are never shown again.

> **Self-hosted mail servers on private IPs:** if *Admin → Settings → Security → Block private networks* is on (recommended for public SaaS instances), connections to private IP ranges such as `10.x`, `192.168.x` or `localhost` are refused. Turn it off on private instances that need to reach an internal mail server.

## Google OAuth app

One OAuth client serves both **Sign in with Google** (login) and **connecting Gmail inboxes**. Create it once per Dispatch instance in the [Google Cloud Console](https://console.cloud.google.com/).

1. **Create a project**, e.g. "Dispatch", or pick an existing one.
2. **Enable the Gmail API:** *APIs & Services → Library → Gmail API → Enable*. This makes the Gmail scope available on the consent screen.
3. **Configure the consent screen** (*Google Auth Platform*, formerly "OAuth consent screen"):
   - **Branding:** app name (e.g. "Acme Inbox"), support email, logo optional. Under *Authorized domains*, add your domain (`example.com`).
   - **Audience:**
     - **Internal:** only users of your Google Workspace organization. No Google verification needed. Best for company-internal instances.
     - **External:** anyone with a Google account. See the verification note below.
   - **Data access → Add or remove scopes:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `https://mail.google.com/`.
4. **Create the client:** *Clients → Create client → Web application*:
   - Authorized redirect URI: `https://<DOMAIN>/api/oauth/google/callback`
5. Copy the **Client ID** and **Client secret** into **Admin → Settings → OAuth → Google** (`/admin/settings/oauth`) and enable it. The page shows the exact redirect URI with a copy button. To offer Google login, also switch on *Sign in with Google* in **Admin → Settings → Sign-in**. This switch becomes available once the OAuth app is configured.

What Dispatch requests:

| Purpose | Scopes |
| --- | --- |
| Sign in | `openid email profile` |
| Connect a Gmail inbox | `openid email profile https://mail.google.com/` (offline access, so the worker can refresh tokens) |

**About verification:** `https://mail.google.com/` is a *restricted* scope.

- **Internal:** apps work without verification.
- **External in "Testing":** up to 100 listed test users, and their authorization expires after 7 days, so inboxes have to be reconnected weekly. Fine for trying things out.
- **External in production:** requires Google's app verification, including a third-party security assessment for restricted scopes.

For a company instance, use *Internal*, or connect Gmail via IMAP with app passwords instead.

## Microsoft Entra app

One app registration serves both **Sign in with Microsoft** and **connecting Outlook / Microsoft 365 inboxes**. Create it in the [Microsoft Entra admin center](https://entra.microsoft.com/).

1. **App registrations → New registration**
   - Name: e.g. "Dispatch"
   - Supported account types:
     - *Accounts in any organizational directory and personal Microsoft accounts* for Microsoft 365 and Outlook.com (tenant `common` in Dispatch)
     - *Single tenant* if only your organization should connect (use your tenant ID in Dispatch)
   - Redirect URI: platform **Web**, `https://<DOMAIN>/api/oauth/microsoft/callback`
2. **Certificates & secrets → New client secret.** Copy the secret **Value** (not the Secret ID). Secrets expire, at most after 24 months, so set a reminder to rotate it.
3. **API permissions → Add a permission** (all *Delegated*):
   - *Microsoft Graph:* `openid`, `email`, `profile`, `offline_access`
   - *APIs my organization uses → Office 365 Exchange Online:* `IMAP.AccessAsUser.All`, `SMTP.Send`

   If your tenant requires admin approval, click **Grant admin consent**.
4. **Token configuration → Add optional claim → ID:** add `email` and `xms_edov`. *Sign in with Microsoft* only trusts the `email` claim of a work or school account when `xms_edov` says its domain is verified (the mutable `preferred_username` is never used to sign in). After the first sign-in, Dispatch recognizes the account by its tenant and object ID, and a super admin account is never linked by email alone: sign in with an email link first, then continue with Microsoft.
5. In Dispatch, open **Admin → Settings → OAuth → Microsoft** and enter:
   - The **Application (client) ID** and the client secret
   - The tenant: `common`, `organizations`, `consumers`, or your tenant ID

   Enable it. To offer Microsoft login, also switch on *Sign in with Microsoft* in **Admin → Settings → Sign-in**.

What Dispatch requests:

| Purpose | Scopes |
| --- | --- |
| Sign in | `openid email profile` |
| Connect an inbox | `openid email profile offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send` |

**Microsoft 365 mailbox settings.** IMAP and *Authenticated SMTP* must be enabled for every mailbox you connect. Tenants often disable SMTP AUTH by default. To enable them, go to *Microsoft 365 admin center → Users → Active users → (user) → Mail → Manage email apps* and check **IMAP** and **Authenticated SMTP**. Or use PowerShell:

```powershell
Set-CASMailbox -Identity support@example.com -ImapEnabled $true -SmtpClientAuthenticationDisabled $false
```

## Troubleshooting

| Error | Likely cause |
| --- | --- |
| `AUTHENTICATIONFAILED` / `Invalid credentials` | Wrong password, or the provider requires an app password or OAuth |
| `redirect_uri_mismatch` (Google) / `AADSTS50011` (Microsoft) | The redirect URI in the provider console must match `https://<DOMAIN>/api/oauth/<provider>/callback` exactly. Check `DOMAIN`. |
| `SmtpClientAuthentication is disabled for the Tenant` | Enable Authenticated SMTP for the mailbox (see above) |
| Gmail inbox disconnects after a week | The Google app is External and in *Testing* mode (see verification note) |
| Connection timeout | Firewall or provider blocks outbound IMAP (993) / SMTP (465/587) from your server |
