-- Two tabs approving the same Agent Time drafts each saved the same blocks, so time was counted twice.
-- An entry with the same project, start and end as a saved one is never new work: refuse it.
-- The per-project lock makes a second, simultaneous insert wait and then see the first.
create or replace function public.reject_duplicate_time_entry() returns trigger language plpgsql set search_path = public as $$
begin
  if new.end_time is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('time_entries:' || new.project_id));
  if exists (select 1 from public.time_entries where project_id = new.project_id and start_time = new.start_time and end_time = new.end_time) then
    raise exception 'This time is already saved' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_duplicate_time_entry on public.time_entries;
create trigger reject_duplicate_time_entry before insert on public.time_entries
  for each row execute function public.reject_duplicate_time_entry();
