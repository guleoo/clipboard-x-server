CREATE INDEX `clipboard_items_cleanup_global` ON `clipboard_items` (`visible`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `clipboard_items_cleanup_device` ON `clipboard_items` (`origin_device_id`,`visible`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `clipboard_items_cleanup_device_channel` ON `clipboard_items` (`origin_device_id`,`channel_id`,`visible`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `materialization_requests_cleanup_item` ON `materialization_requests` (`item_id`,`active_key`,`expires_at`);--> statement-breakpoint
CREATE INDEX `uploads_cleanup_item` ON `uploads` (`item_id`,`state`,`expires_at`);