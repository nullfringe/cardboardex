CREATE UNIQUE INDEX `owned_cards_id_printing_unique` ON `owned_cards` (`id`,`printing_id`);--> statement-breakpoint
CREATE TABLE `market_price_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` integer NOT NULL,
	`owned_card_id` integer,
	`provider` text NOT NULL,
	`provider_product_id` text,
	`provider_variant` text,
	`currency` text NOT NULL,
	`market_price_minor` integer,
	`low_price_minor` integer,
	`mid_price_minor` integer,
	`high_price_minor` integer,
	`direct_low_price_minor` integer,
	`observation_type` text DEFAULT 'provider' NOT NULL,
	`observation_key` text NOT NULL,
	`source_url` text,
	`source_updated_at` text,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`note` text,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`owned_card_id`,`printing_id`) REFERENCES `owned_cards`(`id`,`printing_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "market_price_observations_currency_code" CHECK(length(`currency`) = 3 AND `currency` = upper(`currency`)),
	CONSTRAINT "market_price_observations_nonnegative_prices" CHECK((`market_price_minor` IS NULL OR `market_price_minor` >= 0)
		AND (`low_price_minor` IS NULL OR `low_price_minor` >= 0)
		AND (`mid_price_minor` IS NULL OR `mid_price_minor` >= 0)
		AND (`high_price_minor` IS NULL OR `high_price_minor` >= 0)
		AND (`direct_low_price_minor` IS NULL OR `direct_low_price_minor` >= 0)),
	CONSTRAINT "market_price_observations_scope" CHECK((`observation_type` = 'provider' AND `owned_card_id` IS NULL AND `provider` <> 'manual')
		OR (`observation_type` IN ('manual-set', 'manual-clear') AND `owned_card_id` IS NOT NULL AND `provider` = 'manual')),
	CONSTRAINT "market_price_observations_value" CHECK((`observation_type` = 'manual-clear'
			AND `market_price_minor` IS NULL
			AND `low_price_minor` IS NULL
			AND `mid_price_minor` IS NULL
			AND `high_price_minor` IS NULL
			AND `direct_low_price_minor` IS NULL)
		OR (`observation_type` <> 'manual-clear'
			AND (`market_price_minor` IS NOT NULL
				OR `low_price_minor` IS NOT NULL
				OR `mid_price_minor` IS NOT NULL
				OR `high_price_minor` IS NOT NULL
				OR `direct_low_price_minor` IS NOT NULL)))
);--> statement-breakpoint
CREATE UNIQUE INDEX `market_price_observations_key_unique` ON `market_price_observations` (`observation_key`);--> statement-breakpoint
CREATE INDEX `market_price_observations_printing_index` ON `market_price_observations` (`printing_id`,`provider`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `market_price_observations_owned_card_index` ON `market_price_observations` (`owned_card_id`,`id`);
