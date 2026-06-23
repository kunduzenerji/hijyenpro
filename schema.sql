CREATE TABLE IF NOT EXISTS reservations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  phone          TEXT    NOT NULL,
  service        TEXT    NOT NULL,
  date           TEXT    NOT NULL,
  time           TEXT    NOT NULL,
  duration_hours INTEGER,
  status         TEXT    NOT NULL DEFAULT 'pending',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
