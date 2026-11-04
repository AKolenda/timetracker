-- Link Agent Time folders (such as "Ascend") to a project, so their time imports there on every device.
alter table public.projects add column if not exists agent_folders text[] not null default '{}';
