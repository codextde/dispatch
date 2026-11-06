ALTER TABLE "calendar_events" ADD COLUMN "invitation_key" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "invitation_versions" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "organizer_account_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organizer_account_id_accounts_id_fk" FOREIGN KEY ("organizer_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_invitation_idx" ON "calendar_events" USING btree ("org_id","invitation_key");