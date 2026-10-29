/**
 * Human-friendly labels for audit log actions ("<resource>.<verb>").
 * Unknown actions fall back to a readable version of the key.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Auth & sessions
  "auth.login": "Signed in",
  "auth.login_denied": "Sign-in denied",
  "auth.logout": "Signed out",
  "auth.session_revoked": "Signed out a device",
  "auth.sessions_revoked": "Signed out all other devices",
  // Workspace
  "workspace.created": "Created the workspace",
  "workspace.deleted": "Deleted the workspace",
  "workspace.slug_changed": "Changed the workspace URL",
  "settings.updated": "Updated workspace settings",
  "demo.seeded": "Loaded demo data",
  "demo.loaded": "Loaded demo data",
  "demo.removed": "Removed demo data",
  // Members
  "member.invited": "Invited a member",
  "member.joined": "Joined the workspace",
  "member.left": "Left the workspace",
  "member.removed": "Removed a member",
  "member.role_changed": "Changed a member's role",
  "member.suspended": "Suspended a member",
  "member.reactivated": "Reactivated a member",
  "invitation.resent": "Resent an invitation",
  "invitation.revoked": "Revoked an invitation",
  // Teams & roles
  "team.created": "Created a team",
  "team.updated": "Updated a team",
  "team.deleted": "Deleted a team",
  "team.member_added": "Added a team member",
  "team.member_removed": "Removed a team member",
  "team.lead_changed": "Changed a team lead",
  "role.created": "Created a role",
  "role.updated": "Updated a role",
  "role.deleted": "Deleted a role",
  // Inboxes
  "inbox.connected": "Connected an inbox",
  "inbox.updated": "Updated an inbox",
  "inbox.access_updated": "Changed inbox access",
  "inbox.credentials_rotated": "Updated inbox credentials",
  "inbox.paused": "Paused an inbox",
  "inbox.resumed": "Resumed an inbox",
  "inbox.sync_requested": "Requested an inbox sync",
  "inbox.deleted": "Deleted an inbox",
  // Content
  "label.created": "Created a label",
  "label.updated": "Updated a label",
  "label.deleted": "Deleted a label",
  "label.reordered": "Reordered labels",
  "response.created": "Created a canned response",
  "response.updated": "Updated a canned response",
  "response.deleted": "Deleted a canned response",
  "signature.created": "Created a signature",
  "signature.updated": "Updated a signature",
  "signature.deleted": "Deleted a signature",
  "signature.assigned": "Changed default signatures",
  // Rules
  "rule.created": "Created a rule",
  "rule.updated": "Updated a rule",
  "rule.deleted": "Deleted a rule",
  "rule.toggled": "Turned a rule on/off",
  "rule.reordered": "Reordered rules",
  // Integrations
  "api_key.created": "Created an API key",
  "api_key.revoked": "Revoked an API key",
  "webhook.created": "Created a webhook",
  "webhook.updated": "Updated a webhook",
  "webhook.deleted": "Deleted a webhook",
  "webhook.secret_rolled": "Rolled a webhook secret",
  "webhook.tested": "Sent a webhook test event",
  "webhook.redelivered": "Redelivered a webhook event",
  "webhook.auto_disabled": "Webhook disabled after failures",
  // Billing
  "billing.checkout_started": "Started checkout",
  "billing.portal_opened": "Opened the billing portal",
  "billing.checkout_completed": "Completed checkout",
  "billing.subscription_created": "Subscription created",
  "billing.subscription_updated": "Subscription updated",
  "billing.subscription_canceled": "Subscription canceled",
  "billing.invoice_paid": "Invoice paid",
  "billing.payment_failed": "Payment failed",
  // Conversations & contacts
  "conversation.deleted": "Deleted a conversation",
  "conversation.merged": "Merged conversations",
  "contact.deleted": "Deleted a contact",
  "contact.merged": "Merged contacts",
  "contacts.imported": "Imported contacts",
  "task.deleted": "Deleted a task",
  // Instance administration
  "admin.impersonation_started": "Instance admin started impersonating",
  "admin.impersonation_stopped": "Instance admin stopped impersonating",
  "admin.workspace_suspended": "Workspace suspended by the instance admin",
  "admin.workspace_unsuspended": "Workspace unsuspended by the instance admin",
  "admin.workspace_plan_changed": "Plan changed by the instance admin",
  "admin.workspace_trial_extended": "Trial extended by the instance admin",
  "admin.workspace_ownership_transferred": "Ownership transferred by the instance admin",
  "admin.workspace_subscription_status_changed": "Subscription status changed by the instance admin",
}

export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  auth: "Sign-in & sessions",
  workspace: "Workspace",
  settings: "Settings",
  demo: "Demo data",
  member: "Members",
  invitation: "Invitations",
  team: "Teams",
  role: "Roles",
  inbox: "Inboxes",
  label: "Labels",
  response: "Canned responses",
  signature: "Signatures",
  rule: "Rules",
  api_key: "API keys",
  webhook: "Webhooks",
  billing: "Billing",
  conversation: "Conversations",
  contact: "Contacts",
  contacts: "Contacts",
  task: "Tasks",
  admin: "Instance admin",
}

const IT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "Accesso effettuato", "auth.login_denied": "Accesso rifiutato", "auth.logout": "Disconnessione effettuata",
  "auth.session_revoked": "Dispositivo disconnesso", "auth.sessions_revoked": "Altri dispositivi disconnessi",
  "workspace.created": "Workspace creato", "workspace.deleted": "Workspace eliminato", "workspace.slug_changed": "URL del workspace modificato",
  "settings.updated": "Impostazioni del workspace aggiornate", "demo.seeded": "Dati di esempio caricati", "demo.loaded": "Dati di esempio caricati", "demo.removed": "Dati di esempio rimossi",
  "member.invited": "Membro invitato", "member.joined": "Ingresso nel workspace", "member.left": "Uscita dal workspace", "member.removed": "Membro rimosso", "member.role_changed": "Ruolo del membro modificato", "member.suspended": "Membro sospeso", "member.reactivated": "Membro riattivato",
  "invitation.resent": "Invito reinviato", "invitation.revoked": "Invito revocato", "team.created": "Team creato", "team.updated": "Team aggiornato", "team.deleted": "Team eliminato", "team.member_added": "Membro aggiunto al team", "team.member_removed": "Membro rimosso dal team", "team.lead_changed": "Referente del team modificato",
  "role.created": "Ruolo creato", "role.updated": "Ruolo aggiornato", "role.deleted": "Ruolo eliminato", "inbox.connected": "Casella collegata", "inbox.updated": "Casella aggiornata", "inbox.access_updated": "Accesso alla casella modificato", "inbox.credentials_rotated": "Credenziali della casella aggiornate", "inbox.paused": "Casella sospesa", "inbox.resumed": "Casella riattivata", "inbox.sync_requested": "Sincronizzazione della casella avviata", "inbox.deleted": "Casella eliminata",
  "label.created": "Etichetta creata", "label.updated": "Etichetta aggiornata", "label.deleted": "Etichetta eliminata", "label.reordered": "Ordine delle etichette modificato", "response.created": "Risposta predefinita creata", "response.updated": "Risposta predefinita aggiornata", "response.deleted": "Risposta predefinita eliminata", "signature.created": "Firma creata", "signature.updated": "Firma aggiornata", "signature.deleted": "Firma eliminata", "signature.assigned": "Firme predefinite modificate",
  "rule.created": "Regola creata", "rule.updated": "Regola aggiornata", "rule.deleted": "Regola eliminata", "rule.toggled": "Regola attivata o disattivata", "rule.reordered": "Ordine delle regole modificato", "api_key.created": "Chiave API creata", "api_key.revoked": "Chiave API revocata", "webhook.created": "Webhook creato", "webhook.updated": "Webhook aggiornato", "webhook.deleted": "Webhook eliminato", "webhook.secret_rolled": "Segreto webhook rigenerato", "webhook.tested": "Evento webhook di test inviato", "webhook.redelivered": "Evento webhook reinviato", "webhook.auto_disabled": "Webhook disattivato dopo errori",
  "billing.checkout_started": "Acquisto avviato", "billing.portal_opened": "Portale di fatturazione aperto", "billing.checkout_completed": "Acquisto completato", "billing.subscription_created": "Abbonamento creato", "billing.subscription_updated": "Abbonamento aggiornato", "billing.subscription_canceled": "Abbonamento annullato", "billing.invoice_paid": "Fattura pagata", "billing.payment_failed": "Pagamento non riuscito", "conversation.deleted": "Conversazione eliminata", "conversation.merged": "Conversazioni unite", "contact.deleted": "Contatto eliminato", "contact.merged": "Contatti uniti", "contacts.imported": "Contatti importati", "task.deleted": "Attività eliminata",
  "admin.impersonation_started": "Amministratore dell’istanza ha avviato l’impersonificazione", "admin.impersonation_stopped": "Amministratore dell’istanza ha interrotto l’impersonificazione", "admin.workspace_suspended": "Workspace sospeso dall’amministratore dell’istanza", "admin.workspace_unsuspended": "Sospensione del workspace rimossa dall’amministratore dell’istanza", "admin.workspace_plan_changed": "Piano modificato dall’amministratore dell’istanza", "admin.workspace_trial_extended": "Periodo di prova esteso dall’amministratore dell’istanza", "admin.workspace_ownership_transferred": "Proprietà trasferita dall’amministratore dell’istanza", "admin.workspace_subscription_status_changed": "Stato dell’abbonamento modificato dall’amministratore dell’istanza",
}

const IT_RESOURCE_LABELS: Record<string, string> = {
  auth: "Accesso e sessioni", workspace: "Workspace", settings: "Impostazioni", demo: "Dati di esempio", member: "Membri", invitation: "Inviti", team: "Team", role: "Ruoli", inbox: "Caselle", label: "Etichette", response: "Risposte predefinite", signature: "Firme", rule: "Regole", api_key: "Chiavi API", webhook: "Webhook", billing: "Fatturazione", conversation: "Conversazioni", contact: "Contatti", contacts: "Contatti", task: "Attività", admin: "Amministrazione istanza",
}

export function auditActionLabel(action: string, locale: "en" | "it" = "en"): string {
  const known = AUDIT_ACTION_LABELS[action]
  if (known) return locale === "it" ? IT_ACTION_LABELS[action] ?? known : known
  const [resource, verb] = action.split(".")
  const r = (resource ?? "").replace(/_/g, " ")
  const v = (verb ?? "").replace(/_/g, " ")
  const text = `${r} ${v}`.trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function auditResourceLabel(resource: string, locale: "en" | "it" = "en"): string {
  if (locale === "it" && IT_RESOURCE_LABELS[resource]) return IT_RESOURCE_LABELS[resource]!
  return AUDIT_RESOURCE_LABELS[resource] ?? resource.charAt(0).toUpperCase() + resource.slice(1).replace(/_/g, " ")
}

/** Tone used for the action badge. */
export function auditActionTone(action: string): "danger" | "warning" | "success" | "neutral" | "info" {
  if (/(deleted|removed|revoked|denied|suspended|failed|canceled|auto_disabled|left)$/.test(action)) return "danger"
  if (/(role_changed|secret_rolled|credentials_rotated|slug_changed|impersonation_started|access_updated)$/.test(action)) return "warning"
  if (/(created|connected|joined|invited|login|paid|completed|reactivated|resumed)$/.test(action)) return "success"
  return "neutral"
}
