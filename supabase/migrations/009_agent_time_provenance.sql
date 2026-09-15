-- Machine labels are user settings; chat provenance survives approval.
alter table public.settings add column if not exists agent_time_host_labels jsonb not null default '{}'::jsonb;
alter table public.time_entries add column if not exists agent_time_sources jsonb not null default '[]'::jsonb;
