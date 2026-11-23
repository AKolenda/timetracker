-- Where client replies to invoice emails go. Empty sends no Reply-To header.
alter table public.settings add column if not exists email_reply_to text not null default '';
