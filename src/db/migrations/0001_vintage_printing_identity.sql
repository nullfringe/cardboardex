ALTER TABLE `card_printings` ADD `language_code` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
UPDATE `card_printings`
SET `printing_variant_key` = 'first-edition'
WHERE `printing_variant_key` = 'standard'
  AND EXISTS (
    SELECT 1 FROM `owned_cards`
    WHERE `owned_cards`.`printing_id` = `card_printings`.`id`
      AND lower(`owned_cards`.`finish_variant`) GLOB '*1st edition*'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `card_printings` AS `candidate`
    WHERE `candidate`.`set_id` = `card_printings`.`set_id`
      AND `candidate`.`collector_number_key` = `card_printings`.`collector_number_key`
      AND `candidate`.`printing_variant_key` = 'first-edition'
  );--> statement-breakpoint
UPDATE `card_printings`
SET `printing_variant_key` = 'shadowless'
WHERE `printing_variant_key` = 'standard'
  AND EXISTS (
    SELECT 1 FROM `owned_cards`
    WHERE `owned_cards`.`printing_id` = `card_printings`.`id`
      AND lower(`owned_cards`.`finish_variant`) GLOB '*shadowless*'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `card_printings` AS `candidate`
    WHERE `candidate`.`set_id` = `card_printings`.`set_id`
      AND `candidate`.`collector_number_key` = `card_printings`.`collector_number_key`
      AND `candidate`.`printing_variant_key` = 'shadowless'
  );--> statement-breakpoint
UPDATE `card_printings`
SET `printing_variant_key` = '1999-2000-copyright'
WHERE `printing_variant_key` = 'standard'
  AND EXISTS (
    SELECT 1 FROM `owned_cards`
    WHERE `owned_cards`.`printing_id` = `card_printings`.`id`
      AND lower(`owned_cards`.`finish_variant`) GLOB '*1999-2000*'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `card_printings` AS `candidate`
    WHERE `candidate`.`set_id` = `card_printings`.`set_id`
      AND `candidate`.`collector_number_key` = `card_printings`.`collector_number_key`
      AND `candidate`.`printing_variant_key` = '1999-2000-copyright'
  );--> statement-breakpoint
UPDATE `card_printings`
SET `printing_variant_key` = 'unlimited'
WHERE `printing_variant_key` = 'standard'
  AND EXISTS (
    SELECT 1 FROM `owned_cards`
    WHERE `owned_cards`.`printing_id` = `card_printings`.`id`
      AND lower(`owned_cards`.`finish_variant`) GLOB '*unlimited*'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `card_printings` AS `candidate`
    WHERE `candidate`.`set_id` = `card_printings`.`set_id`
      AND `candidate`.`collector_number_key` = `card_printings`.`collector_number_key`
      AND `candidate`.`printing_variant_key` = 'unlimited'
  );--> statement-breakpoint
DROP INDEX `card_printings_identity_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `card_printings_identity_unique` ON `card_printings` (`set_id`,`collector_number_key`,`printing_variant_key`,`language_code`);
