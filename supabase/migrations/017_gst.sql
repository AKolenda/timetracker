-- Print the GST/HST registration number on invoices, and mark non-resident clients as zero-rated.
alter table public.settings add column if not exists gst_number text not null default '';

alter table public.clients add column if not exists gst_zero_rated boolean not null default false;
-- Every client on file when GST registration began is outside Canada.
update public.clients set gst_zero_rated = true;

-- An invoice keeps the GST details it was issued with.
alter table public.invoices add column if not exists gst_number text;
alter table public.invoices add column if not exists gst_zero_rated boolean not null default false;
