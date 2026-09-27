import "server-only"
import nodemailer from "nodemailer"
import { getSettings, readSecret } from "@/server/settings"
import { getAppUrl, getDomain } from "@/server/env"

/**
 * System emails (magic links, invitations, notifications) are delivered via
 * the instance SMTP configured in Admin → Email. Supports any SMTP server and
 * Amazon SES (SMTP interface). When no provider is configured, emails are
 * printed to the server logs so the instance still works out of the box.
 */

export type SystemEmail = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export async function getSystemTransport() {
  const cfg = await getSettings("email")
  if (cfg.provider === "log") return null
  const host = cfg.provider === "ses" ? `email-smtp.${cfg.sesRegion}.amazonaws.com` : cfg.host
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: cfg.port || 587,
    secure: cfg.port === 465 ? true : cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: readSecret(cfg.passwordEnc) ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  })
}

export async function isEmailDeliveryConfigured() {
  const cfg = await getSettings("email")
  return cfg.provider !== "log" && Boolean(cfg.provider === "ses" || cfg.host)
}

export async function sendSystemEmail(mail: SystemEmail): Promise<{ delivered: boolean }> {
  const cfg = await getSettings("email")
  const general = await getSettings("general")
  const transport = await getSystemTransport()
  const fromEmail = cfg.fromEmail || `no-reply@${getDomain().replace(/:\d+$/, "")}`
  const fromName = cfg.fromName || general.instanceName

  if (!transport) {
    console.log(
      [
        "",
        "┌──────────────────────── Dispatch email (not delivered) ────────────────────────",
        `│ Configure SMTP / Amazon SES in Admin → Email to deliver emails.`,
        `│ To:      ${mail.to}`,
        `│ Subject: ${mail.subject}`,
        "│",
        ...mail.text.split("\n").map((l) => `│ ${l}`),
        "└────────────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    )
    return { delivered: false }
  }

  await transport.sendMail({
    from: { name: fromName, address: fromEmail },
    to: mail.to,
    replyTo: mail.replyTo || cfg.replyTo || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  })
  return { delivered: true }
}

/* ------------------------------ Email templates ----------------------------- */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** Minimal, client-safe transactional layout matching the Dispatch brand. */
export function renderEmailLayout(opts: {
  productName: string
  preheader?: string
  heading: string
  body: string // HTML (already escaped where needed)
  cta?: { label: string; url: string }
  footer?: string
}) {
  const { productName, heading, body, cta, footer, preheader } = opts
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#FAF9F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#141414;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(preheader ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F5;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 0 24px 0;font-size:15px;font-weight:600;letter-spacing:-0.01em;">
<span style="display:inline-block;width:22px;height:22px;background:#141414;border-radius:5px;vertical-align:middle;margin-right:8px;text-align:center;line-height:22px;color:#4ade80;font-size:13px;">&#10148;</span>${esc(productName)}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #E7E5E0;border-radius:10px;padding:32px;">
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;">${esc(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#3f3f3f;">${body}</div>
${
  cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px 0;"><tr><td style="background:#141414;border-radius:6px;"><a href="${esc(cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${esc(cta.label)} &rarr;</a></td></tr></table>`
    : ""
}
</td></tr>
<tr><td style="padding:20px 4px 0 4px;font-size:12px;line-height:1.5;color:#8a8a8a;">${footer ?? ""}</td></tr>
</table></td></tr></table></body></html>`
}

export async function sendMagicLinkEmail(to: string, url: string, code: string, minutes: number) {
  const general = await getSettings("general")
  const branding = await getSettings("branding")
  const productName = branding.productName || general.instanceName
  const html = renderEmailLayout({
    productName,
    preheader: `Your sign-in code is ${code}`,
    heading: `Sign in to ${productName}`,
    body: `<p style="margin:0 0 16px 0">Click the button below to sign in. This link expires in ${minutes} minutes and can only be used once.</p>
<p style="margin:0">Or enter this code:</p>
<p style="margin:12px 0 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:600;letter-spacing:0.25em;">${esc(code)}</p>`,
    cta: { label: "Sign in", url },
    footer: `If you didn't request this email, you can safely ignore it.<br/>Sent by ${esc(productName)} · ${esc(getAppUrl())}`,
  })
  const text = `Sign in to ${productName}\n\nOpen this link to sign in (expires in ${minutes} minutes):\n${url}\n\nOr enter this code: ${code}\n\nIf you didn't request this email, you can ignore it.`
  return sendSystemEmail({ to, subject: `Sign in to ${productName} — code ${code}`, html, text })
}

export async function sendInvitationEmail(opts: { to: string; orgName: string; inviterName: string; url: string }) {
  const general = await getSettings("general")
  const branding = await getSettings("branding")
  const productName = branding.productName || general.instanceName
  const html = renderEmailLayout({
    productName,
    preheader: `${opts.inviterName} invited you to ${opts.orgName}`,
    heading: `Join ${opts.orgName} on ${productName}`,
    body: `<p style="margin:0">${esc(opts.inviterName)} invited you to collaborate in the <strong>${esc(opts.orgName)}</strong> workspace — shared inboxes, internal comments and assignments in one place.</p>`,
    cta: { label: "Accept invitation", url: opts.url },
    footer: `This invitation expires in 14 days.<br/>Sent by ${esc(productName)} · ${esc(getAppUrl())}`,
  })
  const text = `${opts.inviterName} invited you to join ${opts.orgName} on ${productName}.\n\nAccept the invitation:\n${opts.url}\n`
  return sendSystemEmail({ to: opts.to, subject: `${opts.inviterName} invited you to ${opts.orgName}`, html, text })
}

export async function sendNotificationEmail(opts: { to: string; subject: string; heading: string; bodyHtml: string; bodyText: string; url: string; cta?: string }) {
  const general = await getSettings("general")
  const branding = await getSettings("branding")
  const productName = branding.productName || general.instanceName
  const html = renderEmailLayout({
    productName,
    heading: opts.heading,
    body: opts.bodyHtml,
    cta: { label: opts.cta ?? "Open in " + productName, url: opts.url },
    footer: `You receive this because of your notification settings in ${esc(productName)}.`,
  })
  return sendSystemEmail({ to: opts.to, subject: opts.subject, html, text: `${opts.bodyText}\n\n${opts.url}` })
}
