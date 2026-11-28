-- Data model for the full-cycle skate training workflow.
-- Existing progression tables are retained so prior records are not deleted.

create table if not exists public.skate_trick_families (
  id text primary key,
  name text not null unique,
  sort_order integer not null unique
);

create table if not exists public.skate_tricks (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.skate_trick_families(id) on delete restrict,
  name text not null,
  sort_order integer not null,
  unique (family_id, name)
);

create table if not exists public.skate_stances (
  id text primary key,
  sort_order integer not null unique
);

create table if not exists public.skate_meta_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.skate_level_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.skate_trick_stance_eligibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_id uuid not null references public.skate_tricks(id) on delete restrict,
  stance_id text not null references public.skate_stances(id) on delete restrict,
  eligible boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, trick_id, stance_id)
);

create table if not exists public.skate_progression_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_id uuid not null references public.skate_tricks(id) on delete restrict,
  stance_id text not null references public.skate_stances(id) on delete restrict,
  label_id uuid not null references public.skate_level_labels(id) on delete cascade,
  position integer not null check (position > 0),
  unique (user_id, trick_id, stance_id, position),
  unique (user_id, trick_id, stance_id, label_id)
);

alter table public.skate_progression_stages
  drop constraint if exists skate_progression_stages_label_id_fkey;
alter table public.skate_progression_stages
  add constraint skate_progression_stages_label_id_fkey
  foreign key (label_id) references public.skate_level_labels(id) on delete cascade;

create table if not exists public.skate_trick_stance_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_id uuid not null references public.skate_tricks(id) on delete restrict,
  stance_id text not null references public.skate_stances(id) on delete restrict,
  current_stage_id uuid references public.skate_progression_stages(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, trick_id, stance_id)
);

create table if not exists public.skate_training_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sets_per_trick integer not null default 3 check (sets_per_trick between 1 and 10),
  attempts_per_set integer not null default 5 check (attempts_per_set between 1 and 20),
  benchmark_landed integer not null default 3 check (
    benchmark_landed between 1 and attempts_per_set
  ),
  updated_at timestamptz not null default now()
);

create table if not exists public.skate_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_skill_id uuid not null references public.skate_meta_skills(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  eligible_combinations integer not null check (eligible_combinations >= 0),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.skate_cycle_eligible_combinations (
  cycle_id uuid not null references public.skate_cycles(id) on delete cascade,
  trick_id uuid not null references public.skate_tricks(id) on delete restrict,
  stance_id text not null references public.skate_stances(id) on delete restrict,
  progression_stage_id uuid references public.skate_progression_stages(id) on delete set null,
  progression_label_snapshot text,
  next_stage_id uuid references public.skate_progression_stages(id) on delete set null,
  next_label_snapshot text,
  primary key (cycle_id, trick_id, stance_id)
);

alter table public.skate_cycle_eligible_combinations
  add column if not exists progression_stage_id uuid
  references public.skate_progression_stages(id) on delete set null;
alter table public.skate_cycle_eligible_combinations
  add column if not exists progression_label_snapshot text;
alter table public.skate_cycle_eligible_combinations
  add column if not exists next_stage_id uuid
  references public.skate_progression_stages(id) on delete set null;
alter table public.skate_cycle_eligible_combinations
  add column if not exists next_label_snapshot text;

create unique index if not exists skate_cycles_one_active_per_user
  on public.skate_cycles (user_id)
  where status = 'active';

create unique index if not exists skate_cycles_one_draft_per_user
  on public.skate_cycles (user_id)
  where status = 'draft';

create table if not exists public.skate_cycle_sessions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.skate_cycles(id) on delete cascade,
  session_number integer not null check (session_number > 0),
  status text not null default 'planned' check (status in ('planned', 'completed')),
  completed_at timestamptz,
  unique (cycle_id, session_number)
);

create table if not exists public.skate_cycle_session_tricks (
  id uuid primary key default gen_random_uuid(),
  cycle_session_id uuid not null references public.skate_cycle_sessions(id) on delete cascade,
  superset text not null check (superset in ('A', 'B')),
  stance_id text not null references public.skate_stances(id) on delete restrict,
  trick_id uuid references public.skate_tricks(id) on delete restrict,
  progression_stage_id uuid references public.skate_progression_stages(id) on delete set null,
  progression_label_snapshot text,
  next_stage_id uuid references public.skate_progression_stages(id) on delete set null,
  next_label_snapshot text,
  unique (cycle_session_id, stance_id),
  check (
    (trick_id is null and progression_stage_id is null and next_stage_id is null)
    or trick_id is not null
  )
);

create table if not exists public.skate_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.skate_cycles(id) on delete restrict,
  cycle_session_id uuid not null unique references public.skate_cycle_sessions(id) on delete restrict,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 600),
  notes text not null default '',
  completed_at timestamptz not null default now()
);

create table if not exists public.skate_set_results (
  id uuid primary key default gen_random_uuid(),
  practice_session_id uuid not null references public.skate_practice_sessions(id) on delete cascade,
  cycle_session_trick_id uuid not null references public.skate_cycle_session_tricks(id) on delete restrict,
  set_number integer not null check (set_number > 0),
  attempts integer not null check (attempts > 0),
  landed integer not null check (landed between 0 and attempts),
  unique (practice_session_id, cycle_session_trick_id, set_number)
);

