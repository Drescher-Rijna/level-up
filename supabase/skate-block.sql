-- Six-week skate block. Additive only: creates new tables and functions and never
-- alters or updates existing tables, so it is safe to run on a live project and to re-run.
-- Run this file on its own; do not re-run schema.sql to apply it.

create table if not exists public.skate_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season_quest_id uuid references public.training_quests(id) on delete set null,
  start_date date not null,
  review_date date not null,
  benchmark_weeks smallint[] not null default '{1,3,6}',
  is_locked boolean not null default true,
  focus_cue text not null default '',
  benchmark_spot text not null default '',
  gym_days smallint[] not null default '{}',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (review_date > start_date),
  unique (user_id, start_date)
);

create table if not exists public.block_projects (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.skate_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order smallint not null,
  name text not null,
  role text not null check (role in ('main', 'nemesis', 'warmup', 'vehicle', 'saturday')),
  location text not null default '',
  trains text not null default '',
  metric text not null check (metric in ('clean_of_10', 'distance', 'rung')),
  unique (block_id, name)
);

create table if not exists public.block_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.block_projects(id) on delete cascade,
  week smallint not null check (week between 1 and 6),
  tested_on date not null,
  attempts text[] check (attempts is null or (cardinality(attempts) = 10 and attempts <@ array['clean', 'miss'])),
  value numeric check (value is null or value >= 0),
  conditions text not null default '',
  video_url text not null default '',
  created_at timestamptz not null default now(),
  check (attempts is not null or value is not null)
);

create index if not exists block_benchmark_runs_user_project
  on public.block_benchmark_runs (user_id, project_id, week);

create table if not exists public.block_day_overrides (
  block_id uuid not null references public.skate_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  override_date date not null,
  session_kind text not null check (session_kind in ('free', 'rest')),
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (block_id, override_date)
);

