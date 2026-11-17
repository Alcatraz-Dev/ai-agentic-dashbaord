CREATE TABLE "agent_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"label" text NOT NULL,
	"model" text NOT NULL,
	"base_url" text NOT NULL,
	"api" text DEFAULT 'chat_completions' NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"activity" text NOT NULL,
	"model" text NOT NULL,
	"tokens_prompt" integer DEFAULT 0 NOT NULL,
	"tokens_completion" integer DEFAULT 0 NOT NULL,
	"tokens_total" integer DEFAULT 0 NOT NULL,
	"cost" numeric DEFAULT '0' NOT NULL,
	"run_id" integer,
	"ref_type" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"image_url" text,
	"provider" text DEFAULT 'email' NOT NULL,
	"browser_context_id" text,
	"schedules_paused" boolean DEFAULT false NOT NULL,
	"schedule_alerts" boolean DEFAULT true NOT NULL,
	"schedule_digest" boolean DEFAULT true NOT NULL,
	"schedule_digest_last_sent_at" timestamp,
	"theme_palette" text DEFAULT 'alcatraz' NOT NULL,
	"theme_appearance" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_models" ADD CONSTRAINT "agent_models_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_owner_idx" ON "ai_usage" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ai_usage_activity_idx" ON "ai_usage" USING btree ("activity");--> statement-breakpoint
CREATE INDEX "ai_usage_model_idx" ON "ai_usage" USING btree ("model");--> statement-breakpoint
CREATE INDEX "ai_usage_ref_idx" ON "ai_usage" USING btree ("ref_type","run_id");