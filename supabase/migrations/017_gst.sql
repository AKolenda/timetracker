-- Print the GST/HST number on invoices, and mark non-resident clients as zero-rated.
alter table public.settings add column if not exists gst_number text not null default '';

-- Every client on file when GST registration began is outside Canada. Backfill only when
-- the column is first added, so a re-run never undoes a client later marked Canadian.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'gst_zero_rated'
  ) then
    alter table public.clients add column gst_zero_rated boolean not null default false;
    update public.clients set gst_zero_rated = true;
  end if;
end $$;

-- An invoice keeps the GST details it was issued with.
alter table public.invoices add column if not exists gst_number text;
alter table public.invoices add column if not exists gst_zero_rated boolean not null default false;
