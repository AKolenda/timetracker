-- Offer a second payment account (e.g. AUD) beside USD, and lock the conversion rate on each invoice when it is issued.
alter table public.settings add column if not exists secondary_remittance jsonb not null default '{}'::jsonb;
alter table public.clients add column if not exists show_secondary_currency boolean not null default false;
alter table public.invoices add column if not exists fx_currency text;
alter table public.invoices add column if not exists fx_rate numeric(18,8) check (fx_rate is null or fx_rate > 0);
alter table public.invoices add column if not exists fx_rate_date date;
