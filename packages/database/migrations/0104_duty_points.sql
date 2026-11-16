CREATE TABLE "duty_points" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attendance_day_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_m" double precision,
	"speed_mps" double precision,
	"heading_deg" double precision,
	"altitude_m" double precision,
	"mocked" boolean DEFAULT false NOT NULL,
	"battery_percent" integer,
	"charging" boolean,
	"network" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_points_user_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "duty_points" ADD CONSTRAINT "duty_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_points" ADD CONSTRAINT "duty_points_attendance_day_id_attendance_days_id_fk" FOREIGN KEY ("attendance_day_id") REFERENCES "public"."attendance_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duty_points_user_recorded_idx" ON "duty_points" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "duty_points_day_idx" ON "duty_points" USING btree ("attendance_day_id");