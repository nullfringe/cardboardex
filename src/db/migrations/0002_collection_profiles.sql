CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_slug_unique` ON `profiles` (`slug`);
--> statement-breakpoint
INSERT INTO `profiles` (`slug`, `name`) VALUES ('my-collection', 'My Collection');
--> statement-breakpoint
CREATE TABLE `__new_owned_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`printing_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`condition` text,
	`finish_variant` text,
	`sealed` integer DEFAULT false NOT NULL,
	`notes` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "owned_cards_quantity_positive" CHECK("__new_owned_cards"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owned_cards_id_profile_unique` ON `__new_owned_cards` (`id`,`profile_id`);
--> statement-breakpoint
INSERT INTO `__new_owned_cards` (`id`, `profile_id`, `printing_id`, `quantity`, `condition`, `finish_variant`, `sealed`, `notes`, `metadata`, `created_at`, `updated_at`)
SELECT `id`, (SELECT `id` FROM `profiles` WHERE `slug` = 'my-collection'), `printing_id`, `quantity`, `condition`, `finish_variant`, `sealed`, `notes`, `metadata`, `created_at`, `updated_at`
FROM `owned_cards`;
--> statement-breakpoint
CREATE TABLE `__new_import_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`external_inventory_id` text NOT NULL,
	`owned_card_id` integer NOT NULL,
	`raw_row` text NOT NULL,
	`source_hash` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owned_card_id`,`profile_id`) REFERENCES `__new_owned_cards`(`id`,`profile_id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_import_records` (`id`, `profile_id`, `source_key`, `external_inventory_id`, `owned_card_id`, `raw_row`, `source_hash`, `imported_at`)
SELECT `import_records`.`id`, `__new_owned_cards`.`profile_id`, `import_records`.`source_key`, `import_records`.`external_inventory_id`, `import_records`.`owned_card_id`, `import_records`.`raw_row`, `import_records`.`source_hash`, `import_records`.`imported_at`
FROM `import_records`
INNER JOIN `__new_owned_cards` ON `import_records`.`owned_card_id` = `__new_owned_cards`.`id`;
--> statement-breakpoint
DROP TABLE `import_records`;
--> statement-breakpoint
DROP TABLE `owned_cards`;
--> statement-breakpoint
ALTER TABLE `__new_owned_cards` RENAME TO `owned_cards`;
--> statement-breakpoint
ALTER TABLE `__new_import_records` RENAME TO `import_records`;
--> statement-breakpoint
CREATE INDEX `owned_cards_profile_printing_index` ON `owned_cards` (`profile_id`,`printing_id`);
--> statement-breakpoint
CREATE INDEX `owned_cards_printing_index` ON `owned_cards` (`printing_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_records_source_inventory_unique` ON `import_records` (`profile_id`,`source_key`,`external_inventory_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_records_owned_card_unique` ON `import_records` (`owned_card_id`);
