CREATE TABLE `attacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`cost` text DEFAULT '[]' NOT NULL,
	`damage` text,
	`effect` text,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "attacks_position_positive" CHECK("attacks"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attacks_printing_position_unique` ON `attacks` (`printing_id`,`position`);--> statement-breakpoint
CREATE TABLE `card_printings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer NOT NULL,
	`name` text NOT NULL,
	`collector_number` text NOT NULL,
	`collector_number_key` text NOT NULL,
	`collector_number_sort` integer NOT NULL,
	`printing_variant_key` text DEFAULT 'standard' NOT NULL,
	`card_kind` text NOT NULL,
	`subtype` text,
	`rarity` text,
	`regulation_mark` text,
	`special_rule_box` text,
	`ability_rule` text,
	`rules_text` text,
	`identification_confidence` text,
	`image_provider` text,
	`image_external_id` text,
	`image_url` text,
	`external_reference_url` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `card_sets`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_printings_identity_unique` ON `card_printings` (`set_id`,`collector_number_key`,`printing_variant_key`);--> statement-breakpoint
CREATE INDEX `card_printings_name_index` ON `card_printings` (`name`);--> statement-breakpoint
CREATE INDEX `card_printings_kind_index` ON `card_printings` (`card_kind`);--> statement-breakpoint
CREATE TABLE `card_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_sets_game_code_unique` ON `card_sets` (`game_id`,`code`);--> statement-breakpoint
CREATE INDEX `card_sets_name_index` ON `card_sets` (`name`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_name_unique` ON `games` (`name`);--> statement-breakpoint
CREATE TABLE `import_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_key` text NOT NULL,
	`external_inventory_id` text NOT NULL,
	`owned_card_id` integer NOT NULL,
	`raw_row` text NOT NULL,
	`source_hash` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owned_card_id`) REFERENCES `owned_cards`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_records_source_inventory_unique` ON `import_records` (`source_key`,`external_inventory_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_records_owned_card_unique` ON `import_records` (`owned_card_id`);--> statement-breakpoint
CREATE TABLE `owned_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`condition` text,
	`finish_variant` text,
	`sealed` integer DEFAULT false NOT NULL,
	`notes` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "owned_cards_quantity_positive" CHECK("owned_cards"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `owned_cards_printing_index` ON `owned_cards` (`printing_id`);--> statement-breakpoint
CREATE TABLE `pokemon_details` (
	`printing_id` integer PRIMARY KEY NOT NULL,
	`pokemon_type` text,
	`hp` integer,
	`evolves_from` text,
	`weakness` text,
	`resistance` text,
	`retreat_cost` integer,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE cascade
);
