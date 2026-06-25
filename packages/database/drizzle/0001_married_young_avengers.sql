CREATE TYPE "public"."pull_request_status" AS ENUM('pending', 'processing', 'reviewed', 'rate_limited');--> statement-breakpoint
CREATE TABLE "github_installation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"installation_id" varchar(50) NOT NULL,
	"account_login" text,
	"account_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_installation_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "pull_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" varchar,
	"feature_request_id" uuid,
	"repo_full_name" text NOT NULL,
	"pr_number" integer NOT NULL,
	"title" text NOT NULL,
	"author_login" text NOT NULL,
	"head_sha" text NOT NULL,
	"base_branch" text,
	"status" "pull_request_status" DEFAULT 'pending',
	"review_comment" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_installation" ADD CONSTRAINT "github_installation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_installation_id_github_installation_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installation"("installation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_feature_request_id_feature_request_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_request"("id") ON DELETE no action ON UPDATE no action;