create table if not exists public.block_parking_lot (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.skate_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null check (length(trim(idea)) > 0),
  decision text check (decision in ('adopted', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one parking-lot idea may change the plan per block.
create unique index if not exists block_parking_lot_one_adopted
  on public.block_parking_lot (block_id)
  where decision = 'adopted';

create table if not exists public.block_recovery_checks (
  block_id uuid not null references public.skate_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  lower_back_soreness smallint not null check (lower_back_soreness between 0 and 5),
  has_pain boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (block_id, session_date)
);

create or replace function public.create_skate_block(
  p_start_date date,
  p_focus_cue text,
  p_benchmark_spot text,
  p_gym_days integer[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_block_id uuid;
  v_season_quest_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to start a skate block.';
  end if;
  if p_start_date is null then
    raise exception 'Choose a start date for the block.';
  end if;
  if exists (select 1 from unnest(coalesce(p_gym_days, '{}')) as gym_day where gym_day not between 0 and 6) then
    raise exception 'Gym days must be weekdays 0 (Sunday) through 6 (Saturday).';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select id into v_block_id
  from public.skate_blocks
  where user_id = v_user_id and start_date = p_start_date;
  if found then
    return v_block_id;
  end if;

  if exists (
    select 1 from public.skate_blocks
    where user_id = v_user_id and reviewed_at is null and review_date >= p_start_date
  ) then
    raise exception 'Review the current block before starting another.';
  end if;

  select id into v_season_quest_id
  from public.training_quests
  where user_id = v_user_id and status = 'active'
  limit 1;
  if v_season_quest_id is null then
    raise exception 'Start a season before starting a block; the block sits inside the active season.';
  end if;

  insert into public.skate_blocks (user_id, season_quest_id, start_date, review_date, focus_cue, benchmark_spot, gym_days)
  values (
    v_user_id,
    v_season_quest_id,
    p_start_date,
    p_start_date + 40,
    coalesce(trim(p_focus_cue), ''),
    coalesce(trim(p_benchmark_spot), ''),
    coalesce(p_gym_days, '{}')::smallint[]
  )
  returning id into v_block_id;

  insert into public.block_projects (block_id, user_id, sort_order, name, role, location, trains, metric)
  values
    (v_block_id, v_user_id, 1, 'Heelflip 50-50', 'main', 'Challenge block', 'Flip-to-target precision', 'clean_of_10'),
    (v_block_id, v_user_id, 2, 'Crooked grind', 'nemesis', 'Challenge block, smaller dose', 'Front-truck weight and lock', 'clean_of_10'),
    (v_block_id, v_user_id, 3, 'Tre flip', 'warmup', '~5 attempts most sessions', 'Scoop + flick timing', 'clean_of_10'),
    (v_block_id, v_user_id, 4, 'Manual pad', 'vehicle', 'Focus block', 'Fore-aft weight control', 'distance'),
    (v_block_id, v_user_id, 5, 'Heelflip gap', 'saturday', 'Speed day, attempt cap', 'Pop at speed, commitment', 'clean_of_10'),
    (v_block_id, v_user_id, 6, 'Rail ladder', 'saturday', 'Low rails', 'Rail exposure', 'rung');

  return v_block_id;
end;
$$;

create or replace function public.log_block_benchmark(
  p_project_id uuid,
  p_week integer,
  p_tested_on date,
  p_attempts text[],
  p_value numeric,
  p_conditions text,
  p_video_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metric text;
  v_run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to log a benchmark.';
  end if;

  select metric into v_metric
  from public.block_projects
  where id = p_project_id and user_id = auth.uid();
  if not found then
    raise exception 'The benchmark must belong to one of your block projects.';
  end if;
  if p_week is null or p_week not between 1 and 6 or p_tested_on is null then
    raise exception 'Enter a block week from 1 to 6 and a test date.';
  end if;
  if v_metric = 'clean_of_10' and (p_attempts is null or cardinality(p_attempts) <> 10) then
    raise exception 'Record all 10 attempts as clean or miss.';
  end if;
  if v_metric = 'distance' and (p_value is null or p_value < 0) then
    raise exception 'Enter the manual distance as a non-negative number.';
  end if;
  if v_metric = 'rung' and (p_value is null or p_value not in (1, 2, 3, 4)) then
    raise exception 'Choose the current rail ladder rung (1 to 4).';
  end if;

  insert into public.block_benchmark_runs (user_id, project_id, week, tested_on, attempts, value, conditions, video_url)
  values (
    auth.uid(),
    p_project_id,
    p_week,
    p_tested_on,
    case when v_metric = 'clean_of_10' then p_attempts else null end,
    case when v_metric = 'clean_of_10' then null else p_value end,
    coalesce(trim(p_conditions), ''),
    coalesce(trim(p_video_url), '')
  )
  returning id into v_run_id;
  return v_run_id;
end;
$$;

create or replace function public.set_block_day_override(
  p_block_id uuid,
  p_override_date date,
  p_session_kind text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to change a block day.';
  end if;
  if not exists (
    select 1 from public.skate_blocks
    where id = p_block_id and user_id = auth.uid()
      and p_override_date between start_date and review_date
  ) then
    raise exception 'The day must fall inside one of your blocks.';
  end if;

  if p_session_kind is null then
    delete from public.block_day_overrides
    where block_id = p_block_id and override_date = p_override_date and user_id = auth.uid();
    return;
  end if;
  if p_session_kind not in ('free', 'rest') then
    raise exception 'A day can only be swapped to a free session or rest.';
  end if;

  insert into public.block_day_overrides (block_id, user_id, override_date, session_kind, reason)
  values (p_block_id, auth.uid(), p_override_date, p_session_kind, coalesce(trim(p_reason), ''))
  on conflict (block_id, override_date) do update set
    session_kind = excluded.session_kind,
    reason = excluded.reason;
end;
$$;

create or replace function public.add_parking_lot_idea(p_block_id uuid, p_idea text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idea_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to park an idea.';
  end if;
  if length(trim(coalesce(p_idea, ''))) = 0 then
    raise exception 'Write the idea before parking it.';
  end if;
  if not exists (
    select 1 from public.skate_blocks
    where id = p_block_id and user_id = auth.uid() and reviewed_at is null
  ) then
    raise exception 'Ideas can only be parked on an unreviewed block of yours.';
  end if;

  insert into public.block_parking_lot (block_id, user_id, idea)
  values (p_block_id, auth.uid(), trim(p_idea))
  returning id into v_idea_id;
  return v_idea_id;
end;
$$;

create or replace function public.log_block_recovery_check(
  p_block_id uuid,
  p_session_date date,
  p_lower_back_soreness integer,
  p_has_pain boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to log a recovery check.';
  end if;
  if p_lower_back_soreness is null or p_lower_back_soreness not between 0 and 5 then
    raise exception 'Rate lower-back soreness from 0 to 5.';
  end if;
  if not exists (
    select 1 from public.skate_blocks
    where id = p_block_id and user_id = auth.uid()
      and p_session_date between start_date and review_date
  ) then
    raise exception 'The session must fall inside one of your blocks.';
  end if;

  insert into public.block_recovery_checks (block_id, user_id, session_date, lower_back_soreness, has_pain, note)
  values (p_block_id, auth.uid(), p_session_date, p_lower_back_soreness, coalesce(p_has_pain, false), coalesce(trim(p_note), ''))
  on conflict (block_id, session_date) do update set
    lower_back_soreness = excluded.lower_back_soreness,
    has_pain = excluded.has_pain,
    note = excluded.note;
end;
$$;

create or replace function public.complete_block_review(p_block_id uuid, p_adopted_idea_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to review a block.';
  end if;
  perform 1 from public.skate_blocks
  where id = p_block_id and user_id = auth.uid() and reviewed_at is null
  for update;
  if not found then
    raise exception 'This block is not yours or has already been reviewed.';
  end if;
  if exists (select 1 from public.skate_blocks where id = p_block_id and review_date > current_date) then
    raise exception 'The plan stays locked until the review date.';
  end if;
  if p_adopted_idea_id is not null and not exists (
    select 1 from public.block_parking_lot where id = p_adopted_idea_id and block_id = p_block_id
  ) then
    raise exception 'The adopted idea must come from this block''s parking lot.';
  end if;

  update public.block_parking_lot
  set decision = case when id = p_adopted_idea_id then 'adopted' else 'rejected' end,
      decided_at = now()
  where block_id = p_block_id and decision is null;

  update public.skate_blocks
  set reviewed_at = now(), is_locked = false
  where id = p_block_id;
end;
$$;

alter table public.skate_blocks enable row level security;
alter table public.block_projects enable row level security;
alter table public.block_benchmark_runs enable row level security;
alter table public.block_day_overrides enable row level security;
alter table public.block_parking_lot enable row level security;
alter table public.block_recovery_checks enable row level security;

-- Reads go through RLS; every write goes through the functions above.
drop policy if exists "Users can view their skate blocks" on public.skate_blocks;
create policy "Users can view their skate blocks" on public.skate_blocks for select using (auth.uid() = user_id);
drop policy if exists "Users can view their block projects" on public.block_projects;
create policy "Users can view their block projects" on public.block_projects for select using (auth.uid() = user_id);
drop policy if exists "Users can view their block benchmark runs" on public.block_benchmark_runs;
create policy "Users can view their block benchmark runs" on public.block_benchmark_runs for select using (auth.uid() = user_id);
drop policy if exists "Users can view their block day overrides" on public.block_day_overrides;
create policy "Users can view their block day overrides" on public.block_day_overrides for select using (auth.uid() = user_id);
drop policy if exists "Users can view their parking lot" on public.block_parking_lot;
create policy "Users can view their parking lot" on public.block_parking_lot for select using (auth.uid() = user_id);
drop policy if exists "Users can view their recovery checks" on public.block_recovery_checks;
create policy "Users can view their recovery checks" on public.block_recovery_checks for select using (auth.uid() = user_id);

grant select on public.skate_blocks, public.block_projects, public.block_benchmark_runs,
  public.block_day_overrides, public.block_parking_lot, public.block_recovery_checks to authenticated;

revoke all on function public.create_skate_block(date, text, text, integer[]) from public;
revoke all on function public.log_block_benchmark(uuid, integer, date, text[], numeric, text, text) from public;
revoke all on function public.set_block_day_override(uuid, date, text, text) from public;
revoke all on function public.add_parking_lot_idea(uuid, text) from public;
revoke all on function public.log_block_recovery_check(uuid, date, integer, boolean, text) from public;
revoke all on function public.complete_block_review(uuid, uuid) from public;
grant execute on function public.create_skate_block(date, text, text, integer[]) to authenticated;
grant execute on function public.log_block_benchmark(uuid, integer, date, text[], numeric, text, text) to authenticated;
grant execute on function public.set_block_day_override(uuid, date, text, text) to authenticated;
grant execute on function public.add_parking_lot_idea(uuid, text) to authenticated;
grant execute on function public.log_block_recovery_check(uuid, date, integer, boolean, text) to authenticated;
grant execute on function public.complete_block_review(uuid, uuid) to authenticated;
