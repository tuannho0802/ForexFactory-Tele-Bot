CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id  BIGINT UNIQUE NOT NULL,
  username     TEXT,
  first_name   TEXT,
  language     TEXT DEFAULT 'vi',
  timezone     TEXT DEFAULT 'Asia/Ho_Chi_Minh',
  is_active    BOOLEAN DEFAULT true,
  is_banned    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_hash      TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  currency        TEXT NOT NULL,
  impact          TEXT CHECK (impact IN ('High', 'Medium', 'Low', 'Holiday')),
  event_date      DATE NOT NULL,
  event_time      TIME,
  forecast        TEXT,
  previous        TEXT,
  actual          TEXT,
  detail_url      TEXT,
  first_seen_at   TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  scan_batch_id   TEXT
);

CREATE INDEX idx_events_date     ON events(event_date);
CREATE INDEX idx_events_impact   ON events(impact);
CREATE INDEX idx_events_currency ON events(currency);
CREATE INDEX idx_events_datetime ON events(event_date, event_time);

CREATE TABLE user_settings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  morning_enabled  BOOLEAN DEFAULT true,
  morning_time     TIME DEFAULT '08:00:00',
  alert_enabled    BOOLEAN DEFAULT true,
  alert_minutes    INTEGER DEFAULT 15 CHECK (alert_minutes BETWEEN 1 AND 120),
  impact_filter    TEXT[] DEFAULT '{"High"}',
  currency_filter  TEXT[],
  UNIQUE(user_id)
);

CREATE TABLE notification_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key   TEXT UNIQUE NOT NULL,
  user_id           UUID REFERENCES users(id),
  event_id          UUID REFERENCES events(id),
  type              TEXT CHECK (type IN ('new_event', 'morning_briefing', 'pre_alert', 'actual_update')),
  status            TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_msg         TEXT,
  sent_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notif_key  ON notification_log(idempotency_key);
CREATE INDEX idx_notif_user ON notification_log(user_id, sent_at);

CREATE TABLE scan_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id      TEXT UNIQUE NOT NULL,
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  events_found  INTEGER DEFAULT 0,
  events_new    INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error_msg     TEXT,
  source        TEXT DEFAULT 'forexfactory'
);

CREATE TABLE bot_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO bot_config VALUES
  ('scraping_enabled', 'true', now()),
  ('notification_enabled', 'true', now()),
  ('max_events_per_message', '10', now());
