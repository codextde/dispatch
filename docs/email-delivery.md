# Email delivery (system emails)

Dispatch sends a few emails itself: sign-in links and codes, workspace invitations, and notifications about mentions and assignments. These **system emails** are separate from your team's mail: replies to customers always go out through the SMTP server of the connected inbox ([Connecting inboxes](connecting-inboxes.md)).

Configure system emails in **Admin → Settings → Email**. There are three providers:

| Provider | Use it when |
| --- | --- |
| **Log** (default) | Trying Dispatch out. Emails aren't sent but printed to the logs (`docker compose logs -f app worker`). |
| **SMTP** | You have any SMTP service: Postmark, Mailgun, Brevo, Resend, SendGrid, your own server, or a Microsoft 365 / Google Workspace mailbox. |
| **Amazon SES** | You want cheap, high-volume, reliable delivery on AWS. Dispatch uses the SES SMTP interface. |

After saving, use **Send test email** and check the recipient's spam folder once. If the test lands in spam, fix SPF/DKIM/DMARC before inviting your team.

## Sender address and DNS

Use a sender on a domain you control, e.g. `Dispatch <no-reply@mail.example.com>` or `no-reply@example.com`. Whatever provider you choose, publish these DNS records for the sender domain. Your provider shows the exact values.

| Record | Purpose | Example |
| --- | --- | --- |
| **SPF** (`TXT` on the domain or MAIL FROM subdomain) | Which servers may send for the domain | `v=spf1 include:amazonses.com ~all` |
| **DKIM** (`CNAME`/`TXT`, from your provider) | Cryptographic signature of each message | `abc._domainkey` → `abc.dkim.amazonses.com` |
| **DMARC** (`TXT` on `_dmarc`) | Policy when SPF/DKIM fail + reports | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` |

Only one SPF record may exist per name. Merge `include:` entries into the existing record instead of adding a second one. Start DMARC with `p=none`, then tighten to `quarantine` once reports look clean.

## SMTP

In **Admin → Settings → Email**, choose **SMTP** and fill in:

| Field | Typical value |
| --- | --- |
| Host | e.g. `smtp.postmarkapp.com`, `smtp.eu.mailgun.org`, `smtp-relay.brevo.com` |
| Port | `587` (STARTTLS) or `465` (TLS) |
| Secure (TLS) | **Off** for 587 (the connection is upgraded with STARTTLS), **on** for 465 |
| Username / password | SMTP credentials or API token from your provider |
| From name / From email | e.g. `Acme Support` / `no-reply@example.com` (must be a verified sender at your provider) |
| Reply-to | Optional, e.g. `support@example.com` |

> Some hosting providers block outgoing SMTP ports on new servers (often 25 and 465, sometimes 587). If the connection times out, ask your provider to unblock the port or use an alternative port your email service offers, such as 2525.

## Amazon SES

SES is configured in the AWS console once. Dispatch then only needs the region and SMTP credentials.

### 1. Verify your domain

1. Open the [SES console](https://console.aws.amazon.com/ses/) in the region you want to send from (e.g. `eu-central-1`, Frankfurt).
2. **Configuration → Identities → Create identity → Domain**, enter `example.com`.
3. Keep **Easy DKIM** with RSA 2048-bit selected and create the identity.
4. Add the three DKIM `CNAME` records SES shows to your DNS. If your DNS is on Route 53, SES can add them for you.
5. Optional but recommended: under **Custom MAIL FROM domain**, use a subdomain such as `bounce.example.com` and add the `MX` and SPF `TXT` records SES shows. This aligns SPF with your domain for DMARC.
6. Wait until the identity status is **Verified**, usually a few minutes.

### 2. Create SMTP credentials

1. In SES, open **SMTP settings** and note the endpoint, e.g. `email-smtp.eu-central-1.amazonaws.com`.
2. Click **Create SMTP credentials**. This creates an IAM user allowed to send via SES.
3. Copy the **SMTP username and SMTP password**. The SMTP password is shown only once, and it is *not* the IAM secret access key.

### 3. Leave the sandbox

New SES accounts are in the *sandbox*: you can only send to verified addresses, with a low daily limit. Request production access in **Account dashboard → Request production access**:

- Mail type: **Transactional**
- Use case: e.g. "Sign-in links, invitations and notification emails for our team's Dispatch instance, sent only to registered users. Bounces and complaints are handled via SES notifications."

Approval usually takes up to a day. Until then, verify your own address under Identities to test.

### 4. Configure Dispatch

In **Admin → Settings → Email**, choose **Amazon SES** and enter:

| Field | Value |
| --- | --- |
| Region | The SES region from step 1, e.g. `eu-central-1` |
| Username / password | The SMTP credentials from step 2 |
| Port | `587` (default) |
| From email | An address on the verified domain, e.g. `no-reply@example.com` |

Dispatch connects to `email-smtp.<region>.amazonaws.com` automatically. Send a test email.

## Troubleshooting

- **Nothing arrives and the logs show the email:** the provider is still set to *Log*.
- **`Invalid login` / `535 Authentication Credentials Invalid`:** wrong username/password. For SES, make sure you use SMTP credentials of the same region.
- **`Email address is not verified` (SES):** your account is still in the sandbox, or the From address isn't on a verified identity.
- **Timeouts:** outbound SMTP ports are blocked by the hosting provider or firewall (see above).
- **Lands in spam:** check SPF, DKIM and DMARC with a tool such as [mail-tester.com](https://www.mail-tester.com), and avoid a From address on a domain without DKIM.
