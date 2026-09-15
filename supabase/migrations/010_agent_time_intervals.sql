alter table public.settings add column if not exists agent_time_max_minutes integer check (agent_time_max_minutes between 1 and 1440);
