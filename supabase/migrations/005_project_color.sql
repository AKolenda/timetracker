-- Per-project color override (empty string falls back to client color in the UI)
alter table projects add column if not exists color text not null default '';
