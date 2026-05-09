-- User timezone (IANA name; empty string means use browser default)
alter table settings add column if not exists timezone text not null default '';

-- Default net-due days for newly created invoices (0 = due on receipt)
alter table settings add column if not exists default_invoice_due_days integer not null default 30;
