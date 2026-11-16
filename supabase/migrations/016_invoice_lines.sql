-- Entries that share an invoice line label (within a project) bill as one invoice line.
alter table public.time_entries add column if not exists invoice_line text;

-- A grouped line covers several entries; source_id keeps the first for older readers.
alter table public.invoice_line_items add column if not exists source_ids text[];

-- A title job must not rename an entry billed on a grouped line either.
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
  if exists (select 1 from public.invoice_line_items where type = 'time' and (source_id = entry_id or entry_id = any(source_ids))) then
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
