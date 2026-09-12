CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS administrators (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  icon_kind TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'offline',
  last_seen_at INTEGER NOT NULL DEFAULT 0,
  disabled_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS device_keys (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS device_keys_device ON device_keys(device_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, device_id)
) STRICT;
CREATE INDEX IF NOT EXISTS channel_members_device ON channel_members(device_id, channel_id);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (sha256, size)
) STRICT;
CREATE INDEX IF NOT EXISTS objects_collectable ON objects(ref_count, created_at);

CREATE TABLE IF NOT EXISTS clipboard_items (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  origin_device_id TEXT NOT NULL REFERENCES devices(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  visible INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS clipboard_items_page ON clipboard_items(channel_id, visible, deleted_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS clipboard_items_origin ON clipboard_items(origin_device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS representations (
  item_id TEXT NOT NULL REFERENCES clipboard_items(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  delivery TEXT NOT NULL,
  availability TEXT NOT NULL,
  object_id TEXT REFERENCES objects(id),
  PRIMARY KEY (item_id, id)
) STRICT;

CREATE TABLE IF NOT EXISTS previews (
  item_id TEXT NOT NULL REFERENCES clipboard_items(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  truncated INTEGER NOT NULL,
  object_id TEXT REFERENCES objects(id),
  PRIMARY KEY (item_id, id)
) STRICT;

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  direction TEXT NOT NULL,
  state TEXT NOT NULL,
  completed_bytes INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  peer_device_ids TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS transfers_device ON transfers(device_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS transfers_state ON transfers(state, expires_at);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  transfer_id TEXT NOT NULL REFERENCES transfers(id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  work_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS upload_objects (
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  object_kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  expected_size INTEGER NOT NULL,
  expected_sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  stored_object_id TEXT REFERENCES objects(id),
  uploaded_at INTEGER,
  PRIMARY KEY (upload_id, object_kind, object_id)
) STRICT;

CREATE TABLE IF NOT EXISTS changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS changes_channel ON changes(channel_id, sequence);

CREATE TABLE IF NOT EXISTS materialization_requests (
  id TEXT PRIMARY KEY,
  active_key TEXT UNIQUE,
  channel_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  source_device_id TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS materialization_waiters (
  request_id TEXT NOT NULL REFERENCES materialization_requests(id) ON DELETE CASCADE,
  transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  requester_kind TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  PRIMARY KEY (request_id, transfer_id)
) STRICT;

CREATE TABLE IF NOT EXISTS work_queue (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  source_device_id TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES materialization_requests(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS work_device ON work_queue(source_device_id, sequence);

INSERT OR IGNORE INTO metadata(key, value) VALUES ('revision', '1');
