-- Move scheduled invoice emails that land on a weekend to the Monday after (or the Friday before).
alter table public.settings add column if not exists invoice_weekend_rule text not null default 'monday'
  check (invoice_weekend_rule in ('monday', 'friday', 'weekend'));
