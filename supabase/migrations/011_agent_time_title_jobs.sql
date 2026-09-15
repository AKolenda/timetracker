-- Pending titles survive refreshes. Existing entries are not queued by this migration.
alter table public.time_entries add column if not exists agent_time_title_status text
  check (agent_time_title_status in ('pending', 'failed'));

-- Apply a background result only to the exact entry that requested it.
create or replace function public.finish_agent_time_title(
  entry_id text, expected_description text, expected_start timestamptz,
  expected_end timestamptz, expected_sources jsonb, new_title text, failed boolean
) returns boolean language plpgsql set search_path = public as $$
declare
  entry public.time_entries%rowtype;
begin
  select * into entry from public.time_entries where id = entry_id for update;
  if not found or entry.agent_time_title_status is distinct from 'pending' then return false; end if;
  if entry.description is distinct from expected_description
    or entry.start_time is distinct from expected_start
    or entry.end_time is distinct from expected_end
    or entry.agent_time_sources is distinct from expected_sources then return false; end if;
  if exists (select 1 from public.invoice_line_items where type = 'time' and source_id = entry_id) then
    update public.time_entries set agent_time_title_status = null where id = entry_id;
    return false;
  end if;
  update public.time_entries set
    description = coalesce(nullif(trim(new_title), ''), description),
    agent_time_title_status = case when failed then 'failed' else null end
  where id = entry_id;
  return true;
end;
$$;
