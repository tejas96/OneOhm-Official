ALTER TABLE "customer_actions" DROP CONSTRAINT "customer_actions_lead_id_leads_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;