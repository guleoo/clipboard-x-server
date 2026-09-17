DROP INDEX `objects_collectable`;--> statement-breakpoint
ALTER TABLE `objects` ADD `unreferenced_at` integer;--> statement-breakpoint
UPDATE `objects` SET `unreferenced_at` = cast(strftime('%s', 'now') as integer) * 1000 WHERE `ref_count` = 0;--> statement-breakpoint
CREATE INDEX `objects_collectable` ON `objects` (`ref_count`,`unreferenced_at`);
