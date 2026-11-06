CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"creator_id" uuid,
	"conversation_id" uuid,
	"ics" text NOT NULL,
	"remote_path" text,
	"etag" text,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid,
	"account_id" uuid,
	"name" text NOT NULL,
	"remote_path" text,
	"credential_enc" text,
	"synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_org_calendar_idx" ON "calendar_events" USING btree ("org_id","calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_remote_uidx" ON "calendar_events" USING btree ("calendar_id","remote_path");--> statement-breakpoint
CREATE INDEX "calendars_org_idx" ON "calendars" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_remote_uidx" ON "calendars" USING btree ("org_id","account_id","remote_path");
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['calendar.use'] WHERE "key" IN ('owner', 'admin', 'member') AND NOT ('calendar.use' = ANY("permissions"));
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['calendar.manage'] WHERE "key" IN ('owner', 'admin') AND NOT ('calendar.manage' = ANY("permissions"));
