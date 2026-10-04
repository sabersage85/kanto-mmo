CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"instance_id" text NOT NULL,
	"species_id" integer NOT NULL,
	"nickname" text,
	"level" integer NOT NULL,
	"exp" integer NOT NULL,
	"ivs" jsonb NOT NULL,
	"evs" jsonb NOT NULL,
	"move_ids" jsonb NOT NULL,
	"current_hp" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "currency" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_members" ADD CONSTRAINT "storage_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;