-- Add status column to tasks
-- Backwards compatible: defaults to 'planning'; sync 'complete' with completed=true.

alter table tasks
  add column if not exists status text not null default 'planning'
  check (status in ('planning','in_progress','on_hold','complete'));

-- Backfill: rows previously marked completed should be 'complete'.
update tasks set status = 'complete' where completed = true and status = 'planning';

create index if not exists tasks_user_status_idx on tasks(user_id, status);
