ALTER TABLE `market_price_observations` ADD `pricing_variant_assumed` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `market_provider_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_product_id` text NOT NULL,
	`resolution_method` text NOT NULL,
	`identity_fingerprint` text NOT NULL,
	`source_url` text,
	`resolved_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_provider_products_printing_provider_unique` ON `market_provider_products` (`printing_id`,`provider`);--> statement-breakpoint
CREATE INDEX `market_provider_products_provider_product_index` ON `market_provider_products` (`provider`,`provider_product_id`);
