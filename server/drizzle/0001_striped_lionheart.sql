PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_admin_sessions` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`token_hash` text(64) NOT NULL,
	`uid` text(24) NOT NULL,
	`tenant_id` text(24),
	`permission_keys` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_admin_sessions`("id", "token_hash", "uid", "tenant_id", "permission_keys", "created_at", "last_seen_at", "expires_at", "revoked_at") SELECT "id", "token_hash", 'administrator', NULL, '[]', "created_at", "last_seen_at", "expires_at", NULL FROM `admin_sessions`;--> statement-breakpoint
DROP TABLE `admin_sessions`;--> statement-breakpoint
ALTER TABLE `__new_admin_sessions` RENAME TO `admin_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);
