CREATE TABLE IF NOT EXISTS `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_sessions_expiry` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `administrators` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `administrators_username_unique` ON `administrators` (`username`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `changes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `changes_channel` ON `changes` (`channel_id`,`sequence`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `channel_members` (
	`channel_id` text NOT NULL,
	`device_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `device_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `channel_members_device` ON `channel_members` (`device_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `clipboard_items` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`origin_device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`visible` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`origin_device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `clipboard_items_page` ON `clipboard_items` (`channel_id`,`visible`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `clipboard_items_origin` ON `clipboard_items` (`origin_device_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `device_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`secret_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `device_keys_device` ON `device_keys` (`device_id`,`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`icon_kind` text NOT NULL,
	`state` text DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer DEFAULT 0 NOT NULL,
	`disabled_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `materialization_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`active_key` text,
	`channel_id` text NOT NULL,
	`item_id` text NOT NULL,
	`content_id` text NOT NULL,
	`source_device_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `materialization_requests_active_key_unique` ON `materialization_requests` (`active_key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `materialization_waiters` (
	`request_id` text NOT NULL,
	`transfer_id` text NOT NULL,
	`requester_kind` text NOT NULL,
	`requester_id` text NOT NULL,
	PRIMARY KEY(`request_id`, `transfer_id`),
	FOREIGN KEY (`request_id`) REFERENCES `materialization_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `objects` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`path` text NOT NULL,
	`ref_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `objects_collectable` ON `objects` (`ref_count`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `objects_sha256_size` ON `objects` (`sha256`,`size`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `previews` (
	`item_id` text NOT NULL,
	`id` text NOT NULL,
	`content_id` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`truncated` integer NOT NULL,
	`object_id` text,
	PRIMARY KEY(`item_id`, `id`),
	FOREIGN KEY (`item_id`) REFERENCES `clipboard_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `representations` (
	`item_id` text NOT NULL,
	`id` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`delivery` text NOT NULL,
	`availability` text NOT NULL,
	`object_id` text,
	PRIMARY KEY(`item_id`, `id`),
	FOREIGN KEY (`item_id`) REFERENCES `clipboard_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`direction` text NOT NULL,
	`state` text NOT NULL,
	`completed_bytes` integer NOT NULL,
	`total_bytes` integer NOT NULL,
	`peer_device_ids` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transfers_device` ON `transfers` (`device_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transfers_state` ON `transfers` (`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `upload_objects` (
	`upload_id` text NOT NULL,
	`object_kind` text NOT NULL,
	`object_id` text NOT NULL,
	`expected_size` integer NOT NULL,
	`expected_sha256` text NOT NULL,
	`mime_type` text NOT NULL,
	`stored_object_id` text,
	`uploaded_at` integer,
	PRIMARY KEY(`upload_id`, `object_kind`, `object_id`),
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stored_object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`device_id` text NOT NULL,
	`transfer_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`work_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `work_queue` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`source_device_id` text NOT NULL,
	`request_id` text NOT NULL,
	`item_id` text NOT NULL,
	`content_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `materialization_requests`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `work_queue_id_unique` ON `work_queue` (`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `work_device` ON `work_queue` (`source_device_id`,`sequence`);--> statement-breakpoint
INSERT OR IGNORE INTO `metadata` (`key`, `value`) VALUES ('revision', '1');
