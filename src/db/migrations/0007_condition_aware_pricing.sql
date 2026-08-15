ALTER TABLE `profiles` ADD `default_pricing_condition` text DEFAULT 'Lightly Played' NOT NULL
  CONSTRAINT "profiles_default_pricing_condition" CHECK (`default_pricing_condition` IN ('Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'));--> statement-breakpoint
ALTER TABLE `market_price_observations` ADD `provider_sku_id` text;--> statement-breakpoint
ALTER TABLE `market_price_observations` ADD `price_condition` text
  CONSTRAINT "market_price_observations_price_condition" CHECK (`price_condition` IS NULL OR `price_condition` IN ('Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'));--> statement-breakpoint
CREATE INDEX `market_price_observations_condition_index` ON `market_price_observations` (`printing_id`,`price_condition`,`provider`,`id`);
