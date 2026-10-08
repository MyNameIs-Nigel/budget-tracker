CREATE TABLE "checking_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"as_of" date NOT NULL,
	"balance_cents" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checking_revision_nonnegative" CHECK ("checking_balances"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "checking_balances" ADD CONSTRAINT "checking_balances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_duplicate_idx" ON "transactions" USING btree ("user_id","date","amount_cents","kind");