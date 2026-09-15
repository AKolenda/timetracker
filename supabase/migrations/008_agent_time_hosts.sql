-- Agent Time collectors configured from Settings → Agent Time Integrations.
-- JSONB keeps the ordered list intact while allowing an empty default.
alter table settings
  add column if not exists agent_time_hosts jsonb not null default '[]'::jsonb;
