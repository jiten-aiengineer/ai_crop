CREATE TABLE `farmers` (`id` text PRIMARY KEY NOT NULL, `email` text NOT NULL UNIQUE, `name` text, `location` text, `preferred_language` text DEFAULT 'en' NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `products` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `category` text NOT NULL, `active_ingredient` text, `composition` text, `target_crops` text DEFAULT '[]' NOT NULL, `target_issues` text DEFAULT '[]' NOT NULL, `approved_dosage` text, `safety_information` text, `label_url` text, `regions` text DEFAULT '[]' NOT NULL, `approved` integer DEFAULT false NOT NULL);
--> statement-breakpoint
CREATE TABLE `inspections` (`id` text PRIMARY KEY NOT NULL, `farmer_id` text, `crop` text, `farmer_description` text, `location` text, `status` text DEFAULT 'pending' NOT NULL, `likely_issue` text, `issue_type` text, `confidence` real, `observed_symptoms` text DEFAULT '[]' NOT NULL, `alternatives` text DEFAULT '[]' NOT NULL, `created_at` integer NOT NULL, FOREIGN KEY (`farmer_id`) REFERENCES `farmers`(`id`));
--> statement-breakpoint
CREATE TABLE `inspection_images` (`id` text PRIMARY KEY NOT NULL, `inspection_id` text NOT NULL, `object_key` text NOT NULL, `content_type` text NOT NULL, `consent_for_model_training` integer DEFAULT false NOT NULL, FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`));
--> statement-breakpoint
CREATE INDEX `idx_inspection_images_inspection_id` ON `inspection_images` (`inspection_id`);
--> statement-breakpoint
CREATE TABLE `recommendations` (`id` text PRIMARY KEY NOT NULL, `inspection_id` text NOT NULL, `product_id` text NOT NULL, `reason` text, `created_at` integer NOT NULL, FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`), FOREIGN KEY (`product_id`) REFERENCES `products`(`id`));
--> statement-breakpoint
CREATE INDEX `idx_recommendations_inspection_id` ON `recommendations` (`inspection_id`);
