CREATE TABLE "defeated_trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"trainer_badge_id" text NOT NULL,
	"defeated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "defeated_trainers" ADD CONSTRAINT "defeated_trainers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "defeated_trainers_account_badge_unique" ON "defeated_trainers" USING btree ("account_id","trainer_badge_id");