ALTER TABLE `card_sets` ADD `language_code` text DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE `card_sets` ADD `catalog_provider` text;
--> statement-breakpoint
ALTER TABLE `card_sets` ADD `catalog_external_id` text;
--> statement-breakpoint
CREATE TRIGGER `card_sets_catalog_identity_pair_insert`
BEFORE INSERT ON `card_sets`
WHEN (`NEW`.`catalog_provider` IS NULL) != (`NEW`.`catalog_external_id` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'card_sets catalog identity must be complete');
END;
--> statement-breakpoint
CREATE TRIGGER `card_sets_catalog_identity_pair_update`
BEFORE UPDATE OF `catalog_provider`, `catalog_external_id` ON `card_sets`
WHEN (`NEW`.`catalog_provider` IS NULL) != (`NEW`.`catalog_external_id` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'card_sets catalog identity must be complete');
END;
--> statement-breakpoint
DROP INDEX `card_sets_game_code_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `card_sets_game_code_language_unique` ON `card_sets` (`game_id`,`code`,`language_code`);
--> statement-breakpoint
CREATE TABLE `__new_card_printings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer NOT NULL,
	`name` text NOT NULL,
	`canonical_name` text,
	`collector_number` text,
	`collector_number_key` text,
	`collector_number_sort` integer NOT NULL,
	`stable_identity_key` text NOT NULL,
	`printing_variant_key` text DEFAULT 'standard' NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`catalog_provider` text,
	`catalog_external_id` text,
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
	FOREIGN KEY (`set_id`) REFERENCES `card_sets`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "card_printings_catalog_identity_pair" CHECK((`catalog_provider` IS NULL) = (`catalog_external_id` IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_card_printings` (`id`, `set_id`, `name`, `canonical_name`, `collector_number`, `collector_number_key`, `collector_number_sort`, `stable_identity_key`, `printing_variant_key`, `language_code`, `catalog_provider`, `catalog_external_id`, `card_kind`, `subtype`, `rarity`, `regulation_mark`, `special_rule_box`, `ability_rule`, `rules_text`, `identification_confidence`, `image_provider`, `image_external_id`, `image_url`, `external_reference_url`, `metadata`, `created_at`, `updated_at`)
SELECT `card_printings`.`id`, `card_printings`.`set_id`, `card_printings`.`name`, NULL, `card_printings`.`collector_number`, `card_printings`.`collector_number_key`, `card_printings`.`collector_number_sort`,
  'published:' || lower(`games`.`slug`) || ':' || lower(`card_printings`.`language_code`) || ':' || lower(`card_sets`.`code`) || ':' || `card_printings`.`collector_number_key` || ':' || lower(`card_printings`.`printing_variant_key`),
  `card_printings`.`printing_variant_key`, `card_printings`.`language_code`, NULL, NULL, `card_printings`.`card_kind`, `card_printings`.`subtype`, `card_printings`.`rarity`, `card_printings`.`regulation_mark`, `card_printings`.`special_rule_box`, `card_printings`.`ability_rule`, `card_printings`.`rules_text`, `card_printings`.`identification_confidence`, `card_printings`.`image_provider`, `card_printings`.`image_external_id`, `card_printings`.`image_url`, `card_printings`.`external_reference_url`, `card_printings`.`metadata`, `card_printings`.`created_at`, `card_printings`.`updated_at`
FROM `card_printings`
INNER JOIN `card_sets` ON `card_sets`.`id` = `card_printings`.`set_id`
INNER JOIN `games` ON `games`.`id` = `card_sets`.`game_id`;
--> statement-breakpoint
CREATE TABLE `__new_pokemon_details` (
	`printing_id` integer PRIMARY KEY NOT NULL,
	`pokemon_type` text,
	`hp` integer,
	`evolves_from` text,
	`weakness` text,
	`resistance` text,
	`retreat_cost` integer,
	FOREIGN KEY (`printing_id`) REFERENCES `__new_card_printings`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_pokemon_details` SELECT * FROM `pokemon_details`;
--> statement-breakpoint
CREATE TABLE `__new_attacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`cost` text DEFAULT '[]' NOT NULL,
	`damage` text,
	`effect` text,
	FOREIGN KEY (`printing_id`) REFERENCES `__new_card_printings`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "attacks_position_positive" CHECK(`position` > 0)
);
--> statement-breakpoint
INSERT INTO `__new_attacks` SELECT * FROM `attacks`;
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
	FOREIGN KEY (`printing_id`) REFERENCES `__new_card_printings`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "owned_cards_quantity_positive" CHECK(`quantity` > 0)
);
--> statement-breakpoint
INSERT INTO `__new_owned_cards` SELECT * FROM `owned_cards`;
--> statement-breakpoint
CREATE UNIQUE INDEX `__new_owned_cards_id_profile_unique` ON `__new_owned_cards` (`id`,`profile_id`);
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
INSERT INTO `__new_import_records` SELECT * FROM `import_records`;
--> statement-breakpoint
DROP TABLE `import_records`;
--> statement-breakpoint
DROP TABLE `owned_cards`;
--> statement-breakpoint
DROP TABLE `attacks`;
--> statement-breakpoint
DROP TABLE `pokemon_details`;
--> statement-breakpoint
DROP TABLE `card_printings`;
--> statement-breakpoint
ALTER TABLE `__new_card_printings` RENAME TO `card_printings`;
--> statement-breakpoint
ALTER TABLE `__new_pokemon_details` RENAME TO `pokemon_details`;
--> statement-breakpoint
ALTER TABLE `__new_attacks` RENAME TO `attacks`;
--> statement-breakpoint
ALTER TABLE `__new_owned_cards` RENAME TO `owned_cards`;
--> statement-breakpoint
ALTER TABLE `__new_import_records` RENAME TO `import_records`;
--> statement-breakpoint
DROP INDEX `__new_owned_cards_id_profile_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `card_printings_identity_unique` ON `card_printings` (`stable_identity_key`);
--> statement-breakpoint
CREATE INDEX `card_printings_name_index` ON `card_printings` (`name`);
--> statement-breakpoint
CREATE INDEX `card_printings_kind_index` ON `card_printings` (`card_kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `attacks_printing_position_unique` ON `attacks` (`printing_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `owned_cards_id_profile_unique` ON `owned_cards` (`id`,`profile_id`);
--> statement-breakpoint
CREATE INDEX `owned_cards_profile_printing_index` ON `owned_cards` (`profile_id`,`printing_id`);
--> statement-breakpoint
CREATE INDEX `owned_cards_printing_index` ON `owned_cards` (`printing_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_records_source_inventory_unique` ON `import_records` (`profile_id`,`source_key`,`external_inventory_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_records_owned_card_unique` ON `import_records` (`owned_card_id`);
