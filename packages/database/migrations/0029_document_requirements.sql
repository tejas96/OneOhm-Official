CREATE TABLE "document_requirements" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"categories" text[] NOT NULL,
	"from_customer" boolean DEFAULT false NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
