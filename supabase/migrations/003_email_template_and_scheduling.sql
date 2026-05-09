-- Email customization
alter table settings add column if not exists email_subject text not null default 'Invoice {{invoiceNumber}} from {{businessName}}';
alter table settings add column if not exists email_greeting text not null default 'Hi {{clientName}},

Please find your invoice below. Let me know if you have any questions.';
alter table settings add column if not exists email_signature text not null default 'Thanks,
{{businessName}}';
alter table settings add column if not exists email_accent_color text not null default '#111827';
alter table settings add column if not exists email_from_address text not null default '';

-- Scheduled invoice tracking (per-client schedule already exists via clients.invoice_schedule_weeks)
alter table clients add column if not exists invoice_schedule_anchor date;
alter table clients add column if not exists invoice_schedule_enabled boolean not null default false;
alter table clients add column if not exists invoice_schedule_auto_send boolean not null default true;

create index if not exists idx_clients_schedule_enabled on clients(invoice_schedule_enabled);
