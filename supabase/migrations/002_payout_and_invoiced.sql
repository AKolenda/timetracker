-- Add payout threshold settings
alter table settings add column if not exists payout_currency text not null default 'USD';
alter table settings add column if not exists payout_min_amount numeric(12,2) not null default 50;
alter table settings add column if not exists payout_notes text not null default '';

-- Track which expenses have been invoiced
alter table expenses add column if not exists invoiced boolean not null default false;

-- Index for filtering uninvoiced expenses
create index if not exists idx_expenses_invoiced on expenses(invoiced);
