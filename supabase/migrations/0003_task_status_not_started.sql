-- Add 'not_started' to the tasks.status enum and make it the new default.
-- Drop any existing status check constraint by name (auto-generated names vary
-- across PostgreSQL versions, so we look it up dynamically), then re-add.

do $$
declare r record;
begin
  for r in (
    select conname from pg_constraint
    where conrelid = 'tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%in (%'
  ) loop
    execute 'alter table tasks drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

alter table tasks
  alter column status set default 'not_started';

alter table tasks
  add constraint tasks_status_check
  check (status in ('not_started','planning','in_progress','on_hold','complete'));
