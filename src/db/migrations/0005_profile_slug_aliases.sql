CREATE TABLE `profile_slug_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_slug_aliases_slug_unique` ON `profile_slug_aliases` (`slug`);
--> statement-breakpoint
CREATE INDEX `profile_slug_aliases_profile_index` ON `profile_slug_aliases` (`profile_id`);