create table if not exists public.skate_progression_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_id uuid not null references public.skate_tricks(id) on delete restrict,
  stance_id text not null references public.skate_stances(id) on delete restrict,
  from_label text,
  to_label text not null,
  practice_session_id uuid not null references public.skate_practice_sessions(id) on delete restrict,
  cycle_session_trick_id uuid not null references public.skate_cycle_session_tricks(id) on delete restrict,
  advanced_at timestamptz not null default now()
);

create table if not exists public.skate_cycle_session_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_session_id uuid not null unique references public.skate_cycle_sessions(id) on delete cascade,
  set_results jsonb not null check (jsonb_typeof(set_results) = 'array'),
  duration_minutes integer not null default 60 check (duration_minutes between 1 and 600),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.skate_cycle_session_drafts
  add column if not exists duration_minutes integer not null default 60
  check (duration_minutes between 1 and 600);
alter table public.skate_cycle_session_drafts
  add column if not exists notes text not null default '';

create index if not exists skate_eligibility_user_trick
  on public.skate_trick_stance_eligibility (user_id, trick_id, stance_id);

create index if not exists skate_stages_user_trick_stance
  on public.skate_progression_stages (user_id, trick_id, stance_id, position);

create index if not exists skate_cycles_user_status
  on public.skate_cycles (user_id, status, created_at desc);

create index if not exists skate_practice_sessions_user_completed
  on public.skate_practice_sessions (user_id, completed_at desc);

create index if not exists skate_progression_history_user_advanced
  on public.skate_progression_history (user_id, advanced_at desc);

insert into public.skate_trick_families (id, name, sort_order)
values
  ('flatground', 'Flatground', 1),
  ('grinds', 'Grinds', 2),
  ('slides', 'Slides', 3),
  ('manuals', 'Manuals', 4),
  ('transition', 'Transition', 5)
on conflict (id) do update
set name = excluded.name, sort_order = excluded.sort_order;

insert into public.skate_stances (id, sort_order)
values ('Regular', 1), ('Switch', 2), ('Nollie', 3), ('Fakie', 4)
on conflict (id) do update set sort_order = excluded.sort_order;

with seed(family_id, name, sort_order) as (
  values
    ('flatground', 'Ollie', 1),
    ('flatground', 'BS Shuvit', 2),
    ('flatground', 'FS Shuvit', 3),
    ('flatground', 'BS 180', 4),
    ('flatground', 'FS 180', 5),
    ('flatground', 'Kickflip', 6),
    ('flatground', 'Heelflip', 7),
    ('grinds', '50-50', 1),
    ('grinds', '5-0', 2),
    ('grinds', 'Nosegrind', 3),
    ('grinds', 'Feeble', 4),
    ('grinds', 'Smith', 5),
    ('grinds', 'Crook', 6),
    ('slides', 'Boardslide', 1),
    ('slides', 'Lipslide', 2),
    ('slides', 'Noseslide', 3),
    ('slides', 'Tailslide', 4),
    ('manuals', 'Manual', 1),
    ('manuals', 'Nosemanual', 2),
    ('transition', 'Rock to fakie', 1),
    ('transition', 'Rock n roll', 2),
    ('transition', 'Axle stall', 3),
    ('transition', '50-50', 4),
    ('transition', '5-0', 5),
    ('transition', 'Disaster', 6)
)
insert into public.skate_tricks (family_id, name, sort_order)
select family_id, name, sort_order from seed
on conflict (family_id, name) do update set sort_order = excluded.sort_order;

do $$
begin
  if (select count(*) from public.skate_tricks) <> 25 then
    raise exception 'The skate training catalog must contain exactly 25 tricks.';
  end if;
  if not exists (
    select 1
    from public.skate_tricks transition_5050
    join public.skate_tricks grind_5050 on grind_5050.name = transition_5050.name
    where transition_5050.family_id = 'transition'
      and grind_5050.family_id = 'grinds'
      and transition_5050.id <> grind_5050.id
  ) then
    raise exception 'Transition 50-50 and Grind 50-50 must remain separate tricks.';
  end if;
  if not exists (
    select 1
    from public.skate_tricks transition_50
    join public.skate_tricks grind_50 on grind_50.name = transition_50.name
    where transition_50.family_id = 'transition'
      and grind_50.family_id = 'grinds'
      and transition_50.name = '5-0'
      and transition_50.id <> grind_50.id
  ) then
    raise exception 'Transition 5-0 and Grind 5-0 must remain separate tricks.';
  end if;
end;
$$;

alter table public.skate_trick_families enable row level security;
alter table public.skate_tricks enable row level security;
alter table public.skate_stances enable row level security;
alter table public.skate_meta_skills enable row level security;
alter table public.skate_level_labels enable row level security;
alter table public.skate_trick_stance_eligibility enable row level security;
alter table public.skate_progression_stages enable row level security;
alter table public.skate_trick_stance_progress enable row level security;
alter table public.skate_training_settings enable row level security;
alter table public.skate_cycles enable row level security;
alter table public.skate_cycle_eligible_combinations enable row level security;
alter table public.skate_cycle_sessions enable row level security;
alter table public.skate_cycle_session_tricks enable row level security;
alter table public.skate_practice_sessions enable row level security;
alter table public.skate_set_results enable row level security;
alter table public.skate_progression_history enable row level security;
alter table public.skate_cycle_session_drafts enable row level security;

drop policy if exists "Authenticated users can read skate families" on public.skate_trick_families;
create policy "Authenticated users can read skate families"
  on public.skate_trick_families for select to authenticated using (true);

