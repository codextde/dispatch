import "server-only"
import nodemailer from "nodemailer"
import { getSettings, readSecret } from "@/server/settings"
import { getAppUrl, getDomain } from "@/server/env"
import { renderEmailLayout } from "@/server/mail/system-mailer"
import type { EmailConfigInput } from "@/server/admin/settings"

/**
 * Send a test email with a (possibly unsaved) delivery configuration so admins
 * can verify SMTP / SES credentials before saving them.
 *
 * `password` undefined → use the stored password; "" → no password.
 */
export async function sendTestEmail(opts: {
  config: EmailConfigInput
  password?: string
  to: string
}): Promise<{ ok: true; delivered: boolean; message: string } | { ok: false; error: string }> {
  const { config, to } = opts
  const [stored, general, branding] = await Promise.all([getSettings("email"), getSettings("general"), getSettings("branding")])
  const productName = branding.productName || general.instanceName
  const fromEmail = config.fromEmail || `no-reply@${getDomain().replace(/:\d+$/, "")}`
  const fromName = config.fromName || productName

  const subject = `Test email from ${productName}`
  const text = `This is a test email from ${productName} (${getAppUrl()}).\n\nIf you can read this, system email delivery is working.`
  const html = renderEmailLayout({
    productName,
    preheader: "Email delivery is working",
    heading: "Email delivery works",
    body: `<p style="margin:0">This is a test email from <strong>${escapeHtml(productName)}</strong>. Sign-in links, invitations and notifications will be delivered through this configuration.</p>`,
    footer: `Sent via ${config.provider === "ses" ? `Amazon SES (${escapeHtml(config.sesRegion)})` : escapeHtml(config.host)} · ${escapeHtml(getAppUrl())}`,
  })

  if (config.provider === "log") {
    console.log(
      [
        "",
        "┌──────────────────────── Dispatch test email (not delivered) ───────────────────",
        `│ Email provider is "log" — configure SMTP or Amazon SES to deliver emails.`,
        `│ To:      ${to}`,
        `│ Subject: ${subject}`,
        "│",
        ...text.split("\n").map((l) => `│ ${l}`),
        "└────────────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    )
    return { ok: true, delivered: false, message: "Printed to the server logs (no email provider configured)." }
  }

  const host = config.provider === "ses" ? `email-smtp.${config.sesRegion}.amazonaws.com` : config.host
  if (!host) return { ok: false, error: "Enter the SMTP host." }
  if (config.provider === "ses" && !config.fromEmail) {
    return { ok: false, error: "Amazon SES requires a verified sender address in “From email”." }
  }
  // The stored password is only ever sent to the saved server/account, never to a host typed into the form
  const sameTarget =
    config.provider === stored.provider &&
    config.user === stored.user &&
    (config.provider === "ses" ? config.sesRegion === stored.sesRegion : config.host === stored.host)
  if (opts.password === undefined && stored.passwordEnc && config.user && !sameTarget) {
    return { ok: false, error: "You changed the server or username — enter the password again to test it." }
  }
  const password = opts.password !== undefined ? opts.password : (readSecret(stored.passwordEnc) ?? "")
  const port = config.port || 587

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465 ? true : config.secure,
    auth: config.user ? { user: config.user, pass: password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  })
  try {
    await transport.verify()
    const info = await transport.sendMail({
      from: { name: fromName, address: fromEmail },
      to,
      replyTo: config.replyTo || undefined,
      subject,
      text,
      html,
    })
    return { ok: true, delivered: true, message: `Sent to ${to}${info.messageId ? ` (${info.messageId})` : ""}.` }
  } catch (err) {
    return { ok: false, error: describeSmtpError(err) }
  } finally {
    transport.close()
  }
}

function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string }
  if (e?.code === "EAUTH") return `Authentication failed${e.response ? `: ${e.response}` : ". Check the username and password."}`
  if (e?.code === "ECONNECTION" || e?.code === "ETIMEDOUT" || e?.code === "ESOCKET")
    return `Could not connect to the mail server (${e.code}). Check host, port and security settings.`
  if (e?.code === "EDNS" || e?.code === "ENOTFOUND") return "The mail server host could not be resolved."
  if (e?.responseCode && e.response) return `The server rejected the message: ${e.response}`
  return e?.message || "Sending failed"
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}
