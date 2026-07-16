-- Shared per-day meta for the Question of the Day, so "spicy" is a MUTUAL
-- choice instead of each partner independently toggling it and answering
-- different questions. Before this, one person could answer the spicy
-- question while the other answered the normal one, and the reveal made no
-- sense. This tiny table is readable/writable by both members (unlike
-- zuya_daily_answers, whose rows are hidden until you've answered), so both
-- clients converge on the same question, and it locks once anyone answers.

create table if not exists zuya_daily_meta (
  day date primary key,
  question_idx int not null,
  spicy boolean not null default false,
  locked boolean not null default false,
  set_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

alter table zuya_daily_meta enable row level security;

drop policy if exists "zuya_meta_select" on zuya_daily_meta;
create policy "zuya_meta_select" on zuya_daily_meta for select
  using (zuya_is_member());

drop policy if exists "zuya_meta_insert" on zuya_daily_meta;
create policy "zuya_meta_insert" on zuya_daily_meta for insert
  with check (zuya_is_member());

drop policy if exists "zuya_meta_update" on zuya_daily_meta;
create policy "zuya_meta_update" on zuya_daily_meta for update
  using (zuya_is_member()) with check (zuya_is_member());

-- Realtime so a toggle by one partner shows up live for the other.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_daily_meta';
  exception when duplicate_object then
    null;
  end;
end $$;