drop policy if exists "Authenticated users can read skate tricks" on public.skate_tricks;
create policy "Authenticated users can read skate tricks"
  on public.skate_tricks for select to authenticated using (true);

drop policy if exists "Authenticated users can read skate stances" on public.skate_stances;
create policy "Authenticated users can read skate stances"
  on public.skate_stances for select to authenticated using (true);

drop policy if exists "Users manage their skate meta-skills" on public.skate_meta_skills;
create policy "Users manage their skate meta-skills"
  on public.skate_meta_skills for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their skate labels" on public.skate_level_labels;
create policy "Users manage their skate labels"
  on public.skate_level_labels for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their skate eligibility" on public.skate_trick_stance_eligibility;
create policy "Users manage their skate eligibility"
  on public.skate_trick_stance_eligibility for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read their skate stages" on public.skate_progression_stages;
create policy "Users read their skate stages"
  on public.skate_progression_stages for select using (auth.uid() = user_id);

drop policy if exists "Users read their skate stance progress" on public.skate_trick_stance_progress;
create policy "Users read their skate stance progress"
  on public.skate_trick_stance_progress for select using (auth.uid() = user_id);

drop policy if exists "Users manage their skate settings" on public.skate_training_settings;
create policy "Users manage their skate settings"
  on public.skate_training_settings for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read their skate cycles" on public.skate_cycles;
create policy "Users read their skate cycles"
  on public.skate_cycles for select using (auth.uid() = user_id);

drop policy if exists "Users read their skate cycle eligibility snapshot" on public.skate_cycle_eligible_combinations;
create policy "Users read their skate cycle eligibility snapshot"
  on public.skate_cycle_eligible_combinations for select using (
    exists (
      select 1 from public.skate_cycles cycle
      where cycle.id = cycle_id and cycle.user_id = auth.uid()
    )
  );

drop policy if exists "Users read their skate cycle sessions" on public.skate_cycle_sessions;
create policy "Users read their skate cycle sessions"
  on public.skate_cycle_sessions for select using (
    exists (
      select 1 from public.skate_cycles cycle
      where cycle.id = cycle_id and cycle.user_id = auth.uid()
    )
  );

drop policy if exists "Users read their skate cycle session tricks" on public.skate_cycle_session_tricks;
create policy "Users read their skate cycle session tricks"
  on public.skate_cycle_session_tricks for select using (
    exists (
      select 1
      from public.skate_cycle_sessions cycle_session
      join public.skate_cycles cycle on cycle.id = cycle_session.cycle_id
      where cycle_session.id = cycle_session_id and cycle.user_id = auth.uid()
    )
  );

drop policy if exists "Users read their skate practice sessions" on public.skate_practice_sessions;
create policy "Users read their skate practice sessions"
  on public.skate_practice_sessions for select using (auth.uid() = user_id);

drop policy if exists "Users read their skate set results" on public.skate_set_results;
create policy "Users read their skate set results"
  on public.skate_set_results for select using (
    exists (
      select 1 from public.skate_practice_sessions practice
      where practice.id = practice_session_id and practice.user_id = auth.uid()
    )
  );

drop policy if exists "Users read their skate progression history" on public.skate_progression_history;
create policy "Users read their skate progression history"
  on public.skate_progression_history for select using (auth.uid() = user_id);

drop policy if exists "Users manage their skate session drafts" on public.skate_cycle_session_drafts;
create policy "Users manage their skate session drafts"
  on public.skate_cycle_session_drafts for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on public.skate_trick_families, public.skate_tricks, public.skate_stances
  to authenticated;
grant select, insert, update, delete on public.skate_meta_skills, public.skate_level_labels
  to authenticated;
grant select, update on public.skate_trick_stance_eligibility to authenticated;
grant select, insert, update on public.skate_training_settings to authenticated;
grant select on public.skate_cycle_session_drafts to authenticated;
grant select on public.skate_progression_stages, public.skate_trick_stance_progress,
  public.skate_cycles, public.skate_cycle_eligible_combinations,
  public.skate_cycle_sessions, public.skate_cycle_session_tricks,
  public.skate_practice_sessions, public.skate_set_results, public.skate_progression_history
  to authenticated;

