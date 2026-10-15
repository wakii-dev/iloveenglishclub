ALTER TABLE "words" ADD COLUMN "pos" text;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "synonyms" text;--> statement-breakpoint
CREATE INDEX "crawl_entries_cefr_idx" ON "crawl_entries" USING btree ("cefr");--> statement-breakpoint
CREATE INDEX "crawl_entries_pos_idx" ON "crawl_entries" USING btree ("pos");--> statement-breakpoint
CREATE INDEX "crawl_entries_ox3000_idx" ON "crawl_entries" USING btree ("ox3000");