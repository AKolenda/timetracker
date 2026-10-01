-- Charge a share of tracked time, set per chat and stored on each entry for invoicing.
alter table public.time_entries add column if not exists bill_factor numeric(5,4) not null default 1
  check (bill_factor between 0 and 1);
alter table public.settings add column if not exists agent_time_chat_bill_factors jsonb not null default '{}'::jsonb;
