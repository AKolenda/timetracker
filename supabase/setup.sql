-- TimeTracker — Full database setup
-- Run this once in your Supabase SQL Editor (or via the CLI)

-- ============================================================
-- Tables
-- ============================================================

create table if not exists clients (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  color text not null default '#6366f1',
  invoice_email text not null default '',
  invoice_schedule_weeks int,
  last_invoice_sent timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key default gen_random_uuid()::text,
  client_id text not null references clients(id) on delete cascade,
  name text not null,
  rate numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'completed', 'on-hold')),
  created_at timestamptz not null default now()
);

create table if not exists time_entries (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references projects(id) on delete cascade,
  description text not null default '',
  start_time timestamptz not null,
  end_time timestamptz,
  duration int not null default 0,
  billable boolean not null default true,
  date date not null default current_date
);

create table if not exists expenses (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references projects(id) on delete cascade,
  description text not null default '',
  amount numeric(12,2) not null default 0,
  category text not null default 'Other',
  date date not null default current_date,
  notes text not null default '',
  invoiced boolean not null default false
);

create table if not exists settings (
  id text primary key default 'default',
  business_name text not null default '',
  business_email text not null default '',
  business_phone text not null default '',
  business_address text not null default '',
  remittance_first_name text not null default '',
  remittance_last_name text not null default '',
  remittance_bank_name text not null default '',
  remittance_routing_number text not null default '',
  remittance_account_number text not null default '',
  remittance_notes text not null default '',
  invoice_prefix text not null default 'INV-',
  next_invoice_number int not null default 1001,
  payout_currency text not null default 'USD',
  payout_min_amount numeric(12,2) not null default 50,
  payout_notes text not null default ''
);

create table if not exists invoices (
  id text primary key default gen_random_uuid()::text,
  invoice_number text not null unique,
  client_id text not null references clients(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue')),
  issue_date date not null default current_date,
  due_date date not null default (current_date + interval '30 days')::date,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists invoice_line_items (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references invoices(id) on delete cascade,
  description text not null default '',
  quantity numeric(10,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  type text not null default 'time' check (type in ('time', 'expense')),
  source_id text
);

-- Default settings row
insert into settings (id) values ('default') on conflict (id) do nothing;

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists idx_projects_client_id on projects(client_id);
create index if not exists idx_time_entries_project_id on time_entries(project_id);
create index if not exists idx_time_entries_date on time_entries(date);
create index if not exists idx_expenses_project_id on expenses(project_id);
create index if not exists idx_expenses_date on expenses(date);
create index if not exists idx_expenses_invoiced on expenses(invoiced);
create index if not exists idx_invoices_client_id on invoices(client_id);
create index if not exists idx_invoice_line_items_invoice_id on invoice_line_items(invoice_id);

-- ============================================================
-- Row Level Security (open for single-user app)
-- ============================================================

alter table clients enable row level security;
alter table projects enable row level security;
alter table time_entries enable row level security;
alter table expenses enable row level security;
alter table settings enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

create policy "Allow all" on clients for all using (true) with check (true);
create policy "Allow all" on projects for all using (true) with check (true);
create policy "Allow all" on time_entries for all using (true) with check (true);
create policy "Allow all" on expenses for all using (true) with check (true);
create policy "Allow all" on settings for all using (true) with check (true);
create policy "Allow all" on invoices for all using (true) with check (true);
create policy "Allow all" on invoice_line_items for all using (true) with check (true);
