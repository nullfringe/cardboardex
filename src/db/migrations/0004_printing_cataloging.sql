ALTER TABLE `card_printings` ADD `card_back_design` text;
--> statement-breakpoint
ALTER TABLE `card_printings` ADD `printing_finish` text;
--> statement-breakpoint
ALTER TABLE `card_printings` ADD `physical_form` text;
--> statement-breakpoint
CREATE TABLE `printing_identifiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` integer NOT NULL,
	`role` text NOT NULL,
	`value` text NOT NULL,
	`label` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printing_identifiers_printing_role_value_unique` ON `printing_identifiers` (`printing_id`,`role`,`value`);
--> statement-breakpoint
CREATE INDEX `printing_identifiers_value_index` ON `printing_identifiers` (`value`);
--> statement-breakpoint
CREATE TABLE `printing_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer NOT NULL,
	`group_key` text NOT NULL,
	`group_type` text NOT NULL,
	`name` text,
	`expected_component_count` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `card_sets`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "printing_groups_expected_count_positive" CHECK(`expected_component_count` IS NULL OR `expected_component_count` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printing_groups_set_key_unique` ON `printing_groups` (`set_id`,`group_key`);
--> statement-breakpoint
CREATE TABLE `printing_group_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`printing_id` integer NOT NULL,
	`component_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `printing_groups`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`printing_id`) REFERENCES `card_printings`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printing_group_members_group_printing_unique` ON `printing_group_members` (`group_id`,`printing_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `printing_group_members_group_component_unique` ON `printing_group_members` (`group_id`,`component_key`);
--> statement-breakpoint
CREATE INDEX `printing_group_members_printing_index` ON `printing_group_members` (`printing_id`);
