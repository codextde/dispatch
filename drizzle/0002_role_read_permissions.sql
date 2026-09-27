-- Read permissions introduced in v1.0.0 (API key scopes, shared address book visibility).
-- Idempotent: appends only the permissions a role doesn't have yet, keeping array order.
UPDATE "roles" SET "permissions" = "permissions" || ARRAY(
  SELECT p FROM unnest(ARRAY['conversations.read', 'contacts.read', 'tasks.read', 'contacts.view']) p WHERE p <> ALL("permissions")
) WHERE "key" IN ('owner', 'admin', 'member');
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || ARRAY(
  SELECT p FROM unnest(ARRAY['conversations.read']) p WHERE p <> ALL("permissions")
) WHERE "key" = 'guest';
--> statement-breakpoint
-- Custom roles keep what they could read; the full shared address book stays visible to roles that manage contacts or see all inboxes.
UPDATE "roles" SET "permissions" = "permissions" || ARRAY(
  SELECT p FROM unnest(ARRAY['conversations.read', 'contacts.read', 'tasks.read']
    || CASE WHEN "permissions" && ARRAY['contacts.manage', 'conversations.view_all'] THEN ARRAY['contacts.view'] ELSE ARRAY[]::text[] END) p
  WHERE p <> ALL("permissions")
) WHERE "key" IS NULL OR "key" NOT IN ('owner', 'admin', 'member', 'guest');
