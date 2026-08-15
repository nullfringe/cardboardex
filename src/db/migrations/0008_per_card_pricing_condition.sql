ALTER TABLE `owned_cards` ADD `pricing_condition_override` text
  CONSTRAINT "owned_cards_pricing_condition_override" CHECK (`pricing_condition_override` IS NULL OR `pricing_condition_override` IN ('Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'));