create or replace function public.seed_skate_training_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.skate_meta_skills (user_id, name, sort_order)
  values
    (p_user_id, 'Speed control', 1),
    (p_user_id, 'Balance', 2),
    (p_user_id, 'Flow / floating', 3),
    (p_user_id, 'Impact absorption', 4),
    (p_user_id, 'Foot placement / awareness', 5),
    (p_user_id, 'Rotation — shoulder and hip separation', 6),
    (p_user_id, 'Loading', 7),
    (p_user_id, 'Timing the pop', 8),
    (p_user_id, 'Scooping', 9),
    (p_user_id, 'Flicking / front-foot coordination', 10),
    (p_user_id, 'Centre of mass / weight distribution', 11),
    (p_user_id, 'Maintaining momentum', 12)
  on conflict (user_id, name) do nothing;

  insert into public.skate_trick_stance_eligibility (user_id, trick_id, stance_id)
  select p_user_id, trick.id, stance.id
  from public.skate_tricks trick
  cross join public.skate_stances stance
  on conflict (user_id, trick_id, stance_id) do nothing;

  insert into public.skate_trick_stance_progress (user_id, trick_id, stance_id)
  select p_user_id, trick.id, stance.id
  from public.skate_tricks trick
  cross join public.skate_stances stance
  on conflict (user_id, trick_id, stance_id) do nothing;

  insert into public.skate_training_settings (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.handle_new_skate_training_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_skate_training_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_skate_training on auth.users;
create trigger on_auth_user_created_skate_training
  after insert on auth.users
  for each row execute function public.handle_new_skate_training_user();

do $$
declare
  existing_user record;
begin
  for existing_user in select id from auth.users loop
    perform public.seed_skate_training_user(existing_user.id);
  end loop;
end;
$$;

create or replace function public.write_skate_cycle_sessions(
  p_cycle_id uuid,
  p_sessions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_sessions integer;
  expected_combinations integer;
  supplied_sessions integer;
  supplied_combinations integer;
  distinct_combinations integer;
begin
  if jsonb_typeof(p_sessions) is distinct from 'array' then
    raise exception 'Cycle sessions must be an array.';
  end if;

  select greatest(
    count(*) filter (where eligibility.stance_id = 'Regular'),
    count(*) filter (where eligibility.stance_id = 'Switch'),
    count(*) filter (where eligibility.stance_id = 'Nollie'),
    count(*) filter (where eligibility.stance_id = 'Fakie')
  ), count(*)
  into expected_sessions, expected_combinations
  from public.skate_cycle_eligible_combinations eligibility
  where eligibility.cycle_id = p_cycle_id;

  select count(*), count(distinct session.session_number)
  into supplied_sessions, distinct_combinations
  from jsonb_to_recordset(p_sessions) as session(
    session_number integer,
    regular_trick_id uuid,
    switch_trick_id uuid,
    nollie_trick_id uuid,
    fakie_trick_id uuid
  );
  if expected_sessions = 0 or supplied_sessions <> expected_sessions
     or supplied_sessions <> distinct_combinations then
    raise exception 'Generate one session for every eligible stance slot.';
  end if;

  if exists (
    select 1
    from (
      select session.session_number
      from jsonb_to_recordset(p_sessions) as session(
        session_number integer,
        regular_trick_id uuid,
        switch_trick_id uuid,
        nollie_trick_id uuid,
        fakie_trick_id uuid
      )
    ) supplied
    where supplied.session_number is null
       or supplied.session_number < 1
  ) or (
    select min(session_number) from jsonb_to_recordset(p_sessions)
      as session(session_number integer)
  ) <> 1 or (
    select max(session_number) from jsonb_to_recordset(p_sessions)
      as session(session_number integer)
  ) <> supplied_sessions then
    raise exception 'Cycle session numbers must be consecutive and start at one.';
  end if;

  with supplied_assignments as (
    select session.regular_trick_id as trick_id, 'Regular'::text as stance_id
    from jsonb_to_recordset(p_sessions) as session(
      regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
    )
    union all
    select session.switch_trick_id, 'Switch'::text
    from jsonb_to_recordset(p_sessions) as session(
      regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
    )
    union all
    select session.nollie_trick_id, 'Nollie'::text
    from jsonb_to_recordset(p_sessions) as session(
      regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
    )
    union all
    select session.fakie_trick_id, 'Fakie'::text
    from jsonb_to_recordset(p_sessions) as session(
      regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
    )
  )
  select count(*) filter (where trick_id is not null),
         count(distinct (trick_id, stance_id)) filter (where trick_id is not null)
  into supplied_combinations, distinct_combinations
  from supplied_assignments;

  if supplied_combinations <> expected_combinations
     or distinct_combinations <> expected_combinations then
    raise exception 'A cycle must include every eligible trick and stance exactly once.';
  end if;

  if exists (
    with supplied_assignments as (
      select session.regular_trick_id as trick_id, 'Regular'::text as stance_id
      from jsonb_to_recordset(p_sessions) as session(
        regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
      )
      union all
      select session.switch_trick_id, 'Switch'::text
      from jsonb_to_recordset(p_sessions) as session(
        regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
      )
      union all
      select session.nollie_trick_id, 'Nollie'::text
      from jsonb_to_recordset(p_sessions) as session(
        regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
      )
      union all
      select session.fakie_trick_id, 'Fakie'::text
      from jsonb_to_recordset(p_sessions) as session(
        regular_trick_id uuid, switch_trick_id uuid, nollie_trick_id uuid, fakie_trick_id uuid
      )
    )
    select 1
    from supplied_assignments assignment
    left join public.skate_cycle_eligible_combinations eligibility
      on eligibility.cycle_id = p_cycle_id
      and eligibility.trick_id = assignment.trick_id
      and eligibility.stance_id = assignment.stance_id
    where assignment.trick_id is not null and eligibility.trick_id is null
  ) then
    raise exception 'The generated cycle contains an excluded or unavailable combination.';
  end if;

  delete from public.skate_cycle_sessions where cycle_id = p_cycle_id;

  insert into public.skate_cycle_sessions (cycle_id, session_number)
  select p_cycle_id, session.session_number
  from jsonb_to_recordset(p_sessions) as session(
    session_number integer,
    regular_trick_id uuid,
    switch_trick_id uuid,
    nollie_trick_id uuid,
    fakie_trick_id uuid
  )
  order by session.session_number;

  insert into public.skate_cycle_session_tricks (
    cycle_session_id, superset, stance_id, trick_id, progression_stage_id,
    progression_label_snapshot, next_stage_id, next_label_snapshot
  )
  select
    cycle_session.id,
    assignment.superset,
    assignment.stance_id,
    assignment.trick_id,
    progression_snapshot.progression_stage_id,
    progression_snapshot.progression_label_snapshot,
    progression_snapshot.next_stage_id,
    progression_snapshot.next_label_snapshot
  from jsonb_to_recordset(p_sessions) as session(
    session_number integer,
    regular_trick_id uuid,
    switch_trick_id uuid,
    nollie_trick_id uuid,
    fakie_trick_id uuid
  )
  join public.skate_cycle_sessions cycle_session
    on cycle_session.cycle_id = p_cycle_id
    and cycle_session.session_number = session.session_number
  cross join lateral (values
    ('A'::text, 'Regular'::text, session.regular_trick_id),
    ('A'::text, 'Switch'::text, session.switch_trick_id),
    ('B'::text, 'Nollie'::text, session.nollie_trick_id),
    ('B'::text, 'Fakie'::text, session.fakie_trick_id)
  ) as assignment(superset, stance_id, trick_id)
  left join public.skate_cycle_eligible_combinations progression_snapshot
    on progression_snapshot.cycle_id = p_cycle_id
    and progression_snapshot.trick_id = assignment.trick_id
    and progression_snapshot.stance_id = assignment.stance_id;
end;
$$;

create or replace function public.create_skate_cycle_draft(
  p_meta_skill_id uuid,
  p_sessions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  cycle_id uuid;
  eligible_count integer;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if not exists (
    select 1 from public.skate_meta_skills
    where id = p_meta_skill_id and user_id = current_user_id
  ) then raise exception 'Choose one of your meta-skills.'; end if;
  if exists (
    select 1 from public.skate_cycles
    where user_id = current_user_id and status = 'active'
  ) then raise exception 'Complete the active cycle before creating another.'; end if;

  if exists (
    select 1 from public.skate_cycles
    where user_id = current_user_id and status = 'draft'
  ) then raise exception 'Delete or regenerate the existing cycle draft first.'; end if;

  select count(*) into eligible_count
  from public.skate_trick_stance_eligibility
  where user_id = current_user_id and eligible;

  insert into public.skate_cycles (user_id, meta_skill_id, eligible_combinations)
  values (current_user_id, p_meta_skill_id, eligible_count)
  returning id into cycle_id;

  insert into public.skate_cycle_eligible_combinations (
    cycle_id, trick_id, stance_id, progression_stage_id,
    progression_label_snapshot, next_stage_id, next_label_snapshot
  )
  select
    cycle_id,
    eligibility.trick_id,
    eligibility.stance_id,
    current_stage.id,
    current_label.name,
    next_stage.id,
    next_label.name
  from public.skate_trick_stance_eligibility eligibility
  left join public.skate_trick_stance_progress progress
    on progress.user_id = current_user_id
    and progress.trick_id = eligibility.trick_id
    and progress.stance_id = eligibility.stance_id
  left join public.skate_progression_stages current_stage
    on current_stage.id = progress.current_stage_id
    and current_stage.user_id = current_user_id
  left join public.skate_level_labels current_label
    on current_label.id = current_stage.label_id
    and current_label.user_id = current_user_id
  left join lateral (
    select stage.id, stage.label_id
    from public.skate_progression_stages stage
    where stage.user_id = current_user_id
      and stage.trick_id = eligibility.trick_id
      and stage.stance_id = eligibility.stance_id
      and current_stage.id is not null
      and stage.position > current_stage.position
    order by stage.position
    limit 1
  ) next_stage on true
  left join public.skate_level_labels next_label
    on next_label.id = next_stage.label_id
    and next_label.user_id = current_user_id
  where eligibility.user_id = current_user_id and eligibility.eligible;

  perform public.write_skate_cycle_sessions(cycle_id, p_sessions);
  return cycle_id;
end;
$$;

create or replace function public.regenerate_skate_cycle_draft(
  p_cycle_id uuid,
  p_sessions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if not exists (
    select 1 from public.skate_cycles
    where id = p_cycle_id and user_id = current_user_id and status = 'draft'
    for update
  ) then raise exception 'The cycle draft was not found.'; end if;

  update public.skate_cycles
  set eligible_combinations = (
    select count(*) from public.skate_cycle_eligible_combinations
    where cycle_id = p_cycle_id
  ),
  created_at = now()
  where id = p_cycle_id and user_id = current_user_id;

  perform public.write_skate_cycle_sessions(p_cycle_id, p_sessions);
end;
$$;

create or replace function public.confirm_skate_cycle(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if exists (
    select 1 from public.skate_cycles
    where user_id = current_user_id and status = 'active'
  ) then raise exception 'An active cycle already exists.'; end if;
  if not exists (
    select 1 from public.skate_cycles cycle
    where cycle.id = p_cycle_id
      and cycle.user_id = current_user_id
      and cycle.status = 'draft'
      and cycle.eligible_combinations > 0
      and exists (
        select 1 from public.skate_cycle_sessions session
        where session.cycle_id = cycle.id
      )
    for update
  ) then raise exception 'Generate a non-empty cycle draft before confirming it.'; end if;

  update public.skate_cycles
  set status = 'active', confirmed_at = now()
  where id = p_cycle_id and user_id = current_user_id and status = 'draft';
end;
$$;

create or replace function public.delete_skate_cycle_draft(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  delete from public.skate_cycles
  where id = p_cycle_id and user_id = auth.uid() and status = 'draft';
  if not found then raise exception 'The cycle draft was not found.'; end if;
end;
$$;

create or replace function public.validate_skate_session_results(
  p_user_id uuid,
  p_cycle_session_id uuid,
  p_results jsonb,
  p_sets_per_trick integer,
  p_attempts_per_set integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_tricks integer;
  supplied_tricks integer;
  distinct_tricks integer;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Session results must be an array.';
  end if;

  select count(*) into expected_tricks
  from public.skate_cycle_session_tricks assignment
  where assignment.cycle_session_id = p_cycle_session_id
    and assignment.trick_id is not null;

  select count(*), count(distinct result.assignment_id)
  into supplied_tricks, distinct_tricks
  from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb);

  if supplied_tricks <> expected_tricks or distinct_tricks <> expected_tricks then
    raise exception 'Enter results for every scheduled trick exactly once.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb)
    left join public.skate_cycle_session_tricks assignment
      on assignment.id = result.assignment_id
      and assignment.cycle_session_id = p_cycle_session_id
      and assignment.trick_id is not null
    where assignment.id is null
  ) then
    raise exception 'A result does not belong to this session.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb)
    where jsonb_typeof(result.sets) is distinct from 'array'
       or jsonb_array_length(case
            when jsonb_typeof(result.sets) = 'array' then result.sets
            else '[]'::jsonb
          end) <> p_sets_per_trick
  ) then
    raise exception 'Each trick needs the configured number of set results.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb)
    cross join lateral jsonb_array_elements(result.sets) as attempt(value)
    where attempt.value::text !~ '^[0-9]+$'
  ) then
    raise exception 'Landed attempts must be whole numbers.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb)
    cross join lateral jsonb_array_elements(result.sets) as attempt(value)
    where case
      when attempt.value::text ~ '^[0-9]+$' then attempt.value::text::integer
      else -1
    end not between 0 and p_attempts_per_set
  ) then
    raise exception 'Landed attempts must be within the configured attempt count.';
  end if;
end;
$$;

create or replace function public.save_skate_session_draft(
  p_cycle_session_id uuid,
  p_results jsonb,
  p_duration_minutes integer,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  settings public.skate_training_settings%rowtype;
  session_number integer;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 600 then
    raise exception 'Session duration must be between 1 and 600 minutes.';
  end if;

  select training_settings.* into settings
  from public.skate_training_settings training_settings
  where training_settings.user_id = current_user_id;
  if not found then raise exception 'Training settings were not found.'; end if;

  select cycle_session.session_number into session_number
  from public.skate_cycle_sessions cycle_session
  join public.skate_cycles cycle on cycle.id = cycle_session.cycle_id
  where cycle_session.id = p_cycle_session_id
    and cycle.user_id = current_user_id
    and cycle.status = 'active'
    and cycle_session.status = 'planned';
  if not found then raise exception 'The active session was not found.'; end if;
  if exists (
    select 1
    from public.skate_cycle_sessions previous_session
    join public.skate_cycle_sessions current_session
      on current_session.cycle_id = previous_session.cycle_id
    where current_session.id = p_cycle_session_id
      and previous_session.session_number < current_session.session_number
      and previous_session.status <> 'completed'
  ) then raise exception 'Complete earlier sessions before editing this session.'; end if;

  perform public.validate_skate_session_results(
    current_user_id, p_cycle_session_id, p_results,
    settings.sets_per_trick, settings.attempts_per_set
  );

  insert into public.skate_cycle_session_drafts (
    user_id, cycle_session_id, set_results, duration_minutes, notes, updated_at
  )
  values (
    current_user_id, p_cycle_session_id, p_results, p_duration_minutes,
    coalesce(nullif(trim(p_notes), ''), ''), now()
  )
  on conflict (cycle_session_id) do update
  set set_results = excluded.set_results,
      duration_minutes = excluded.duration_minutes,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  where public.skate_cycle_session_drafts.user_id = current_user_id;
end;
$$;

create or replace function public.complete_skate_session(
  p_cycle_session_id uuid,
  p_duration_minutes integer,
  p_notes text,
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_cycle_id uuid;
  session_number integer;
  settings public.skate_training_settings%rowtype;
  new_practice_id uuid;
  progression record;
  current_stage_id uuid;
  advancements integer := 0;
  total_landed integer := 0;
  cycle_is_complete boolean := false;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 600 then
    raise exception 'Session duration must be between 1 and 600 minutes.';
  end if;

  select cycle_session.cycle_id, cycle_session.session_number
  into current_cycle_id, session_number
  from public.skate_cycle_sessions cycle_session
  join public.skate_cycles cycle on cycle.id = cycle_session.cycle_id
  where cycle_session.id = p_cycle_session_id
    and cycle.user_id = current_user_id
    and cycle.status = 'active'
    and cycle_session.status = 'planned'
  for update of cycle_session;
  if not found then raise exception 'The active session was not found.'; end if;
  if exists (
    select 1
    from public.skate_cycle_sessions previous_session
    where previous_session.cycle_id = current_cycle_id
      and previous_session.session_number < session_number
      and previous_session.status <> 'completed'
  ) then raise exception 'Complete earlier sessions before finishing this session.'; end if;

  select training_settings.* into settings
  from public.skate_training_settings training_settings
  where training_settings.user_id = current_user_id
  for update;
  if not found then raise exception 'Training settings were not found.'; end if;

  perform public.validate_skate_session_results(
    current_user_id, p_cycle_session_id, p_results,
    settings.sets_per_trick, settings.attempts_per_set
  );

  insert into public.skate_practice_sessions (
    user_id, cycle_id, cycle_session_id, duration_minutes, notes
  )
  values (
    current_user_id, current_cycle_id, p_cycle_session_id,
    p_duration_minutes, coalesce(nullif(trim(p_notes), ''), '')
  )
  returning id into new_practice_id;

  insert into public.skate_set_results (
    practice_session_id, cycle_session_trick_id, set_number, attempts, landed
  )
  select
    new_practice_id,
    result.assignment_id,
    attempt.ordinality::integer,
    settings.attempts_per_set,
    attempt.value::text::integer
  from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb)
  cross join lateral jsonb_array_elements(result.sets)
    with ordinality as attempt(value, ordinality);

  select coalesce(sum(attempt.value::text::integer), 0)::integer into total_landed
  from jsonb_to_recordset(p_results) as result(assignment_id uuid, sets jsonb)
  cross join lateral jsonb_array_elements(result.sets) as attempt(value);

  for progression in
    select
      assignment.id as assignment_id,
      assignment.trick_id,
      assignment.stance_id,
      assignment.progression_stage_id,
      assignment.progression_label_snapshot,
      assignment.next_stage_id,
      assignment.next_label_snapshot,
      count(*) filter (where set_result.landed >= settings.benchmark_landed) as passed_sets
    from public.skate_cycle_session_tricks assignment
    join public.skate_set_results set_result
      on set_result.cycle_session_trick_id = assignment.id
      and set_result.practice_session_id = new_practice_id
    where assignment.cycle_session_id = p_cycle_session_id
      and assignment.trick_id is not null
    group by
      assignment.id, assignment.trick_id, assignment.stance_id,
      assignment.progression_stage_id, assignment.progression_label_snapshot,
      assignment.next_stage_id, assignment.next_label_snapshot
    having count(*) filter (where set_result.landed >= settings.benchmark_landed)
      >= ceil(settings.sets_per_trick * 2.0 / 3.0)
  loop
    select progress.current_stage_id into current_stage_id
    from public.skate_trick_stance_progress progress
    where progress.user_id = current_user_id
      and progress.trick_id = progression.trick_id
      and progress.stance_id = progression.stance_id
    for update;

    if current_stage_id = progression.progression_stage_id
       and progression.next_stage_id is not null
       and progression.next_label_snapshot is not null then
      update public.skate_trick_stance_progress
      set current_stage_id = progression.next_stage_id, updated_at = now()
      where user_id = current_user_id
        and trick_id = progression.trick_id
        and stance_id = progression.stance_id;

      insert into public.skate_progression_history (
        user_id, trick_id, stance_id, from_label, to_label,
        practice_session_id, cycle_session_trick_id
      )
      values (
        current_user_id, progression.trick_id, progression.stance_id,
        progression.progression_label_snapshot, progression.next_label_snapshot,
        new_practice_id, progression.assignment_id
      );
      advancements := advancements + 1;
    end if;
  end loop;

  update public.skate_cycle_sessions
  set status = 'completed', completed_at = now()
  where id = p_cycle_session_id;
  delete from public.skate_cycle_session_drafts
  where cycle_session_id = p_cycle_session_id and user_id = current_user_id;

  select not exists (
    select 1 from public.skate_cycle_sessions
    where cycle_id = current_cycle_id and status <> 'completed'
  ) into cycle_is_complete;
  if cycle_is_complete then
    update public.skate_cycles
    set status = 'completed', completed_at = now()
    where id = current_cycle_id and user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'practice_session_id', new_practice_id,
    'cycle_completed', cycle_is_complete,
    'total_landed', total_landed,
    'progression_advancements', advancements
  );
end;
$$;

create or replace function public.set_skate_trick_eligibility(
  p_trick_id uuid,
  p_eligible boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  changed_rows integer;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if p_eligible is null then raise exception 'Choose whether to include or exclude this trick.'; end if;

  update public.skate_trick_stance_eligibility
  set eligible = p_eligible, updated_at = now()
  where user_id = current_user_id and trick_id = p_trick_id;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 4 then
    raise exception 'Trick eligibility was incomplete. Reload the app and try again.';
  end if;
end;
$$;

create or replace function public.save_skate_progression_stages(
  p_trick_id uuid,
  p_stance_id text,
  p_label_ids uuid[],
  p_confirm_stage_change boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  requested_labels uuid[] := coalesce(p_label_ids, '{}'::uuid[]);
  existing_labels uuid[];
  current_stage_id uuid;
  current_label_id uuid;
  current_position integer;
  next_current_stage_id uuid;
  sequence_changed boolean;
  active_stage_affected boolean := false;
  active_cycle_uses_sequence boolean;
  old_current_index integer;
  new_current_index integer;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if not exists (select 1 from public.skate_tricks where id = p_trick_id) then
    raise exception 'The trick was not found.';
  end if;
  if not exists (select 1 from public.skate_stances where id = p_stance_id) then
    raise exception 'Choose a valid stance.';
  end if;

  if cardinality(requested_labels) <> (
    select count(distinct label_id) from unnest(requested_labels) as labels(label_id)
  ) then raise exception 'A progression cannot use the same label more than once.'; end if;
  if exists (
    select 1
    from unnest(requested_labels) as requested(label_id)
    left join public.skate_level_labels label
      on label.id = requested.label_id and label.user_id = current_user_id
    where label.id is null
  ) then raise exception 'A progression label was not found for this account.'; end if;

  select array_agg(stage.label_id order by stage.position)
  into existing_labels
  from public.skate_progression_stages stage
  where stage.user_id = current_user_id
    and stage.trick_id = p_trick_id
    and stage.stance_id = p_stance_id;
  existing_labels := coalesce(existing_labels, '{}'::uuid[]);
  sequence_changed := existing_labels is distinct from requested_labels;

  select progress.current_stage_id into current_stage_id
  from public.skate_trick_stance_progress progress
  where progress.user_id = current_user_id
    and progress.trick_id = p_trick_id
    and progress.stance_id = p_stance_id
  for update;
  if not found then raise exception 'Trick progression was not initialized.'; end if;

  select stage.label_id, stage.position
  into current_label_id, current_position
  from public.skate_progression_stages stage
  where stage.id = current_stage_id and stage.user_id = current_user_id;

  if sequence_changed and current_label_id is not null then
    old_current_index := array_position(existing_labels, current_label_id);
    new_current_index := array_position(requested_labels, current_label_id);
    active_stage_affected := new_current_index is null
      or old_current_index is distinct from new_current_index
      or existing_labels[old_current_index + 1]
        is distinct from requested_labels[new_current_index + 1];
  end if;

  select exists (
    select 1
    from public.skate_cycles cycle
    join public.skate_cycle_sessions cycle_session on cycle_session.cycle_id = cycle.id
    join public.skate_cycle_session_tricks assignment
      on assignment.cycle_session_id = cycle_session.id
    where cycle.user_id = current_user_id
      and cycle.status = 'active'
      and assignment.trick_id = p_trick_id
      and assignment.stance_id = p_stance_id
  ) into active_cycle_uses_sequence;

  if sequence_changed
     and (active_stage_affected or active_cycle_uses_sequence)
     and not coalesce(p_confirm_stage_change, false) then
    raise exception 'This change affects the active progression or confirmed cycle. Confirm the change to continue.';
  end if;

  update public.skate_progression_stages
  set position = position + 100000
  where user_id = current_user_id
    and trick_id = p_trick_id
    and stance_id = p_stance_id;

  delete from public.skate_progression_stages stage
  where stage.user_id = current_user_id
    and stage.trick_id = p_trick_id
    and stage.stance_id = p_stance_id
    and not (stage.label_id = any(requested_labels));

  insert into public.skate_progression_stages (
    user_id, trick_id, stance_id, label_id, position
  )
  select current_user_id, p_trick_id, p_stance_id, requested.label_id, requested.position::integer
  from unnest(requested_labels) with ordinality as requested(label_id, position)
  on conflict (user_id, trick_id, stance_id, label_id) do update
  set position = excluded.position;

  if current_label_id is not null and current_label_id = any(requested_labels) then
    select stage.id into next_current_stage_id
    from public.skate_progression_stages stage
    where stage.user_id = current_user_id
      and stage.trick_id = p_trick_id
      and stage.stance_id = p_stance_id
      and stage.label_id = current_label_id;
  elsif cardinality(requested_labels) > 0 then
    select stage.id into next_current_stage_id
    from public.skate_progression_stages stage
    where stage.user_id = current_user_id
      and stage.trick_id = p_trick_id
      and stage.stance_id = p_stance_id
      and stage.position = greatest(
        1,
        least(coalesce(current_position, 1), cardinality(requested_labels))
      );
  else
    next_current_stage_id := null;
  end if;

  update public.skate_trick_stance_progress
  set current_stage_id = next_current_stage_id, updated_at = now()
  where user_id = current_user_id
    and trick_id = p_trick_id
    and stance_id = p_stance_id;
end;
$$;

revoke all on function public.seed_skate_training_user(uuid) from public;
revoke all on function public.handle_new_skate_training_user() from public;
revoke all on function public.write_skate_cycle_sessions(uuid, jsonb) from public;
revoke all on function public.validate_skate_session_results(uuid, uuid, jsonb, integer, integer) from public;
revoke all on function public.create_skate_cycle_draft(uuid, jsonb) from public;
revoke all on function public.regenerate_skate_cycle_draft(uuid, jsonb) from public;
revoke all on function public.confirm_skate_cycle(uuid) from public;
revoke all on function public.delete_skate_cycle_draft(uuid) from public;
revoke all on function public.save_skate_session_draft(uuid, jsonb, integer, text) from public;
revoke all on function public.complete_skate_session(uuid, integer, text, jsonb) from public;
revoke all on function public.set_skate_trick_eligibility(uuid, boolean) from public;
revoke all on function public.save_skate_progression_stages(uuid, text, uuid[], boolean) from public;
grant execute on function public.create_skate_cycle_draft(uuid, jsonb) to authenticated;
grant execute on function public.regenerate_skate_cycle_draft(uuid, jsonb) to authenticated;
grant execute on function public.confirm_skate_cycle(uuid) to authenticated;
grant execute on function public.delete_skate_cycle_draft(uuid) to authenticated;
grant execute on function public.save_skate_session_draft(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.complete_skate_session(uuid, integer, text, jsonb) to authenticated;
grant execute on function public.set_skate_trick_eligibility(uuid, boolean) to authenticated;
grant execute on function public.save_skate_progression_stages(uuid, text, uuid[], boolean) to authenticated;

notify pgrst, 'reload schema';
