-- Run after migration 011. Every fixture is rolled back.
begin;
do $$
declare
  c text := gen_random_uuid()::text;
  p text := gen_random_uuid()::text;
  e text := gen_random_uuid()::text;
  i text := gen_random_uuid()::text;
  started timestamptz := '2020-01-01T12:00:00Z';
  ended timestamptz := '2020-01-01T12:30:00Z';
begin
  insert into clients(id,name) values(c,'Background title test');
  insert into projects(id,client_id,name) values(p,c,'Background title test');
  insert into time_entries(id,project_id,description,start_time,end_time,duration,agent_time_sources,agent_time_title_status)
    values(e,p,'Original',started,ended,1800,'[]','pending');
  if not finish_agent_time_title(e,'Original',started,ended,'[]','Generated',false) then raise exception 'Completion rejected'; end if;
  if not exists(select 1 from time_entries where id=e and description='Generated' and agent_time_title_status is null and duration=1800) then raise exception 'Completion failed'; end if;
  update time_entries set agent_time_title_status='pending' where id=e;
  perform finish_agent_time_title(e,'Generated',started,ended,'[]',null,true);
  if not exists(select 1 from time_entries where id=e and description='Generated' and agent_time_title_status='failed') then raise exception 'Failure lost fallback'; end if;
  update time_entries set description='Manual',agent_time_title_status='pending' where id=e;
  if finish_agent_time_title(e,'Generated',started,ended,'[]','Stale result',false) then raise exception 'Manual edit overwritten'; end if;
  if not exists(select 1 from time_entries where id=e and description='Manual') then raise exception 'Manual edit lost'; end if;
  insert into invoices(id,invoice_number,client_id) values(i,'test-'||i,c);
  insert into invoice_line_items(invoice_id,type,source_id) values(i,'time',e);
  if finish_agent_time_title(e,'Manual',started,ended,'[]','Late result',false) then raise exception 'Invoiced entry renamed'; end if;
  if not exists(select 1 from time_entries where id=e and description='Manual' and agent_time_title_status is null) then raise exception 'Invoiced title changed'; end if;
  delete from time_entries where id=e;
  if finish_agent_time_title(e,'Manual',started,ended,'[]','Deleted result',false) then raise exception 'Deleted entry recreated'; end if;
end;
$$;
rollback;
