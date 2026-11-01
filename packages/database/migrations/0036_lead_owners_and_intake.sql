CREATE TABLE "website_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"city" text NOT NULL,
	"message" text,
	"source_page" text,
	"ip" text,
	"outcome" text NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason_key" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "revisit_on" date;--> statement-breakpoint
ALTER TABLE "website_enquiries" ADD CONSTRAINT "website_enquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "website_enquiries_ip_idx" ON "website_enquiries" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "website_enquiries_phone_idx" ON "website_enquiries" USING btree ("phone_e164","created_at");--> statement-breakpoint
-- PRD 3.3: every open lead has an owner. Open leads that came without one (reseller,
-- referral, WhatsApp code) get the same owner the API now picks: an active staff member
-- whose role manages leads (the Super Admin only when nobody else can), on leave last,
-- fewest open leads first, then by name. Only ownerless open leads are touched.
DO $$
DECLARE
  lead_row record;
  chosen uuid;
BEGIN
  FOR lead_row IN
    SELECT id FROM leads
    WHERE owner_user_id IS NULL AND stage NOT IN ('won', 'lost')
    ORDER BY created_at
  LOOP
    chosen := NULL;
    SELECT u.id INTO chosen
    FROM users u
    WHERE u.status = 'active'
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL AND r.kind = 'staff'
        JOIN role_capabilities rc ON rc.role_id = r.id AND rc.capability = 'leads.manage'
        WHERE ur.user_id = u.id
      )
    ORDER BY
      NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL AND r.kind = 'staff'
          AND NOT r.system
        JOIN role_capabilities rc ON rc.role_id = r.id AND rc.capability = 'leads.manage'
        WHERE ur.user_id = u.id
      ),
      u.on_leave,
      (SELECT count(*) FROM leads l
        WHERE l.owner_user_id = u.id AND l.stage NOT IN ('won', 'lost')),
      u.full_name,
      u.id
    LIMIT 1;
    IF chosen IS NOT NULL THEN
      UPDATE leads SET owner_user_id = chosen, updated_at = now() WHERE id = lead_row.id;
      INSERT INTO lead_activities (lead_id, kind, note, internal)
      VALUES (lead_row.id, 'note', 'Owner given by the lead rule (fewest open leads).', true);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE "leads" SET "lost_reason_key" = 'other' WHERE "stage" = 'lost' AND "lost_reason_key" IS NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_open_has_owner" CHECK ("leads"."stage" in ('won', 'lost') or "leads"."owner_user_id" is not null);
